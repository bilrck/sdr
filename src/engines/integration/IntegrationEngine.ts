import { repo, SDRConfig, IntegrationConfig, IntegrationLog } from '../../layers/database/repository.js';
import { outboundConnector } from '../../core/whatsapp/OutboundConnector.js';
import { flowEngine } from '../../core/flow/FlowEngine.js';

export interface ProcessResult {
  success: boolean;
  status: 'SUCCESS' | 'WARNING' | 'ERROR' | 'IGNORED';
  message: string;
  leadId?: string | null;
  leadPhone?: string | null;
  leadName?: string | null;
  logId?: string;
  messageSent?: string | null;
}

export interface ExtractedLeadData {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  formId?: string;
  pageId?: string;
  sheetName?: string;
  rowNumber?: number | string;
  customFields?: Record<string, any>;
}

export class IntegrationEngine {
  private static instance: IntegrationEngine;

  private constructor() {}

  public static getInstance(): IntegrationEngine {
    if (!IntegrationEngine.instance) {
      IntegrationEngine.instance = new IntegrationEngine();
    }
    return IntegrationEngine.instance;
  }

  // ==========================================
  //   META (FACEBOOK / INSTAGRAM) LEAD ADS
  // ==========================================

  /**
   * Valida o desafio de verificação da Meta (GET /webhook/meta/leadgen).
   * Retorna o challenge caso o token seja válido, ou null.
   */
  public async verifyMetaWebhook(tenantId: string, query: any): Promise<string | null> {
    const mode = query['hub.mode'] || query['mode'];
    const token = query['hub.verify_token'] || query['verify_token'];
    const challenge = query['hub.challenge'] || query['challenge'];

    if (mode !== 'subscribe' || !challenge) {
      console.warn('[IntegrationEngine] Meta Webhook: Modo ou desafio ausente na verificação.');
      return null;
    }

    const config = await repo.getIntegrationConfig(tenantId, 'META');
    const expectedToken = config?.verifyToken || process.env.META_VERIFY_TOKEN;

    if (!expectedToken || token === expectedToken) {
      console.log(`[IntegrationEngine] Meta Webhook verificado com sucesso para o Tenant ${tenantId}!`);
      return String(challenge);
    }

    console.warn(`[IntegrationEngine] Meta Webhook: Token recebido (${token}) não confere com o esperado.`);
    return null;
  }

  /**
   * Processa o evento de formulário preenchido (POST /webhook/meta/leadgen).
   */
  public async processMetaLeadgen(tenantId: string, rawPayload: any): Promise<ProcessResult> {
    console.log(`[IntegrationEngine] Recebendo evento Meta Lead Ads para o Tenant ${tenantId}...`);

    const config = await repo.getIntegrationConfig(tenantId, 'META');
    if (config && !config.isEnabled) {
      const log = await repo.createIntegrationLog({
        tenantId,
        provider: 'META',
        event: 'lead_received',
        status: 'IGNORED',
        rawPayload: JSON.stringify(rawPayload),
        errorMessage: 'Integração com a Meta está desativada para esta empresa.',
      });
      return { success: false, status: 'IGNORED', message: 'Integração Meta desativada', logId: log.id };
    }

    try {
      // 1. Extrair informações do payload (form_id, page_id, leadgen_id ou dados diretos)
      let leadgenId: string | null = null;
      let formId: string | null = null;
      let pageId: string | null = null;
      let fieldData: any[] = [];

      // Caso 1: Payload oficial do Meta Webhooks
      if (rawPayload?.entry && Array.isArray(rawPayload.entry)) {
        for (const entry of rawPayload.entry) {
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              if (change.value) {
                leadgenId = change.value.leadgen_id || leadgenId;
                formId = change.value.form_id || formId;
                pageId = change.value.page_id || pageId;
              }
            }
          }
        }
      }

      // Caso 2: Payload direto com field_data ou simulado
      if (rawPayload?.leadgen_id) leadgenId = rawPayload.leadgen_id;
      if (rawPayload?.form_id) formId = rawPayload.form_id;
      if (rawPayload?.page_id) pageId = rawPayload.page_id;
      if (Array.isArray(rawPayload?.field_data)) fieldData = rawPayload.field_data;

      // 2. Se temos leadgen_id e accessToken configurado, buscar dados completos na Meta Graph API
      if (leadgenId && config?.accessToken && fieldData.length === 0) {
        try {
          console.log(`[IntegrationEngine] Consultando Meta Graph API para leadgen_id: ${leadgenId}...`);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6000);

          const graphUrl = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${encodeURIComponent(config.accessToken.trim())}`;
          const res = await fetch(graphUrl, { signal: controller.signal });
          clearTimeout(timeout);

          if (res.ok) {
            const graphData = await res.json() as any;
            if (Array.isArray(graphData.field_data)) {
              fieldData = graphData.field_data;
              formId = graphData.form_id || formId;
            }
          } else {
            const errText = await res.text();
            console.warn(`[IntegrationEngine] Erro ao consultar Meta Graph API (${res.status}): ${errText}`);
          }
        } catch (apiErr: any) {
          console.warn('[IntegrationEngine] Timeout ou falha na Meta Graph API:', apiErr?.message);
        }
      }

      // 3. Validação de Filtros por Form ID ou Page ID
      if (config?.formIds && config.formIds.trim().length > 0) {
        const allowedForms = config.formIds.split(',').map(s => s.trim().toLowerCase());
        if (formId && !allowedForms.includes(formId.toLowerCase())) {
          const log = await repo.createIntegrationLog({
            tenantId,
            provider: 'META',
            event: 'lead_received',
            status: 'IGNORED',
            rawPayload: JSON.stringify(rawPayload),
            parsedData: JSON.stringify({ formId, pageId }),
            errorMessage: `Formulário ${formId} ignorado pois não está na lista de formulários permitidos (${config.formIds}).`,
          });
          return { success: false, status: 'IGNORED', message: `Formulário ${formId} não permitido pelo filtro`, logId: log.id };
        }
      }

      if (config?.pageIds && config.pageIds.trim().length > 0) {
        const allowedPages = config.pageIds.split(',').map(s => s.trim().toLowerCase());
        if (pageId && !allowedPages.includes(pageId.toLowerCase())) {
          const log = await repo.createIntegrationLog({
            tenantId,
            provider: 'META',
            event: 'lead_received',
            status: 'IGNORED',
            rawPayload: JSON.stringify(rawPayload),
            parsedData: JSON.stringify({ formId, pageId }),
            errorMessage: `Página ${pageId} ignorada pois não está na lista permitida.`,
          });
          return { success: false, status: 'IGNORED', message: `Página ${pageId} não permitida`, logId: log.id };
        }
      }

      // 4. Mapeamento de Campos
      let mapping: Record<string, string> = {};
      try {
        if (config?.fieldMapping) {
          mapping = JSON.parse(config.fieldMapping);
        }
      } catch (e) {
        mapping = {};
      }

      const extracted = this.extractFieldsFromMeta(fieldData, rawPayload, mapping);
      extracted.formId = formId || undefined;
      extracted.pageId = pageId || undefined;

      // 5. Normalizar Telefone
      const cleanPhone = this.normalizePhoneNumber(extracted.phone);

      // 6. Executar Ações
      return await this.executeIntegrationActions({
        tenantId,
        provider: 'META',
        config,
        rawPayload,
        extracted,
        cleanPhone,
      });

    } catch (err: any) {
      console.error('[IntegrationEngine] Erro fatal no processamento Meta:', err);
      const log = await repo.createIntegrationLog({
        tenantId,
        provider: 'META',
        event: 'lead_received',
        status: 'ERROR',
        rawPayload: JSON.stringify(rawPayload),
        errorMessage: err?.message || String(err),
      });
      return { success: false, status: 'ERROR', message: `Erro ao processar lead Meta: ${err?.message}`, logId: log.id };
    }
  }

  // ==========================================
  //   GOOGLE SHEETS (LINHA ADICIONADA)
  // ==========================================

  /**
   * Processa uma nova linha enviada pelo Google Sheets (POST /webhook/google-sheets/row).
   */
  public async processGoogleSheetsRow(
    tenantId: string,
    rawPayload: any,
    secretToken?: string
  ): Promise<ProcessResult> {
    console.log(`[IntegrationEngine] Recebendo evento Google Sheets para o Tenant ${tenantId}...`);

    const config = await repo.getIntegrationConfig(tenantId, 'GOOGLE_SHEETS');
    if (config && !config.isEnabled) {
      const log = await repo.createIntegrationLog({
        tenantId,
        provider: 'GOOGLE_SHEETS',
        event: 'row_added',
        status: 'IGNORED',
        rawPayload: JSON.stringify(rawPayload),
        errorMessage: 'Integração Google Sheets desativada para esta empresa.',
      });
      return { success: false, status: 'IGNORED', message: 'Integração Sheets desativada', logId: log.id };
    }

    // Validação de Secret Key se configurada
    if (config?.secretKey && config.secretKey.trim().length > 0) {
      const expected = config.secretKey.trim();
      const provided = secretToken || rawPayload?.secretToken || rawPayload?.token || rawPayload?.apiKey;
      if (provided !== expected) {
        const log = await repo.createIntegrationLog({
          tenantId,
          provider: 'GOOGLE_SHEETS',
          event: 'row_added',
          status: 'ERROR',
          rawPayload: JSON.stringify(rawPayload),
          errorMessage: 'Chave de segurança (secretKey) do Google Sheets inválida.',
        });
        return { success: false, status: 'ERROR', message: 'Token de segurança incorreto', logId: log.id };
      }
    }

    try {
      // 1. Extrair objeto com os dados da linha
      const rowData = rawPayload?.rowData || rawPayload?.row || rawPayload?.data || rawPayload || {};
      const sheetName = String(rawPayload?.sheetName || rowData?.sheetName || rowData?.aba || rowData?.planilha || '');
      const rowNumber = rawPayload?.rowNumber || rowData?.rowNumber || rowData?.linha || undefined;

      // 2. Filtro por nome de aba da planilha (sheetName) se configurado
      if (config?.sheetNames && config.sheetNames.trim().length > 0 && sheetName) {
        const allowedSheets = config.sheetNames.split(',').map(s => s.trim().toLowerCase());
        if (!allowedSheets.includes(sheetName.toLowerCase())) {
          const log = await repo.createIntegrationLog({
            tenantId,
            provider: 'GOOGLE_SHEETS',
            event: 'row_added',
            status: 'IGNORED',
            rawPayload: JSON.stringify(rawPayload),
            parsedData: JSON.stringify({ sheetName, rowNumber }),
            errorMessage: `Aba "${sheetName}" ignorada pelo filtro de abas permitidas (${config.sheetNames}).`,
          });
          return { success: false, status: 'IGNORED', message: `Aba "${sheetName}" não permitida`, logId: log.id };
        }
      }

      // 3. Mapeamento de Colunas
      let mapping: Record<string, string> = {};
      try {
        if (config?.fieldMapping) {
          mapping = JSON.parse(config.fieldMapping);
        }
      } catch (e) {
        mapping = {};
      }

      const extracted = this.extractFieldsFromSheets(rowData, mapping);
      extracted.sheetName = sheetName || undefined;
      extracted.rowNumber = rowNumber;

      // 4. Normalizar Telefone
      const cleanPhone = this.normalizePhoneNumber(extracted.phone);

      // 5. Executar Ações
      return await this.executeIntegrationActions({
        tenantId,
        provider: 'GOOGLE_SHEETS',
        config,
        rawPayload,
        extracted,
        cleanPhone,
      });

    } catch (err: any) {
      console.error('[IntegrationEngine] Erro fatal no processamento Google Sheets:', err);
      const log = await repo.createIntegrationLog({
        tenantId,
        provider: 'GOOGLE_SHEETS',
        event: 'row_added',
        status: 'ERROR',
        rawPayload: JSON.stringify(rawPayload),
        errorMessage: err?.message || String(err),
      });
      return { success: false, status: 'ERROR', message: `Erro ao processar linha Sheets: ${err?.message}`, logId: log.id };
    }
  }

  // ==========================================
  //   CONSUMO / REPROCESSAMENTO MANUAL
  // ==========================================

  /**
   * Consome ou reprocessa um evento de log anteriormente gravado.
   */
  public async consumeLogEvent(tenantId: string, logId: string): Promise<ProcessResult> {
    const log = await repo.getIntegrationLogById(logId);
    if (!log || log.tenantId !== tenantId) {
      return { success: false, status: 'ERROR', message: 'Registro de log não encontrado' };
    }

    let rawPayload: any = {};
    try {
      rawPayload = JSON.parse(log.rawPayload);
    } catch (e) {
      rawPayload = {};
    }

    console.log(`[IntegrationEngine] Reprocessando/Consumindo log ${logId} (${log.provider})...`);

    if (log.provider === 'META') {
      return await this.processMetaLeadgen(tenantId, rawPayload);
    } else {
      return await this.processGoogleSheetsRow(tenantId, rawPayload);
    }
  }

  // ==========================================
  //   SIMULAÇÃO DE TESTE
  // ==========================================

  /**
   * Gera um evento de teste simulado para Meta ou Google Sheets.
   */
  public async simulateTestEvent(
    tenantId: string,
    provider: 'META' | 'GOOGLE_SHEETS',
    customData?: { name?: string; phone?: string; email?: string }
  ): Promise<ProcessResult> {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const testName = customData?.name || `Lead Teste ${provider === 'META' ? 'Meta Ads' : 'Planilha'} ${randomSuffix}`;
    const testPhone = customData?.phone || `1199999${randomSuffix}`;
    const testEmail = customData?.email || `lead.teste${randomSuffix}@email.com`;

    if (provider === 'META') {
      const mockMetaPayload = {
        object: 'page',
        entry: [
          {
            id: 'page_123456789',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'leadgen',
                value: {
                  created_time: Math.floor(Date.now() / 1000),
                  leadgen_id: `leadgen_${Date.now()}`,
                  page_id: 'page_123456789',
                  form_id: 'form_simulacao_anuncio'
                }
              }
            ]
          }
        ],
        field_data: [
          { name: 'full_name', values: [testName] },
          { name: 'phone_number', values: [testPhone] },
          { name: 'email', values: [testEmail] },
          { name: 'cidade', values: ['São Paulo'] },
          { name: 'interesse', values: ['Imóvel Residencial'] }
        ]
      };
      return await this.processMetaLeadgen(tenantId, mockMetaPayload);
    } else {
      const mockSheetsPayload = {
        Nome: testName,
        Telefone: testPhone,
        Email: testEmail,
        Cidade: 'Campinas',
        Interesse: 'Apartamento 3 quartos',
        sheetName: 'Leads Setembro',
        rowNumber: 10 + Math.floor(Math.random() * 50)
      };
      return await this.processGoogleSheetsRow(tenantId, mockSheetsPayload);
    }
  }

  // ==========================================
  //   MÉTODOS INTERNOS & AUXILIARES
  // ==========================================

  /**
   * Executa a criação do lead, disparo de WhatsApp e fluxo após extração e validação.
   */
  private async executeIntegrationActions(params: {
    tenantId: string;
    provider: 'META' | 'GOOGLE_SHEETS';
    config: IntegrationConfig | null;
    rawPayload: any;
    extracted: ExtractedLeadData;
    cleanPhone: string | null;
  }): Promise<ProcessResult> {
    const { tenantId, provider, config, rawPayload, extracted, cleanPhone } = params;

    let lead: any = null;
    let messageSent: string | null = null;
    let status: 'SUCCESS' | 'WARNING' | 'ERROR' = 'SUCCESS';
    let statusMessage = '';

    if (!cleanPhone || cleanPhone.length < 8) {
      status = 'WARNING';
      statusMessage = `Lead recebido porém telefone inválido ou não informado ("${extracted.phone || ''}").`;
    }

    // 1. Criar ou Atualizar Lead no CRM
    const autoCreate = config ? config.autoCreateLead : true;
    if (autoCreate && cleanPhone && cleanPhone.length >= 8) {
      try {
        const existingLead = await repo.getLeadByPhone(tenantId, cleanPhone);
        const tags = Array.from(new Set([
          ...(config?.tags || (provider === 'META' ? ['meta_ads'] : ['google_sheets'])),
          provider === 'META' ? 'meta_lead' : 'sheets_lead'
        ]));

        const notesContent = [
          `[Origem: ${provider === 'META' ? 'Meta Lead Ads (Formulário)' : 'Google Sheets (Planilha)'} em ${new Date().toLocaleString('pt-BR')}]`,
          extracted.formId ? `Form ID: ${extracted.formId}` : null,
          extracted.sheetName ? `Planilha/Aba: ${extracted.sheetName} (Linha ${extracted.rowNumber || 'N/A'})` : null,
          extracted.notes || null,
        ].filter(Boolean).join('\n');

        if (existingLead) {
          lead = await repo.updateLeadFull(existingLead.id, {
            name: (extracted.name || existingLead.name) ?? undefined,
            email: (extracted.email || existingLead.email) ?? undefined,
            tags: Array.from(new Set([...(existingLead.tags || []), ...tags])),
            customFields: { ...(existingLead.customFields || {}), ...(extracted.customFields || {}) },
            notes: existingLead.notes ? `${existingLead.notes}\n\n${notesContent}` : notesContent,
          });
          console.log(`[IntegrationEngine] Lead ${cleanPhone} já existia no CRM. Dados atualizados (ID: ${lead.id}).`);
        } else {
          lead = await repo.createLeadManual({
            tenantId,
            phone: cleanPhone,
            name: extracted.name || undefined,
            email: extracted.email || undefined,
            tags,
            customFields: extracted.customFields || {},
            notes: notesContent,
            status: config?.defaultStatus || 'NEW',
          });
          console.log(`[IntegrationEngine] Novo Lead cadastrado no CRM via ${provider}: ${cleanPhone} (ID: ${lead.id}).`);
        }
      } catch (leadErr: any) {
        console.warn('[IntegrationEngine] Erro ao cadastrar/atualizar lead no CRM:', leadErr);
        status = 'WARNING';
        statusMessage += ` Erro ao salvar lead: ${leadErr?.message}.`;
      }
    }

    // 2. Disparador WhatsApp (Outbound)
    const triggerOutbound = config ? config.triggerOutbound : false;
    if (triggerOutbound && cleanPhone && cleanPhone.length >= 8) {
      try {
        const tenant = await repo.getTenant(tenantId);
        const companyName = tenant?.name || 'nossa empresa';
        const leadName = extracted.name || lead?.name || 'Cliente';

        const defaultTemplate = provider === 'META'
          ? 'Olá {nome}, recebemos seu contato através do nosso anúncio! Sou o assistente virtual da {empresa}. Como posso te ajudar hoje?'
          : 'Olá {nome}, recebemos suas informações da nossa planilha! Sou o atendente virtual da {empresa}. Como posso te ajudar?';

        const template = config?.outboundMessage && config.outboundMessage.trim().length > 0
          ? config.outboundMessage
          : defaultTemplate;

        const formattedMsg = template
          .replace(/\{nome\}/gi, leadName)
          .replace(/\{name\}/gi, leadName)
          .replace(/\{empresa\}/gi, companyName)
          .replace(/\{telefone\}/gi, cleanPhone);

        console.log(`[IntegrationEngine] Disparando WhatsApp para ${cleanPhone}...`);
        const sendSuccess = await outboundConnector.sendMessage(tenantId, {
          phone: cleanPhone,
          leadId: lead?.id || undefined,
          formattedContent: formattedMsg,
        });

        if (sendSuccess) {
          messageSent = formattedMsg;
          if (lead?.id) {
            await repo.createMessage(lead.id, 'SDR', formattedMsg);
          }
          await repo.createOutboundCampaign({
            tenantId,
            phone: cleanPhone,
            name: leadName,
            message: formattedMsg,
            status: 'SENT',
            source: provider,
            errorMessage: null,
          });
          console.log(`[IntegrationEngine] WhatsApp enviado com sucesso para ${cleanPhone}!`);
        } else {
          console.warn(`[IntegrationEngine] WhatsApp não pôde ser enviado para ${cleanPhone} (instância offline ou erro no conector).`);
          await repo.createOutboundCampaign({
            tenantId,
            phone: cleanPhone,
            name: leadName,
            message: formattedMsg,
            status: 'FAILED',
            source: provider,
            errorMessage: 'Falha no envio via Evolution API ou instância offline.',
          });
        }
      } catch (outboundErr: any) {
        console.warn('[IntegrationEngine] Falha ao disparar mensagem Outbound:', outboundErr);
      }
    }

    // 3. Disparar Fluxo Vinculado (FlowEngine)
    if (lead?.id) {
      try {
        await flowEngine.tryStartFlowForIntegration(tenantId, lead.id, provider);
      } catch (flowErr) {
        console.warn('[IntegrationEngine] Aviso ao iniciar fluxo via integração:', flowErr);
      }
    }

    // 4. Gravar Log no Banco
    const log = await repo.createIntegrationLog({
      tenantId,
      provider,
      event: provider === 'META' ? 'lead_received' : 'row_added',
      status,
      leadId: lead?.id || null,
      leadPhone: cleanPhone || extracted.phone || null,
      leadName: extracted.name || null,
      rawPayload: JSON.stringify(rawPayload),
      parsedData: JSON.stringify(extracted),
      messageSent,
      errorMessage: statusMessage || null,
    });

    return {
      success: (status as string) !== 'ERROR',
      status,
      message: statusMessage || `Evento ${provider} processado com sucesso. Lead ${cleanPhone ? cleanPhone : 'N/A'} ingerido.`,
      leadId: lead?.id || null,
      leadPhone: cleanPhone || null,
      leadName: extracted.name || null,
      logId: log.id,
      messageSent,
    };
  }

  /**
   * Extrai campos a partir do formato Meta (field_data ou chaves diretas)
   */
  private extractFieldsFromMeta(fieldData: any[], rawPayload: any, mapping: Record<string, string>): ExtractedLeadData {
    const result: ExtractedLeadData = { customFields: {} };
    const fieldMap: Record<string, string> = {};

    // Inspecionar array field_data
    if (Array.isArray(fieldData)) {
      for (const f of fieldData) {
        const key = String(f.name || f.key || '').trim().toLowerCase();
        const val = Array.isArray(f.values) ? f.values[0] : f.value || '';
        if (key && val) fieldMap[key] = String(val).trim();
      }
    }

    // Mesclar chaves do primeiro nível do rawPayload caso existam
    for (const [k, v] of Object.entries(rawPayload || {})) {
      if (typeof v === 'string' || typeof v === 'number') {
        fieldMap[k.toLowerCase()] = String(v).trim();
      }
    }

    // Chaves configuradas pelo usuário
    const mappedNameKey = (mapping.name || '').trim().toLowerCase();
    const mappedPhoneKey = (mapping.phone || '').trim().toLowerCase();
    const mappedEmailKey = (mapping.email || '').trim().toLowerCase();
    const mappedNotesKey = (mapping.notes || '').trim().toLowerCase();

    // 1. Extrair Nome
    if (mappedNameKey && fieldMap[mappedNameKey]) {
      result.name = fieldMap[mappedNameKey];
    } else {
      for (const k of ['full_name', 'nome', 'name', 'nome_completo', 'first_name', 'cliente', 'lead']) {
        if (fieldMap[k]) {
          result.name = fieldMap[k];
          break;
        }
      }
    }

    // 2. Extrair Telefone
    if (mappedPhoneKey && fieldMap[mappedPhoneKey]) {
      result.phone = fieldMap[mappedPhoneKey];
    } else {
      for (const k of ['phone_number', 'telefone', 'phone', 'whatsapp', 'celular', 'fone', 'tel', 'zap', 'mobile']) {
        if (fieldMap[k]) {
          result.phone = fieldMap[k];
          break;
        }
      }
    }

    // 3. Extrair Email
    if (mappedEmailKey && fieldMap[mappedEmailKey]) {
      result.email = fieldMap[mappedEmailKey];
    } else {
      for (const k of ['email', 'e-mail', 'mail', 'correio']) {
        if (fieldMap[k]) {
          result.email = fieldMap[k];
          break;
        }
      }
    }

    // 4. Campos restantes para customFields e notes
    const extraLines: string[] = [];
    for (const [k, v] of Object.entries(fieldMap)) {
      if (['entry', 'object', 'leadgen_id', 'created_time'].includes(k)) continue;
      if (v === result.name || v === result.phone || v === result.email) continue;

      result.customFields![k] = v;
      extraLines.push(`${k}: ${v}`);
    }

    if (mappedNotesKey && fieldMap[mappedNotesKey]) {
      result.notes = fieldMap[mappedNotesKey];
    } else if (extraLines.length > 0) {
      result.notes = extraLines.join(' | ');
    }

    return result;
  }

  /**
   * Extrai campos a partir do formato de linha do Google Sheets
   */
  private extractFieldsFromSheets(rowData: any, mapping: Record<string, string>): ExtractedLeadData {
    const result: ExtractedLeadData = { customFields: {} };
    const rowMap: Record<string, string> = {};

    // Transformar chaves em minúsculas para matching flexível
    for (const [k, v] of Object.entries(rowData || {})) {
      if (v !== undefined && v !== null && typeof v !== 'object') {
        rowMap[k.trim().toLowerCase()] = String(v).trim();
      }
    }

    const mappedNameKey = (mapping.name || '').trim().toLowerCase();
    const mappedPhoneKey = (mapping.phone || '').trim().toLowerCase();
    const mappedEmailKey = (mapping.email || '').trim().toLowerCase();
    const mappedNotesKey = (mapping.notes || '').trim().toLowerCase();

    // 1. Nome
    if (mappedNameKey && rowMap[mappedNameKey]) {
      result.name = rowMap[mappedNameKey];
    } else {
      for (const k of ['nome', 'name', 'nome completo', 'cliente', 'full_name', 'contato', 'first_name']) {
        if (rowMap[k]) {
          result.name = rowMap[k];
          break;
        }
      }
    }

    // 2. Telefone
    if (mappedPhoneKey && rowMap[mappedPhoneKey]) {
      result.phone = rowMap[mappedPhoneKey];
    } else {
      for (const k of ['telefone', 'whatsapp', 'celular', 'phone', 'phone_number', 'fone', 'tel', 'zap', 'contato_tel']) {
        if (rowMap[k]) {
          result.phone = rowMap[k];
          break;
        }
      }
    }

    // 3. Email
    if (mappedEmailKey && rowMap[mappedEmailKey]) {
      result.email = rowMap[mappedEmailKey];
    } else {
      for (const k of ['email', 'e-mail', 'mail']) {
        if (rowMap[k]) {
          result.email = rowMap[k];
          break;
        }
      }
    }

    // 4. Campos restantes
    const extraLines: string[] = [];
    for (const [k, v] of Object.entries(rowMap)) {
      if (['sheetname', 'rownumber', 'secrettoken', 'token', 'apikey'].includes(k)) continue;
      if (v === result.name || v === result.phone || v === result.email) continue;

      result.customFields![k] = v;
      extraLines.push(`${k}: ${v}`);
    }

    if (mappedNotesKey && rowMap[mappedNotesKey]) {
      result.notes = rowMap[mappedNotesKey];
    } else if (extraLines.length > 0) {
      result.notes = extraLines.join(' | ');
    }

    return result;
  }

  /**
   * Normaliza números de telefone garantindo somente dígitos e formato internacional (DDI 55 padrão Brasil se omitido).
   */
  private normalizePhoneNumber(phoneInput?: string | null): string | null {
    if (!phoneInput) return null;
    let clean = String(phoneInput).replace(/[^0-9]/g, '');
    if (!clean || clean.length < 8) return null;

    // Se tem 10 ou 11 dígitos (ex: 11999998888 ou 1133334444), assume DDI Brasil (55)
    if (clean.length === 10 || clean.length === 11) {
      clean = `55${clean}`;
    }

    return clean;
  }

  // ==========================================
  //   LEGACY QUALIFICATION AUTOMATION HOOK
  // ==========================================

  /**
   * Triggers external automations and integrations when a lead is qualified.
   */
  public async handleLeadQualified(leadId: string, tenantId: string, sdrConfig: SDRConfig): Promise<void> {
    console.log(`[IntegrationEngine] Triggered qualification workflows for Lead ID: ${leadId}`);

    try {
      const lead = await repo.getLeadByPhone(tenantId, (await repo.getLeads(tenantId)).find(l => l.id === leadId)?.phone || '');
      if (!lead) {
        console.warn(`[IntegrationEngine] Lead not found in DB: ${leadId}`);
        return;
      }

      const memories = await repo.getLeadMemories(leadId);
      const factsText = memories.map(m => m.fact).join(', ') || 'Nenhuma informação específica extraída.';

      // Webhook integration
      if (sdrConfig.webhookUrl && sdrConfig.webhookUrl.trim().startsWith('http')) {
        console.log(`[IntegrationEngine] Discharging webhook to: ${sdrConfig.webhookUrl}`);
        const payload = {
          event: 'lead.qualified',
          tenantId,
          lead: {
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            status: lead.status,
          },
          qualificationDetails: factsText,
          timestamp: new Date().toISOString(),
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        fetch(sdrConfig.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        })
          .then(res => {
            clearTimeout(timeoutId);
            console.log(`[IntegrationEngine] Webhook response: ${res.status} ${res.statusText}`);
          })
          .catch(err => {
            clearTimeout(timeoutId);
            console.error(`[IntegrationEngine] Webhook failed (expected timeout/offline in dev):`, err.message);
          });
      }

      // Google Spreadsheets simulation
      if (sdrConfig.spreadsheetEnabled) {
        console.log(`[Spreadsheet] NEW ROW INSERTED: ${lead.name} (${lead.phone})`);
      }
    } catch (error) {
      console.error(`[IntegrationEngine] Error running integrations:`, error);
    }
  }
}

export const integrationEngine = IntegrationEngine.getInstance();

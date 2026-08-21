import { eventBus } from '../../core/event-bus/EventBus.js';
import { EVENT_TYPES, MessageReceivedPayload, ResponseReadyPayload } from '../../core/event-bus/events.js';
import { repo } from '../../layers/database/repository.js';
import { aiOrchestrator } from '../../core/orchestrator/AIOrchestrator.js';
import { humanizer } from '../../layers/humanization/Humanizer.js';
import { outboundConnector } from '../../core/whatsapp/OutboundConnector.js';
import { analyticsEngine } from '../analytics/AnalyticsEngine.js';
import { flowEngine } from '../../core/flow/FlowEngine.js';

export class ConversationEngine {
  private static instance: ConversationEngine;

  private constructor() {
    this.setupListeners();
  }

  public static getInstance(): ConversationEngine {
    if (!ConversationEngine.instance) {
      ConversationEngine.instance = new ConversationEngine();
    }
    return ConversationEngine.instance;
  }

  private setupListeners() {
    // 1. Listen to inbound message.received events
    eventBus.subscribe<MessageReceivedPayload>(
      EVENT_TYPES.MESSAGE_RECEIVED,
      async (event) => {
        await this.processMessageReceived(event.tenantId, event.payload);
      }
    );

    // 2. Listen to outbound response.ready events to persist SDR's replies to message history
    eventBus.subscribe<ResponseReadyPayload>(
      EVENT_TYPES.RESPONSE_READY,
      async (event) => {
        await this.processMessageSent(event.tenantId, event.payload);
      }
    );
  }

  /**
   * Main entry point when a message is received from WhatsApp or other channels
   */
  public async handleInboundMessage(tenantId: string, phone: string, content: string, senderName?: string) {
    // Publish raw inbound message event
    eventBus.publish<MessageReceivedPayload>(EVENT_TYPES.MESSAGE_RECEIVED, tenantId, {
      phone,
      content,
      senderName,
    });
  }

  private async processMessageReceived(tenantId: string, payload: MessageReceivedPayload) {
    const { phone, content, senderName } = payload;
    const text = content;
    console.log(`[ConversationEngine] Processing received message from ${phone}: "${content}"`);

    // 1. Get or create Lead first so messages always appear in conversation history
    let lead = await repo.getLeadByPhone(tenantId, phone);
    if (!lead) {
      console.log(`[ConversationEngine] New lead found! Creating lead for phone: ${phone}`);
      lead = await repo.createLead({
        tenantId,
        phone,
        name: senderName || 'Lead Interessado',
      });
    }

    // 2. Save Message to history immediately and reset followUp counter
    await repo.createMessage(lead.id, 'LEAD', content);
    await repo.resetLeadFollowUp(lead.id);

    // 2.5. LGPD Compliance: Automatic Opt-out / Revogação de Consentimento (Art. 8º §5º e Art. 18, IX)
    const textClean = content.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const optOutKeywords = [
      'sair', 'cancelar', 'parar', 'pare', 'stop', 'optout', 'opt-out',
      'descadastrar', 'descadastro', 'remover meus dados', 'excluir meus dados',
      'nao quero mais receber', 'nao me envie mais', 'privacidade'
    ];

    const isOptOut = optOutKeywords.some(kw => textClean === kw || textClean.startsWith(kw + ' ') || textClean.includes(' ' + kw));
    if (isOptOut) {
      console.log(`[ConversationEngine] [LGPD Opt-out] Lead ${phone} solicitou descadastro/revogação de consentimento.`);
      await repo.updateLeadFull(lead.id, {
        status: 'DISQUALIFIED',
        botPaused: true,
        notes: `${lead.notes || ''}\n[LGPD] Descadastrado via opt-out automático em ${new Date().toLocaleString('pt-BR')}.`
      });

      const optOutConfirmation = 'Entendido! Respeitamos a sua privacidade (LGPD). Seu contato foi descadastrado e pausamos o atendimento automático. Se desejar falar com nossa equipe no futuro, basta nos enviar uma nova mensagem.';
      await repo.createMessage(lead.id, 'SDR', optOutConfirmation);
      eventBus.publish<ResponseReadyPayload>(EVENT_TYPES.RESPONSE_READY, tenantId, {
        leadId: lead.id,
        phone: lead.phone,
        formattedContent: optOutConfirmation,
      });
      return;
    }

    // 3. Get SDR config for the tenant
    const sdrConfig = await repo.getSDRConfigByTenant(tenantId);
    if (!sdrConfig) {
      console.warn(`[ConversationEngine] SDR Agent not configured for tenant: ${tenantId}. Message saved to history, SDR reply skipped.`);
      return;
    }

    // Check if Bot is Paused / Handoff
    if (lead.botPaused || lead.status === 'HANDOFF') {
      console.log(`[ConversationEngine] Bot paused or Handoff for lead ${lead.id}. Ignorando.`);
      return;
    }

    // Check if Simple SDR Mode and lead is already QUALIFIED (stop responding)
    const sdrMode = sdrConfig.sdrMode || 'ADVANCED';
    if (sdrMode === 'SIMPLE' && (lead.status === 'QUALIFIED' || lead.botPaused)) {
      console.log(`[ConversationEngine] [Simple Mode] Lead ${lead.phone} is already QUALIFIED. Auto-reply skipped.`);
      return;
    }

    // 4. Check Filtering & Trigger rules if filter is enabled
    if (sdrConfig.filterEnabled) {
      const triggerType = sdrConfig.triggerType || 'ALL';

      if (triggerType === 'KEYWORD') {
        const keywords = (sdrConfig.triggerKeywords || '')
          .split(',')
          .map(k => k.trim().toLowerCase())
          .filter(k => k.length > 0);
        
        const messageLower = content.toLowerCase();
        const matchesKeyword = keywords.length === 0 || keywords.some(kw => messageLower.includes(kw));

        if (!matchesKeyword) {
          console.log(`[ConversationEngine] Message from ${phone} did not match trigger keywords: [${keywords.join(', ')}]. SDR auto-reply skipped.`);
          return;
        }
      } else if (triggerType === 'TAG_MATCH') {
        const requiredTags = (sdrConfig.triggerCondition || '')
          .split(',')
          .map(t => t.trim().toLowerCase())
          .filter(t => t.length > 0);
        
        const leadTags = (lead.tags || []).map(t => t.trim().toLowerCase());
        const hasTagMatch = requiredTags.length === 0 || requiredTags.some(reqTag => leadTags.includes(reqTag));

        if (!hasTagMatch) {
          console.log(`[ConversationEngine] Lead ${phone} tags [${leadTags.join(', ')}] did not match required trigger tags [${requiredTags.join(', ')}]. SDR auto-reply skipped.`);
          return;
        }
      } else if (triggerType === 'NEW_ONLY') {
        const pastMessages = await repo.getMessages(lead.id, 5);
        if (pastMessages.length > 1) {
          console.log(`[ConversationEngine] Lead ${phone} is not a new contact (${pastMessages.length} total messages). SDR auto-reply skipped by NEW_ONLY filter.`);
          return;
        }
      }
    }

    // Business Hours Logic
    const currentHour = new Date().getHours();
    const startHour = parseInt((sdrConfig.businessHoursStart || '08:00').split(':')[0]) || 8;
    const endHour = parseInt((sdrConfig.businessHoursEnd || '18:00').split(':')[0]) || 18;
    
    // Check if outside business hours
    let isOutsideBusinessHours = false;
    if (currentHour < startHour || currentHour >= endHour) {
      isOutsideBusinessHours = true;
    }

    if (isOutsideBusinessHours) {
      // If the lead hasn't received an "out of office" message recently, we might notify them, 
      // but for this MVP we just let the AI know it's outside business hours.
      // We append a system instruction to the payload so AIOrchestrator can use it.
    }

    // Verifica se há um fluxo em execução
    const exec = await repo.getFlowExecution(lead.id);
    if (exec && exec.status === 'PAUSED') {
      const flow = await repo.getFlowById(exec.flowId);
      if (flow) {
        // Retoma o fluxo
        await flowEngine.resumeFlow(exec, flow, text);
        return;
      }
    }

    // Se não há fluxo rodando, tenta iniciar um (keyword trigger ou "novo lead" inbound_new_lead)
    const started = await flowEngine.tryStartFlowForMessage(tenantId, lead.id, text);
    if (started) {
      return; // Se iniciou fluxo, não passa pro orchestrator normal
    }

    // ==========================================
    // SDR IA Normal Pipeline (se não caiu em fluxo)
    // ==========================================

    // 4. Retrieve recent message history buffer (e.g. last 15 messages)
    const history = await repo.getMessages(lead.id, 15);
    console.log(`[ConversationEngine] History retrieved. Total messages in buffer: ${history.length}`);

    // 5. Initialize or get Strategy State
    let state = await repo.getLeadStrategyState(lead.id);
    if (!state) {
      // Seed initial objective and strategy
      state = await repo.upsertLeadStrategyState(
        lead.id,
        'Acolher e descobrir interesse inicial',
        'Rapport & Qualificação Primária'
      );
    }

    // 6. Forward to the next step by publishing lead.state.updated event
    eventBus.publish(EVENT_TYPES.LEAD_STATE_UPDATED, tenantId, {
      leadId: lead.id,
      phone: lead.phone,
      status: lead.status,
      currentObjective: state.currentObjective,
      currentStrategy: state.currentStrategy,
      lastMessageContent: content,
      isOutsideBusinessHours: typeof isOutsideBusinessHours !== "undefined" ? isOutsideBusinessHours : false,
    });
  }

  private async processMessageSent(tenantId: string, payload: ResponseReadyPayload) {
    const { leadId, phone, formattedContent } = payload;
    console.log(`[ConversationEngine] Outbound SDR response ready for ${phone}. Saving to history.`);

    // Persist SDR response to database
    await repo.createMessage(leadId, 'SDR', formattedContent);
  }

  /**
   * Helper to fetch message buffer for the prompt builder
   */
  public async getRecentHistory(leadId: string, limit = 10) {
    return repo.getMessages(leadId, limit);
  }
}

export const conversationEngine = ConversationEngine.getInstance();

import { eventBus } from '../event-bus/EventBus.js';
import { EVENT_TYPES, LeadStateUpdatedPayload, ResponseGeneratedPayload } from '../event-bus/events.js';
import { repo } from '../../layers/database/repository.js';
import { contextEngine } from '../../engines/context/ContextEngine.js';
import { memoryEngine } from '../../engines/memory/MemoryEngine.js';
import { knowledgeEngine } from '../../engines/knowledge/KnowledgeEngine.js';
import { objectiveEngine } from '../../engines/objective/ObjectiveEngine.js';
import { strategyEngine } from '../../engines/strategy/StrategyEngine.js';
import { learningEngine } from '../../engines/learning/LearningEngine.js';
import { geminiService } from '../ai/GeminiService.js';
import { integrationEngine } from '../../engines/integration/IntegrationEngine.js';
import { reflectionEngine } from '../../engines/reflection/ReflectionEngine.js';

export class AIOrchestrator {
  private static instance: AIOrchestrator;

  private constructor() {
    this.setupListeners();
  }

  public static getInstance(): AIOrchestrator {
    if (!AIOrchestrator.instance) {
      AIOrchestrator.instance = new AIOrchestrator();
    }
    return AIOrchestrator.instance;
  }

  private setupListeners() {
    // Listen to lead state updates (which are triggered after inbound messages are persisted)
    eventBus.subscribe<LeadStateUpdatedPayload>(
      EVENT_TYPES.LEAD_STATE_UPDATED,
      async (event) => {
        await this.orchestrate(event.tenantId, event.payload);
      }
    );
  }

  /**
   * The central orchestration pipeline.
   * WhatsApp Msg -> Conv Engine -> Lead State Event -> AI Orchestrator -> LLM response -> Outbound
   */
  public async orchestrate(tenantId: string, payload: LeadStateUpdatedPayload) {
    const { leadId, phone, currentObjective, currentStrategy, lastMessageContent } = payload;

    console.log(`[AIOrchestrator] Starting orchestration pipeline for Lead: ${phone}`);

    try {
      // 1. Load the SDR configuration for the tenant
      const sdrConfig = await repo.getSDRConfigByTenant(tenantId);
      if (!sdrConfig) {
        throw new Error(`SDR Config not found for tenant: ${tenantId}`);
      }

      const isSimpleMode = (sdrConfig.sdrMode || 'ADVANCED') === 'SIMPLE';

      // ============================================================
      //   BRANCH: MODO SIMPLES (QUALIFICAÇÃO DIRETA)
      //   Executa 1 única chamada LLM sem estágios de funil
      // ============================================================
      if (isSimpleMode) {
        await this.orchestrateSimpleMode(tenantId, payload, sdrConfig);
        return;
      }

      // 2. Memory Engine: Extract new memories from conversation history, and fetch all current memories
      const memories = await memoryEngine.extractAndSaveMemories(leadId, tenantId);
      const memoriesText = memories.map((m) => `- ${m.fact}`).join('\n') || 'Nenhuma memória sobre o lead ainda.';

      // 3. Context Engine: Retrieve recent context history
      const { recentHistory } = await contextEngine.getActiveContext(leadId, 10);
      const recentHistoryText = recentHistory
        .map((m) => `${m.sender === 'LEAD' ? 'Lead' : 'SDR'}: ${m.content}`)
        .join('\n');

      // 4. Knowledge Engine: Retrieve relevant knowledge base chunks matching the lead's query/message
      // Uses PGVector search internally
      const knowledgeChunks = await knowledgeEngine.retrieveRelevantKnowledge(tenantId, lastMessageContent, 3);
      const knowledgeText = knowledgeChunks.map((chunk) => `[PLAYBOOK CHUNK]:\n${chunk}`).join('\n\n') || 'Nenhum playbook específico encontrado para esta mensagem.';

      // 4.5. Get Media Assets for the tenant
      const mediaAssets = await repo.getMediaAssets(tenantId);

      // 5. Objective Engine: Evaluate if the objective is met and determine the next objective
      const { nextObjective, nextStatus, reason: objectiveReason } = await objectiveEngine.evaluateObjective(
        leadId,
        recentHistoryText,
        currentObjective,
        memoriesText,
        sdrConfig.baseInstructions,
        sdrConfig.qualificationFlow,
        sdrConfig.funnelObjectives,
        sdrConfig.qualificationCriteria,
        sdrConfig.disqualificationCriteria,
        sdrConfig.stopConditions
      );
      console.log(`[AIOrchestrator] Objective evaluated. Next: "${nextObjective}". Status: "${nextStatus}". Reason: ${objectiveReason}`);

      // 6. Strategy Engine: Decide the sales strategy to use
      const { nextStrategy, reason: strategyReason } = await strategyEngine.evaluateStrategy(
        leadId,
        recentHistoryText,
        nextObjective,
        currentStrategy,
        memoriesText,
        sdrConfig.baseInstructions,
        sdrConfig.salesStrategies
      );
      console.log(`[AIOrchestrator] Strategy evaluated. Next: "${nextStrategy}". Reason: ${strategyReason}`);

      // 6.5. Learning Engine: Retrieve similar past human corrections (supervisor feedbacks)
      // Uses PGVector similarity search on errorContext
      const corrections = await learningEngine.getRelevantLearning(tenantId, lastMessageContent, 2);
      const fewShotText = learningEngine.formatCorrectionsAsFewShot(corrections);

      // Save previous status
      const leadBefore = await repo.getLeadByPhone(tenantId, phone);
      const previousStatus = leadBefore?.status || 'NEW';

      // 7. Save updated Objective & Strategy back to the database for this Lead
      await repo.upsertLeadStrategyState(leadId, nextObjective, nextStrategy);

      // Save updated status if changed
      if (nextStatus && nextStatus !== previousStatus) {
        await repo.updateLeadStatus(leadId, nextStatus);
        console.log(`[AIOrchestrator] Lead ${phone} status updated: ${previousStatus} -> ${nextStatus}`);

        // Trigger integrations if transitioning to QUALIFIED
        if (nextStatus === 'QUALIFIED') {
          await integrationEngine.handleLeadQualified(leadId, tenantId, sdrConfig);
        }

        // If transitioning to HANDOFF (stop condition met): pause bot auto-replies
        if (nextStatus === 'HANDOFF') {
          await repo.updateLeadFull(leadId, { botPaused: true });
          console.log(`[AIOrchestrator] Lead ${phone} marked as HANDOFF. Bot auto-reply paused.`);
        }
      }

      // Build Qualification & Media instructions
      const qualificationInstruction = `
### FLUXO DE QUALIFICAÇÃO DO LEAD:
Para qualificar este lead, obtenha estas informações durante a conversa:
"${sdrConfig.qualificationFlow}"

### AÇÃO PÓS-QUALIFICAÇÃO:
Quando o lead estiver qualificado (quando responder ao fluxo acima), sua conduta final deve ser:
"${sdrConfig.postQualificationAction}"
`;

      let criteriaInstruction = '';
      if (sdrConfig.qualificationCriteria && sdrConfig.qualificationCriteria.trim()) {
        criteriaInstruction += `\n### CRITÉRIOS DE QUALIFICAÇÃO:\n"${sdrConfig.qualificationCriteria}"\n`;
      }
      if (sdrConfig.disqualificationCriteria && sdrConfig.disqualificationCriteria.trim()) {
        criteriaInstruction += `\n### CRITÉRIOS DE DESQUALIFICAÇÃO:\n"${sdrConfig.disqualificationCriteria}"\n`;
      }
      if (sdrConfig.stopConditions && sdrConfig.stopConditions.trim()) {
        criteriaInstruction += `\n### CONDIÇÕES PARA PARAR E TRANSFERIR PARA HUMANO:\n"${sdrConfig.stopConditions}"\n`;
      }

      let mediaInstruction = '';
      if (mediaAssets && mediaAssets.length > 0) {
        mediaInstruction = `

### RECURSOS DE MÍDIA DISPONÍVEIS (FOTOS E VÍDEOS):
Você pode disparar o envio de arquivos de vídeo e imagem para o WhatsApp do lead inserindo a tag exata no texto da sua resposta. O conector removerá a tag e enviará a mídia real correspondente.
Instruções de disparo de mídia:
${mediaAssets.map(asset => `- Para enviar a mídia "${asset.caption || asset.triggerValue}" (${asset.mediaType.toUpperCase()}): inclua a tag [SEND_MEDIA: ${asset.triggerValue}] no final de sua mensagem.`).join('\n')}
Apenas inclua a tag se o lead pedir fotos, vídeos, imagens ou demonstrações do produto correspondente.`;
      }

      // 8. Build Prompt for Advanced Cognitive SDR Mode
      let systemInstruction = `Você é um SDR Comercial inteligente e humanizado chamado ${sdrConfig.personaName}, atuando como ${sdrConfig.personaRole}.
Sua personalidade e estilo de comunicação:
"${sdrConfig.personality}"

Diretrizes permanentes do SDR:
"${sdrConfig.baseInstructions}"
${qualificationInstruction}${criteriaInstruction}${mediaInstruction}

Você deve conversar com o Lead de forma extremamente fluida e natural, exatamente como um vendedor humano de alta performance conversaria no WhatsApp.
REGRAS CRÍTICAS DE CONVERSAÇÃO:
1. NUNCA responda com textos longos ou robóticos. Use parágrafos curtos. Limite sua resposta a aproximadamente ${sdrConfig.maxWords} palavras no total. Priorize respostas concisas. Gere no máximo ${sdrConfig.maxBubbles} parágrafos curtos no total (separados por quebra de linha).
2. Evite formalidades excessivas (ex: "Prezado(a)", "Como posso ajudá-lo hoje?"). Diga coisas como "Oi, tudo bem?", "Show de bola".
3. Mantenha o foco no OBJETIVO COMERCIAL ATUAL e na ESTRATÉGIA COMERCIAL indicados abaixo.
4. Utilize as "Memórias do Lead" para demonstrar escuta ativa e criar conexão (rapport).
5. Baseie suas respostas técnicas estritamente no "Playbook Comercial / Conhecimento". Se a informação não estiver lá, diga gentilmente que vai confirmar com a equipe e avisa depois. Nunca invente dados técnicos.
6. Nunca dê duas CTAs na mesma mensagem. Mantenha o fluxo simples para o lead responder.`;

      if (payload.isOutsideBusinessHours) {
        systemInstruction += '\n\n[Aviso do Sistema] A equipe humana está FORA do horário comercial no momento. Informe sutilmente ao lead que a equipe retornará amanhã de manhã, mas continue tentando avançar a conversa até onde puder de forma prestativa.';
      }

      const prompt = `### INFORMAÇÕES DO MOMENTO COMERCIAL
Objetivo Comercial Ativo: "${nextObjective}"
Estratégia Comportamental Ativa: "${nextStrategy}"
${fewShotText}
### MEMÓRIAS E FATOS SOBRE O LEAD
${memoriesText}

### CONHECIMENTO / PLAYBOOK COMERCIAL
${knowledgeText}

### HISTÓRICO RECENTE DE MENSAGENS (Em ordem cronológica)
${recentHistoryText}

SDR (${sdrConfig.personaName}): [Gere a resposta adequada aqui, sem prefixar com "SDR:" ou o seu nome]`;

      console.log(`[AIOrchestrator] Dispatching prompt to Gemini...`);

      // 9. Call LLM to generate response
      const rawResponse = await geminiService.generateText(prompt, systemInstruction);

      console.log(`[AIOrchestrator] LLM Raw Response generated: "${rawResponse}"`);

      // 10. Persist Cognitive Decision Trace for audit and dashboard visualization
      await repo.saveAITrace({
        tenantId,
        leadId,
        phone,
        inputMessage: lastMessageContent,
        memoriesFound: memories.map(m => m.fact),
        knowledgeChunks: knowledgeChunks,
        currentObjective,
        nextObjective,
        objectiveReason,
        currentStrategy,
        nextStrategy,
        strategyReason,
        leadStatusBefore: previousStatus,
        leadStatusAfter: nextStatus || previousStatus,
        fewShotUsed: fewShotText || null,
        generatedPrompt: prompt,
        finalResponse: rawResponse,
      });

      // 11. Publish response.generated event
      eventBus.publish<ResponseGeneratedPayload>(EVENT_TYPES.RESPONSE_GENERATED, tenantId, {
        leadId,
        phone,
        rawContent: rawResponse,
      });

      // 12. Trigger asynchronous self-reflection / continuous learning
      if (['QUALIFIED', 'DISQUALIFIED', 'HANDOFF'].includes(nextStatus || '') || recentHistory.length >= 4) {
        reflectionEngine.reflectOnConversation(tenantId, leadId).catch(err => {
          console.warn('[AIOrchestrator] Self-reflection warning:', err);
        });
      }
    } catch (error) {
      console.error(`[AIOrchestrator] Error during orchestration pipeline:`, error);
    }
  }

  /**
   * Pipeline dedicado para o Modo Simples (SDR de Qualificação Direta).
   * 1. Executa UMA ÚNICA chamada LLM concisa.
   * 2. Zero fases de funil (ObjectiveEngine) e zero táticas comportamentais (StrategyEngine).
   * 3. Memória contínua do diálogo para nunca repetir apresentações ("Olá, sou o...").
   * 4. Ao concluir todas as perguntas do fluxo, marca o lead como QUALIFIED e finaliza.
   */
  private async orchestrateSimpleMode(tenantId: string, payload: LeadStateUpdatedPayload, sdrConfig: any) {
    const { leadId, phone, lastMessageContent } = payload;
    console.log(`[AIOrchestrator] [Modo Simples] Conduzindo qualificação direta para o Lead: ${phone}`);

    try {
      // 1. Context Engine: Recuperar histórico recente de mensagens
      const { recentHistory } = await contextEngine.getActiveContext(leadId, 12);
      const recentHistoryText = recentHistory
        .map((m) => `${m.sender === 'LEAD' ? 'Lead' : sdrConfig.personaName}: ${m.content}`)
        .join('\n');

      // 2. Knowledge Engine: Recuperar trechos do playbook caso o lead tenha feito alguma pergunta técnica
      const knowledgeChunks = await knowledgeEngine.retrieveRelevantKnowledge(tenantId, lastMessageContent, 2);
      const knowledgeText = knowledgeChunks.map((chunk) => `[PLAYBOOK]:\n${chunk}`).join('\n\n') || 'Nenhuma informação específica no playbook.';

      // 3. Media Assets
      const mediaAssets = await repo.getMediaAssets(tenantId);
      let mediaInstruction = '';
      if (mediaAssets && mediaAssets.length > 0) {
        mediaInstruction = `\nRECURSOS DE MÍDIA:\n${mediaAssets.map(a => `- Para enviar "${a.caption || a.triggerValue}": use a tag [SEND_MEDIA: ${a.triggerValue}]`).join('\n')}\nApenas use a tag se o lead solicitar fotos, vídeos ou demonstrações.`;
      }

      const leadBefore = await repo.getLeadByPhone(tenantId, phone);
      const previousStatus = leadBefore?.status || 'NEW';

      const systemInstruction = `Você é ${sdrConfig.personaName}, atuando como ${sdrConfig.personaRole}.
Personalidade e Tom de Voz: "${sdrConfig.personality}"
Diretrizes da Empresa: "${sdrConfig.baseInstructions}"

SUA MISSÃO EXCLUSIVA (MODO SIMPLES - QUALIFICAÇÃO DIRETA):
Conduzir um diálogo natural e direto pelo WhatsApp para coletar estritamente as respostas do FLUXO DE QUALIFICAÇÃO.

FLUXO DE QUALIFICAÇÃO OBRIGATÓRIO:
"${sdrConfig.qualificationFlow}"

AÇÃO DE ENCERRAMENTO (PÓS-QUALIFICAÇÃO):
"${sdrConfig.postQualificationAction}"${mediaInstruction}

REGRAS CRÍTICAS DE DIÁLOGO:
1. CONTINUIDADE DA CONVERSA (NUNCA REPITA APRESENTAÇÃO): Analise o histórico da conversa abaixo. Se você já se apresentou ("Olá", "Sou o...", "Tudo bem?") em mensagens anteriores, NUNCA repita apresentações ou saudações de abertura. Vá direto ao ponto e dê sequência ao assunto.
2. UMA PERGUNTA POR VEZ: Pergunte apenas um dado do fluxo de qualificação por vez de forma cordial.
3. CONCISÃO NO WHATSAPP: Use mensagens curtas de até ${sdrConfig.maxWords} palavras.
4. DECISÃO DE QUALIFICAÇÃO:
   - Se o lead já forneceu TODAS as informações exigidas no Fluxo de Qualificação:
     * Defina "isQualified": true
     * O campo "response" DEVE executar a AÇÃO DE ENCERRAMENTO (agradecer e passar os próximos passos).
   - Se ainda faltam dados no fluxo:
     * Defina "isQualified": false
     * O campo "response" deve responder rapidamente a qualquer dúvida do lead e perguntar o próximo dado pendente do fluxo.`;

      const prompt = `### INFORMAÇÕES DO PLAYBOOK:
${knowledgeText}

### HISTÓRICO RECENTE DA CONVERSA:
${recentHistoryText}

### ÚLTIMA MENSAGEM DO LEAD:
"${lastMessageContent}"

Responda em formato JSON estruturado com os campos:
- "isQualified" (boolean): true somente se TODOS os dados exigidos no fluxo de qualificação já foram respondidos.
- "response" (string): o texto final da sua resposta para o WhatsApp.
- "summary" (string): breve resumo dos dados coletados até aqui.`;

      const schema = {
        type: 'OBJECT',
        properties: {
          isQualified: { type: 'BOOLEAN', description: 'True se todas as perguntas do fluxo foram respondidas.' },
          response: { type: 'STRING', description: 'Texto da resposta do SDR no WhatsApp.' },
          summary: { type: 'STRING', description: 'Resumo das respostas do lead.' }
        },
        required: ['isQualified', 'response']
      };

      let result: { isQualified: boolean; response: string; summary?: string } = { isQualified: false, response: '', summary: '' };
      try {
        result = await geminiService.generateJson<{ isQualified: boolean; response: string; summary?: string }>(
          prompt,
          schema,
          systemInstruction
        );
        if (!result.response || result.response.trim() === '') {
          result.response = 'Pode me contar mais?';
        }
      } catch (err) {
        console.warn('[AIOrchestrator] [Simple Mode] Fallback para generateText:', err);
        const text = await geminiService.generateText(prompt, systemInstruction);
        result = {
          isQualified: false,
          response: text,
          summary: 'Qualificação em andamento'
        };
      }

      const nextStatus = result.isQualified ? 'QUALIFIED' : (previousStatus === 'NEW' ? 'ACTIVE' : previousStatus);

      // Atualizar status e notas do lead
      if (result.isQualified) {
        console.log(`[AIOrchestrator] [Modo Simples] Lead ${phone} completou todas as informações do fluxo! Status -> QUALIFIED.`);
        await repo.updateLeadFull(leadId, {
          status: 'QUALIFIED',
          botPaused: true,
          notes: `${leadBefore?.notes || ''}\n[Qualificado no Modo Simples em ${new Date().toLocaleString('pt-BR')}]: ${result.summary || 'Fluxo concluído com sucesso.'}`.trim()
        });
        await integrationEngine.handleLeadQualified(leadId, tenantId, sdrConfig);
      } else if (previousStatus === 'NEW') {
        await repo.updateLeadStatus(leadId, 'ACTIVE');
      }

      // Salvar indicador de estado
      await repo.upsertLeadStrategyState(
        leadId,
        result.isQualified ? 'Qualificação Concluída (Modo Simples)' : 'Qualificação Direta em Andamento',
        'Fluxo de Qualificação Direta'
      );

      // Salvar rastro de auditoria da IA
      await repo.saveAITrace({
        tenantId,
        leadId,
        phone,
        inputMessage: lastMessageContent,
        memoriesFound: result.summary ? [result.summary] : [],
        knowledgeChunks,
        currentObjective: 'Qualificação Direta (Modo Simples)',
        nextObjective: result.isQualified ? 'Qualificação Concluída' : 'Coletar próximo dado do fluxo',
        objectiveReason: result.isQualified ? 'Lead respondeu a todas as perguntas do fluxo de qualificação.' : 'Aguardando respostas pendentes do fluxo.',
        currentStrategy: 'Fluxo Direto',
        nextStrategy: result.isQualified ? 'Ação Pós-Qualificação' : 'Perguntar próximo item',
        strategyReason: 'Executado em Modo Simples (sem funil de vendas)',
        leadStatusBefore: previousStatus,
        leadStatusAfter: nextStatus,
        fewShotUsed: null,
        generatedPrompt: prompt,
        finalResponse: result.response,
      });

      console.log(`[AIOrchestrator] [Modo Simples] Resposta gerada com sucesso: "${result.response}"`);

      // Disparar reflexão automática em background caso lead tenha sido qualificado ou histórico rico
      if (result.isQualified || recentHistory.length >= 4) {
        reflectionEngine.reflectOnConversation(tenantId, leadId).catch(err => {
          console.warn('[AIOrchestrator] Simple mode reflection warning:', err);
        });
      }

      // Publicar evento para o Humanizer e OutboundConnector
      eventBus.publish<ResponseGeneratedPayload>(EVENT_TYPES.RESPONSE_GENERATED, tenantId, {
        leadId,
        phone,
        rawContent: result.response,
      });

    } catch (error) {
      console.error(`[AIOrchestrator] [Modo Simples] Erro no pipeline:`, error);
    }
  }

  /**
   * Simulates the entire cognitive decision cycle in dry-run mode for live auditing in the dashboard.
   */
  public async simulateOrchestration(tenantId: string, inputMessage: string, leadId?: string) {
    const sdrConfig = await repo.getSDRConfigByTenant(tenantId);
    if (!sdrConfig) {
      throw new Error('SDR não configurado para esta empresa');
    }

    let phone = '5500000000000';
    let currentObjective = 'Acolher o lead e descobrir seu nome e interesse básico';
    let currentStrategy = 'Rapport & Qualificação Primária';
    let previousStatus = 'NEW';
    let recentHistoryText = `Lead: ${inputMessage}`;
    let memoriesText = 'Nenhuma memória prévia.';
    let memories: string[] = [];

    if (leadId) {
      const lead = await repo.getLeadById(leadId);
      if (lead) {
        phone = lead.phone;
        previousStatus = lead.status;
        const state = await repo.getLeadStrategyState(leadId);
        if (state) {
          currentObjective = state.currentObjective;
          currentStrategy = state.currentStrategy;
        }
        const leadMemories = await repo.getLeadMemories(leadId);
        memories = leadMemories.map((m: any) => m.fact);
        if (memories.length > 0) {
          memoriesText = memories.map((m: string) => `- ${m}`).join('\n');
        }
        const messages = await repo.getMessages(leadId, 6);
        if (messages.length > 0) {
          recentHistoryText = messages.map(m => `${m.sender === 'LEAD' ? 'Lead' : 'SDR'}: ${m.content}`).join('\n') + `\nLead: ${inputMessage}`;
        }
      }
    }

    // 1. Knowledge Search
    const knowledgeChunks = await knowledgeEngine.retrieveRelevantKnowledge(tenantId, inputMessage, 3);
    const knowledgeText = knowledgeChunks.map(c => `[PLAYBOOK CHUNK]:\n${c}`).join('\n\n') || 'Nenhum playbook específico encontrado.';

    // 2. Objective Evaluation
    const { nextObjective, nextStatus, reason: objectiveReason } = await objectiveEngine.evaluateObjective(
      leadId || 'sim-lead',
      recentHistoryText,
      currentObjective,
      memoriesText,
      sdrConfig.baseInstructions,
      sdrConfig.qualificationFlow,
      sdrConfig.funnelObjectives,
      sdrConfig.qualificationCriteria,
      sdrConfig.disqualificationCriteria,
      sdrConfig.stopConditions
    );

    // 3. Strategy Evaluation
    const { nextStrategy, reason: strategyReason } = await strategyEngine.evaluateStrategy(
      leadId || 'sim-lead',
      recentHistoryText,
      nextObjective,
      currentStrategy,
      memoriesText,
      sdrConfig.baseInstructions,
      sdrConfig.salesStrategies
    );

    // 4. Learning Engine
    const corrections = await learningEngine.getRelevantLearning(tenantId, inputMessage, 2);
    const fewShotText = learningEngine.formatCorrectionsAsFewShot(corrections);

    // 5. System Prompt & Prompt Construction
    const isSimpleMode = (sdrConfig.sdrMode || 'ADVANCED') === 'SIMPLE';
    const qualificationInstruction = `\n### FLUXO DE QUALIFICAÇÃO DO LEAD:\n"${sdrConfig.qualificationFlow}"\n### AÇÃO PÓS-QUALIFICAÇÃO:\n"${sdrConfig.postQualificationAction}"\n`;
    
    let systemInstruction = '';
    if (isSimpleMode) {
      systemInstruction = `Você é um SDR Comercial de Qualificação Direta chamado ${sdrConfig.personaName}, atuando como ${sdrConfig.personaRole}.\nPersonalidade: "${sdrConfig.personality}"\nDiretrizes: "${sdrConfig.baseInstructions}"\nMODO: SDR SIMPLES (QUALIFICAÇÃO DIRETA)\n${qualificationInstruction}\nREGRAS: Faça apenas as perguntas do fluxo de qualificação pendentes e encerre com a Ação Pós-Qualificação quando concluído.`;
    } else {
      systemInstruction = `Você é um SDR Comercial inteligente e humanizado chamado ${sdrConfig.personaName}, atuando como ${sdrConfig.personaRole}.\nPersonalidade: "${sdrConfig.personality}"\nDiretrizes: "${sdrConfig.baseInstructions}"${qualificationInstruction}`;
    }

    const prompt = `### INFORMAÇÕES DO MOMENTO COMERCIAL\nObjetivo Ativo: "${nextObjective}"\nEstratégia: "${nextStrategy}"\n${fewShotText}\n### MEMÓRIAS\n${memoriesText}\n### PLAYBOOK\n${knowledgeText}\n### HISTÓRICO\n${recentHistoryText}\nSDR (${sdrConfig.personaName}):`;

    // 6. LLM Call
    const rawResponse = await geminiService.generateText(prompt, systemInstruction);

    return {
      success: true,
      inputMessage,
      phone,
      leadId: leadId || null,
      sdrMode: sdrConfig.sdrMode || 'ADVANCED',
      persona: {
        name: sdrConfig.personaName,
        role: sdrConfig.personaRole,
        personality: sdrConfig.personality,
      },
      stages: {
        step1_memory: {
          name: '1. Extração de Memórias & Contexto',
          description: 'Fatos e preferências conhecidas sobre o lead',
          memoriesFound: memories,
          status: memories.length > 0 ? 'Fatos recuperados' : 'Nenhuma memória prévia',
        },
        step2_knowledge: {
          name: '2. Recuperação de Conhecimento (RAG Vetorial)',
          description: 'Busca semântica em playbooks e catálogos cadastrados',
          chunksMatched: knowledgeChunks,
          status: knowledgeChunks.length > 0 ? `${knowledgeChunks.length} trecho(s) relevante(s) encontrado(s)` : 'Sem trechos específicos',
        },
        step3_objective: {
          name: '3. Avaliação do Objetivo Comercial',
          description: 'Determina a fase da jornada de vendas e se o objetivo foi cumprido',
          currentObjective,
          nextObjective,
          objectiveReason,
          statusBefore: previousStatus,
          statusAfter: nextStatus || previousStatus,
        },
        step4_strategy: {
          name: '4. Definição da Estratégia Comportamental',
          description: 'Escolhe a tática psicológica e tom de abordagem comercial ideal',
          currentStrategy,
          nextStrategy,
          strategyReason,
        },
        step5_learning: {
          name: '5. Aprendizado & Correções Humanas',
          description: 'Injeção de feedbacks passados para evitar repetição de erros',
          correctionsApplied: corrections.length,
          fewShotText: fewShotText || 'Nenhuma correção anterior relevante.',
        },
        step6_generation: {
          name: '6. Síntese & Geração da Resposta (Gemini)',
          description: 'Geração da mensagem final formatada para WhatsApp',
          generatedResponse: rawResponse,
          systemInstructionPreview: systemInstruction,
          fullPromptPreview: prompt,
        }
      },
      finalResponse: rawResponse,
    };
  }
}

export const aiOrchestrator = AIOrchestrator.getInstance();

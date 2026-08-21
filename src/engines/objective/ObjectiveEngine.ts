import { repo } from '../../layers/database/repository.js';
import { geminiService } from '../../core/ai/GeminiService.js';
import { Type } from '@google/genai';

export class ObjectiveEngine {
  private static instance: ObjectiveEngine;

  // Default universal neutral objectives for sales funnels across any niche
  private defaultUniversalObjectives = [
    'Acolher o lead com simpatia, descobrir seu nome e interesse principal',
    'Entender a necessidade, objetivo ou problema que o lead deseja resolver',
    'Descobrir orçamento disponível, capacidade de investimento ou preferências',
    'Apresentar os diferenciais da solução e remover eventuais objeções',
    'Convidar para o próximo passo comercial (visita, demonstração, proposta ou ligação)',
    'Finalizar o contato com cortesia e enviar informações complementares'
  ];

  private constructor() {}

  public static getInstance(): ObjectiveEngine {
    if (!ObjectiveEngine.instance) {
      ObjectiveEngine.instance = new ObjectiveEngine();
    }
    return ObjectiveEngine.instance;
  }

  /**
   * Evaluates if the current objective has been met and decides the next single mission.
   */
  public async evaluateObjective(
    leadId: string,
    recentMessagesText: string,
    currentObjective: string,
    memoriesText: string,
    sdrBaseInstructions: string,
    qualificationFlow: string,
    customObjectives?: string | null,
    qualificationCriteria?: string | null,
    disqualificationCriteria?: string | null,
    stopConditions?: string | null
  ): Promise<{ nextObjective: string; nextStatus: string; reason: string }> {
    console.log(`[ObjectiveEngine] Evaluating objective. Current: "${currentObjective}"`);

    const objectivesList = (customObjectives && customObjectives.trim().length > 0)
      ? customObjectives
      : this.defaultUniversalObjectives.map((o, idx) => `${idx + 1}. ${o}`).join('\n');

    const qualCriteriaText = qualificationCriteria && qualificationCriteria.trim()
      ? `CRITÉRIOS DE QUALIFICAÇÃO DEFINIDOS PELO GESTOR:\n"${qualificationCriteria}"`
      : `- Se o Lead atendeu a todos os requisitos do Fluxo de Qualificação ou expressou prontidão para compra/fechamento/visita, defina como 'QUALIFIED'.`;

    const disqCriteriaText = disqualificationCriteria && disqualificationCriteria.trim()
      ? `CRITÉRIOS DE DESQUALIFICAÇÃO DEFINIDOS PELO GESTOR:\n"${disqualificationCriteria}"`
      : `- Se o Lead demonstrou desinteresse explícito, perfil incompatível, recusa definitiva ou pediu para não receber mensagens, defina como 'DISQUALIFIED'.`;

    const stopConditionsText = stopConditions && stopConditions.trim()
      ? `CONDIÇÕES DE PARADA & HANDOFF HUMANO DEFINIDAS PELO GESTOR:\n"${stopConditions}"`
      : `- Se o Lead pediu explicitamente para falar com um humano/corretor/atendente, ou se uma condição de parada foi atingida, defina como 'HANDOFF'.`;

    const systemInstruction = `Você é o Objective Engine de um SaaS de SDR Comercial.
Sua responsabilidade é:
1. Definir a MISSÃO comercial ATUAL (o próximo passo imediato) para o Lead (nextObjective).
2. Definir o STATUS de qualificação atual do Lead (nextStatus: ACTIVE, QUALIFIED, DISQUALIFIED ou HANDOFF).

Regras de Status (nextStatus):
1. 'HANDOFF' (Parar IA e transferir para atendimento humano):
${stopConditionsText}

2. 'QUALIFIED' (Lead Qualificado com sucesso):
${qualCriteriaText}

3. 'DISQUALIFIED' (Lead Desqualificado / Sem Perfil):
${disqCriteriaText}

4. 'ACTIVE' (Em Atendimento Normal):
- Se a qualificação está em andamento e nenhuma condição de parada, qualificação final ou desqualificação foi atendida, defina como 'ACTIVE'.

Fluxo de Qualificação do SDR:
"${qualificationFlow}"

Fases e Missões do Funil Comercial do Negócio:
${objectivesList}

Regras Gerais:
1. Avalie se o Lead já forneceu a informação necessária para cumprir o objetivo atual ("${currentObjective}").
2. Se SIM, avance para o próximo objetivo lógico do funil comercial.
3. Se NÃO, mantenha o objetivo atual.
4. Mantenha o foco em resolver uma dor/necessidade de cada vez.
5. Baseie sua decisão nas diretrizes de vendas do SDR: "${sdrBaseInstructions}"`;

    const prompt = `Conversa recente:
${recentMessagesText}

Memórias/Fatos aprendidos sobre o lead:
${memoriesText}

Objetivo Atual:
"${currentObjective}"

Determine se o objetivo atual foi cumprido e defina o próximo objetivo comercial único.
Avalie a conversa contra os critérios configurados e defina o status do lead (nextStatus: ACTIVE, QUALIFIED, DISQUALIFIED ou HANDOFF).`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        nextObjective: {
          type: Type.STRING,
          description: 'O único objetivo comercial ativo para este momento da conversa.'
        },
        nextStatus: {
          type: Type.STRING,
          description: 'O status de qualificação do Lead (ACTIVE, QUALIFIED, DISQUALIFIED ou HANDOFF).'
        },
        reason: {
          type: Type.STRING,
          description: 'A explicação do porquê esse objetivo e status foram selecionados ou mantidos.'
        }
      },
      required: ['nextObjective', 'nextStatus', 'reason']
    };

    interface ObjectiveResult {
      nextObjective: string;
      nextStatus: string;
      reason: string;
    }

    try {
      const result = await geminiService.generateJson<ObjectiveResult>(
        prompt,
        responseSchema,
        systemInstruction
      );

      return {
        nextObjective: result.nextObjective || currentObjective,
        nextStatus: result.nextStatus || 'ACTIVE',
        reason: result.reason || 'Manter status e objetivo atuais.'
      };
    } catch (error) {
      console.error('[ObjectiveEngine] Error evaluating objective:', error);
      return {
        nextObjective: currentObjective,
        nextStatus: 'ACTIVE',
        reason: 'Falha na avaliação da LLM, mantendo o objetivo e status atuais por segurança.'
      };
    }
  }
}

export const objectiveEngine = ObjectiveEngine.getInstance();

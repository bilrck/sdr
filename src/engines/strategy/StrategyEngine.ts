import { geminiService } from '../../core/ai/GeminiService.js';
import { Type } from '@google/genai';

export class StrategyEngine {
  private static instance: StrategyEngine;

  // Default universal neutral sales strategies across any niche
  private defaultUniversalStrategies = [
    'Rapport inicial (empatia, quebrar o gelo, acolhimento cordial)',
    'Exploração sutil de dores (compreender necessidades e desafios do lead)',
    'Proposição de valor (apresentar benefícios e diferenciais da solução)',
    'Educação do Lead (esclarecer dúvidas técnicas, planos, condições e prazos)',
    'Contorno de Objeções (endereçar inseguranças, comparar opções e dar segurança)',
    'Urgência e Oportunidade (destacar condições por tempo limitado ou disponibilidade)',
    'Chamada para Ação / CTA (propor o próximo passo: agendamento, ligação ou proposta)'
  ];

  private constructor() {}

  public static getInstance(): StrategyEngine {
    if (!StrategyEngine.instance) {
      StrategyEngine.instance = new StrategyEngine();
    }
    return StrategyEngine.instance;
  }

  /**
   * Evaluates the active conversation history and objective to decide the behavior/strategy of the SDR.
   */
  public async evaluateStrategy(
    leadId: string,
    recentMessagesText: string,
    currentObjective: string,
    currentStrategy: string,
    memoriesText: string,
    sdrBaseInstructions: string,
    customStrategies?: string | null
  ): Promise<{ nextStrategy: string; reason: string }> {
    console.log(`[StrategyEngine] Evaluating strategy for objective: "${currentObjective}". Current strategy: "${currentStrategy}"`);

    const strategiesList = (customStrategies && customStrategies.trim().length > 0)
      ? customStrategies
      : this.defaultUniversalStrategies.map((s, idx) => `${idx + 1}. ${s}`).join('\n');

    const systemInstruction = `Você é o Strategy Engine de um SaaS de SDR Comercial.
Sua única responsabilidade é definir o COMPORTAMENTO / ESTRATÉGIA comercial do SDR neste exato momento da conversa.
Você NÃO gera a resposta de texto final. Você gera as diretrizes comportamentais de ação.

Estratégias e Táticas Comportamentais do Negócio:
${strategiesList}

Regras:
1. Alinhe a estratégia com o objetivo comercial ativo: "${currentObjective}".
2. Se o lead está na defensiva, use "Rapport inicial" ou "Contorno de Objeções".
3. Se o lead está interessado e pronto para avançar, use "Chamada para Ação (CTA)".
4. Se o lead fez uma pergunta direta, a estratégia pode incluir "Educação do Lead".
5. Baseie sua decisão na personalidade e nas diretrizes do SDR: "${sdrBaseInstructions}"`;

    const prompt = `Conversa recente:
${recentMessagesText}

Memórias/Fatos aprendidos sobre o lead:
${memoriesText}

Objetivo Atual Ativo:
"${currentObjective}"

Estratégia Atual:
"${currentStrategy}"

Determine a melhor estratégia comportamental imediata. Você pode manter a atual se ainda for adequada, ou selecionar uma nova.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        nextStrategy: {
          type: Type.STRING,
          description: 'A estratégia de comportamento a ser adotada pelo SDR agora.'
        },
        reason: {
          type: Type.STRING,
          description: 'A explicação do porquê essa estratégia de comportamento foi selecionada.'
        }
      },
      required: ['nextStrategy', 'reason']
    };

    interface StrategyResult {
      nextStrategy: string;
      reason: string;
    }

    try {
      const result = await geminiService.generateJson<StrategyResult>(
        prompt,
        responseSchema,
        systemInstruction
      );

      return {
        nextStrategy: result.nextStrategy || currentStrategy,
        reason: result.reason || 'Manter estratégia atual.'
      };
    } catch (error) {
      console.error('[StrategyEngine] Error evaluating strategy:', error);
      return {
        nextStrategy: currentStrategy,
        reason: 'Falha na avaliação da LLM, mantendo a estratégia atual por segurança.'
      };
    }
  }
}

export const strategyEngine = StrategyEngine.getInstance();

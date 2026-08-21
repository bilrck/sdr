import { repo } from '../../layers/database/repository.js';
import { geminiService } from '../../core/ai/GeminiService.js';

export class ReflectionEngine {
  
  /**
   * Reflete sobre uma conversa de um lead, gera insights,
   * salva a reflexão e converte aprendizados válidos em KnowledgeChunks globais.
   */
  public async reflectOnConversation(tenantId: string, leadId: string): Promise<void> {
    const messages = await repo.getLeadMessages(leadId);
    if (messages.length < 4) {
      console.log(`[ReflectionEngine] Not enough messages to reflect for lead ${leadId}`);
      return;
    }

    const conversationText = messages
      .map(m => `${m.sender === 'SDR' ? 'SDR' : 'LEAD'}: ${m.content}`)
      .join('\n');

    const prompt = `
Você é uma inteligência de auto-reflexão. Sua tarefa é analisar o seguinte histórico de conversa de vendas e extrair insights úteis e globais que podem ser aplicados para futuros atendimentos.

Histórico de Conversa:
${conversationText}

Responda SOMENTE com um JSON estrito no seguinte formato:
{
  "summary": "Resumo conciso sobre o que foi discutido e qual foi o desfecho da conversa.",
  "insights": [
    "Aprendizado ou padrão observado 1",
    "Aprendizado ou padrão observado 2"
  ],
  "shouldCreateKnowledge": true // se os insights contêm informações valiosas sobre objeções comuns, comportamento ou regras implícitas que valem a pena ser memorizadas globalmente.
}
`;

    try {
      const resultObj = await geminiService.generateStructuredResponse(prompt, {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          insights: { type: 'array', items: { type: 'string' } },
          shouldCreateKnowledge: { type: 'boolean' }
        },
        required: ['summary', 'insights', 'shouldCreateKnowledge']
      });

      if (!resultObj || !resultObj.summary) {
        return;
      }

      // 1. Salvar AgentReflection
      await repo.createAgentReflection({
        tenantId,
        leadId,
        summary: resultObj.summary,
        insights: JSON.stringify(resultObj.insights)
      });

      // 2. Se for valioso, cria um KnowledgeSource e Chunks para o aprendizado global
      if (resultObj.shouldCreateKnowledge && resultObj.insights.length > 0) {
        const insightsText = resultObj.insights.join('\n- ');
        
        // Vamos garantir que já existe um Source de Auto-Aprendizado ou cria um novo para a sessão
        const title = `Auto-Aprendizado: Insights do Lead ${leadId.substring(0,6)}`;
        await repo.seedKnowledge(tenantId, title, [
          `Padrões extraídos de uma conversa real:\n- ${insightsText}`
        ]);
        
        console.log(`[ReflectionEngine] Learned new global patterns for tenant ${tenantId}`);
      }

    } catch (e) {
      console.error(`[ReflectionEngine] Failed to reflect on conversation for lead ${leadId}`, e);
    }
  }
}

export const reflectionEngine = new ReflectionEngine();

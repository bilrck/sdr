import { repo } from '../../layers/database/repository.js';
import { geminiService } from '../../core/ai/GeminiService.js';

export class TrainingEngine {
  
  /**
   * Processa uma sessão de treinamento crua (ex: um PDF extraído, texto livre, transcrição).
   * Ele usa a IA para fatiar o conteúdo em chunks ricos e independentes (semânticos).
   */
  public async processTrainingSession(sessionId: string): Promise<void> {
    const session = await repo.getTrainingSessionById(sessionId);
    if (!session || session.processed) return;

    try {
      // Chunking Inteligente usando Gemini / OpenAI
      const prompt = `
Você é um extrator de conhecimento para vendas e atendimento. Analise o seguinte texto bruto (pode ser uma transcrição de conversa, faq, roteiro de vendas ou documento de produto).
Extraia os fatos, regras, objeções e informações importantes em formato de "pedaços de conhecimento" (chunks).
Cada chunk deve ser uma afirmação independente, clara e conter contexto suficiente para ser entendida isoladamente pelo SDR.
Não perca nenhuma informação útil.

Texto bruto:
${session.content}

Retorne um JSON com o formato:
{
  "chunks": [
    "informação independente 1",
    "informação independente 2"
  ]
}
`;

      const resultObj = await geminiService.generateStructuredResponse(prompt, {
        type: 'object',
        properties: {
          chunks: { type: 'array', items: { type: 'string' } }
        },
        required: ['chunks']
      });

      if (resultObj && Array.isArray(resultObj.chunks) && resultObj.chunks.length > 0) {
        // Salva os chunks no banco de vetores
        await repo.seedKnowledge(session.tenantId, session.title, resultObj.chunks);
      }

      // Marca como processado
      await repo.updateTrainingSession(session.id, { processed: true });
      console.log(`[TrainingEngine] Processed training session ${sessionId} successfully.`);

    } catch (e) {
      console.error(`[TrainingEngine] Failed to process training session ${sessionId}`, e);
    }
  }
}

export const trainingEngine = new TrainingEngine();

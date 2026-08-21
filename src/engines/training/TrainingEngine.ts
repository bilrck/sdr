import { repo } from '../../layers/database/repository.js';
import { geminiService } from '../../core/ai/GeminiService.js';

export class TrainingEngine {
  
  /**
   * Processa uma sessão de treinamento crua (ex: um PDF extraído, texto livre, transcrição).
   * Ele usa a IA para fatiar o conteúdo em chunks ricos e independentes (semânticos).
   */
  public async processTrainingSession(sessionId: string): Promise<void> {
    const sessions = await repo.getTrainingSessions(''); // Gambiarra provisória, na real pegar pelo ID direto no banco se puder, mas vou arrumar isso
    // Buscar direto do prisma pra não ter erro de tipagem no fallback de getTrainingSessions que espera tenantId
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const session = await prisma.trainingSession.findUnique({ where: { id: sessionId } });
    
    if (!session || session.processed) return;

    try {
      // Chunking Inteligente usando Gemini
      const prompt = `
Você é um extrator de conhecimento. Analise o seguinte texto bruto (pode ser uma transcrição de conversa, faq, ou documento de produto).
Extraia os fatos, regras, objeções e informações importantes em formato de "pedaços de conhecimento" (chunks).
Cada chunk deve ser uma afirmação independente, clara e conter contexto suficiente para ser entendida isoladamente.
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
    } finally {
      await prisma.$disconnect();
    }
  }
}

export const trainingEngine = new TrainingEngine();

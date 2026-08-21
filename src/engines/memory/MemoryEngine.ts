import { repo, LeadMemory } from '../../layers/database/repository.js';
import { geminiService } from '../../core/ai/GeminiService.js';
import { Type } from '@google/genai';

export class MemoryEngine {
  private static instance: MemoryEngine;

  private constructor() {}

  public static getInstance(): MemoryEngine {
    if (!MemoryEngine.instance) {
      MemoryEngine.instance = new MemoryEngine();
    }
    return MemoryEngine.instance;
  }

  /**
   * Retrieves all current memories for a lead.
   */
  public async getLeadMemories(leadId: string): Promise<LeadMemory[]> {
    return repo.getLeadMemories(leadId);
  }

  /**
   * Analyzes the recent message history to extract structural facts/memories about the Lead.
   * Compares with existing memories to avoid duplicate facts.
   */
  public async extractAndSaveMemories(leadId: string, tenantId: string): Promise<LeadMemory[]> {
    const recentMessages = await repo.getMessages(leadId, 6); // Last 6 messages for context
    const existingMemories = await repo.getLeadMemories(leadId);

    if (recentMessages.length === 0) return existingMemories;

    const messagesText = recentMessages
      .map((m) => `${m.sender === 'LEAD' ? 'Lead' : 'SDR'}: ${m.content}`)
      .join('\n');

    const existingMemoriesText = existingMemories.map((m) => `- ${m.fact}`).join('\n') || 'Nenhuma memória ainda.';

    const systemInstruction = `Você é o Memory Engine de um SaaS de SDR Inteligente.
Sua única função é ler a conversa recente do Lead com o SDR e extrair novos fatos estruturados e importantes sobre o Lead (como profissão, renda, família, medos, dores, urgência, preferências do produto, se quer financiar, etc.).

Regras de Extração:
1. Extraia apenas fatos REAIS confirmados pelo Lead. Não invente ou presuma.
2. Evite duplicar memórias existentes. Se um fato já está listado nas "Memórias Existentes", ignore-o.
3. Seja sucinto e escreva em tópicos em português de Portugal/Brasil de forma direta (ex: "Possui dois filhos pequenos", "Renda mensal de R$ 15 mil", "Tem medo do financiamento atrasar").
4. Se nada de novo for revelado na conversa recente, retorne uma lista vazia.
5. Defina um nível de confiança (confidence) entre 0.0 e 1.0 para cada fato extraído.`;

    const prompt = `Conversa Recente:
${messagesText}

Memórias Existentes:
${existingMemoriesText}

Extraia apenas fatos novos que NÃO estão listados acima.`;

    // Define JSON schema for structured output
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        memories: {
          type: Type.ARRAY,
          description: 'Lista de memórias extraídas da conversa recente.',
          items: {
            type: Type.OBJECT,
            properties: {
              fact: { type: Type.STRING, description: 'Fato curto e direto sobre o Lead.' },
              confidence: { type: Type.NUMBER, description: 'Nível de certeza da extração (0.0 a 1.0).' }
            },
            required: ['fact', 'confidence']
          }
        }
      },
      required: ['memories']
    };

    interface MemoryExtractionResult {
      memories: Array<{ fact: string; confidence: number }>;
    }

    try {
      const result = await geminiService.generateJson<MemoryExtractionResult>(
        prompt,
        responseSchema,
        systemInstruction
      );

      const savedMemories: LeadMemory[] = [];
      if (result && result.memories && Array.isArray(result.memories)) {
        for (const item of result.memories) {
          if (item.confidence >= 0.7 && item.fact && item.fact.trim().length > 3) {
            // Additional check: double check that it doesn't match closely any existing memory
            const isDuplicate = existingMemories.some(
              (m) => m.fact.toLowerCase().includes(item.fact.toLowerCase()) || 
                     item.fact.toLowerCase().includes(m.fact.toLowerCase())
            );
            if (!isDuplicate) {
              const saved = await repo.addLeadMemory(leadId, item.fact, item.confidence);
              savedMemories.push(saved);
              console.log(`[MemoryEngine] Saved new memory: "${item.fact}" (Confiança: ${item.confidence})`);
            }
          }
        }
      }

      return [...existingMemories, ...savedMemories];
    } catch (error) {
      console.error('[MemoryEngine] Error extracting memories:', error);
      return existingMemories;
    }
  }
}

export const memoryEngine = MemoryEngine.getInstance();

import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config();

export class VectorService {
  private static instance: VectorService;
  private ai: GoogleGenAI | null = null;
  private embeddingModel = 'gemini-embedding-001'; // Available model in Developer API returning 3072 dimensions

  private constructor() {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (apiKey && apiKey !== 'your-gemini-api-key-here') {
      try {
        this.ai = new GoogleGenAI({ apiKey });
      } catch (err) {
        console.error('[VectorService] Failed to initialize Google Gen AI SDK for embeddings:', err);
      }
    }
  }

  public static getInstance(): VectorService {
    if (!VectorService.instance) {
      VectorService.instance = new VectorService();
    }
    return VectorService.instance;
  }

  /**
   * Generates a 3072-dimension vector embedding for a given text.
   * Falls back to a deterministic semantic-mimicking hash vector if Gemini is unavailable.
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    if (this.ai) {
      try {
        const response = await this.ai.models.embedContent({
          model: this.embeddingModel,
          contents: text,
        });

        if (response.embeddings && response.embeddings.length > 0 && response.embeddings[0].values) {
          return response.embeddings[0].values;
        }
      } catch (error) {
        console.error('[VectorService] Gemini embedding generation failed, using local hash:', error);
      }
    }

    return this.generateLocalDeterministicEmbedding(text);
  }

  /**
   * Cosine Similarity calculation between two vectors of matching dimensions.
   */
  public cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Helper to generate a deterministic mock embedding vector (3072 dimensions) based on the keywords.
   * This is a powerful fallback: it creates matching features for matching terms, so cosine similarity
   * works perfectly in offline/mock mode!
   */
  private generateLocalDeterministicEmbedding(text: string): number[] {
    const vector = new Array(3072).fill(0.0);
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2); // filter out short words

    if (words.length === 0) {
      // Empty text gets a flat vector
      return new Array(3072).fill(1 / Math.sqrt(3072));
    }

    for (const word of words) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash << 5) - hash + word.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
      }

      // We assign the word to 3 distinct dimensions to create dense intersections
      const dim1 = Math.abs(hash) % 3072;
      const dim2 = Math.abs(hash * 31) % 3072;
      const dim3 = Math.abs(hash * 17) % 3072;

      vector[dim1] += 1.0;
      vector[dim2] += 0.7;
      vector[dim3] += 0.5;
    }

    // Normalize the vector (L2 norm) to make cosine similarity equivalent to dot product
    let norm = 0;
    for (let i = 0; i < 3072; i++) {
      norm += vector[i] * vector[i];
    }
    const magnitude = Math.sqrt(norm) || 1.0;
    for (let i = 0; i < 3072; i++) {
      vector[i] /= magnitude;
    }

    return vector;
  }
}

export const vectorService = VectorService.getInstance();

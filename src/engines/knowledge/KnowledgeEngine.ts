import { repo, KnowledgeChunk } from '../../layers/database/repository.js';

export class KnowledgeEngine {
  private static instance: KnowledgeEngine;

  private constructor() {}

  public static getInstance(): KnowledgeEngine {
    if (!KnowledgeEngine.instance) {
      KnowledgeEngine.instance = new KnowledgeEngine();
    }
    return KnowledgeEngine.instance;
  }

  /**
   * Search knowledge base for relevant chunks.
   * Currently uses database text matching (or memory-matching).
   * In future stages, it will perform vector similarity search using embeddings.
   */
  public async retrieveRelevantKnowledge(
    tenantId: string,
    query: string,
    limit = 3
  ): Promise<string[]> {
    console.log(`[KnowledgeEngine] Searching knowledge for: "${query}"`);
    
    // Clean query to get keywords
    const keywords = this.extractKeywords(query);
    
    const chunks: KnowledgeChunk[] = [];
    
    // Search first with the whole query
    const directResults = await repo.getKnowledgeChunks(tenantId, query, limit);
    chunks.push(...directResults);
    
    // If we need more chunks, search using the primary keywords
    if (chunks.length < limit && keywords.length > 0) {
      const keywordResults = await repo.getKnowledgeChunks(tenantId, keywords[0], limit - chunks.length);
      // Avoid duplicate chunks
      for (const res of keywordResults) {
        if (!chunks.some(c => c.id === res.id)) {
          chunks.push(res);
        }
      }
    }

    return chunks.map(c => c.content);
  }

  private extractKeywords(query: string): string[] {
    // Basic helper to split terms and filter common stopwords
    const stopwords = ['o', 'a', 'os', 'as', 'de', 'do', 'da', 'em', 'um', 'uma', 'para', 'com', 'que', 'se', 'e', 'ou'];
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.includes(w));
  }
}

export const knowledgeEngine = KnowledgeEngine.getInstance();

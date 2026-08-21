import { repo, Message } from '../../layers/database/repository.js';

export class ContextEngine {
  private static instance: ContextEngine;

  private constructor() {}

  public static getInstance(): ContextEngine {
    if (!ContextEngine.instance) {
      ContextEngine.instance = new ContextEngine();
    }
    return ContextEngine.instance;
  }

  /**
   * Decides what the LLM needs to know right now.
   * Instead of sending 100 messages, it returns a curated set of recent messages
   * and optionally summaries of older segments (to be implemented in future phases).
   */
  public async getActiveContext(leadId: string, maxMessages = 10): Promise<{
    recentHistory: Message[];
    contextWindowSummary?: string;
  }> {
    const history = await repo.getMessages(leadId, maxMessages);
    
    // In Stage 1: return the raw N messages. In future phases, we will add auto-summarization of
    // messages older than N, allowing infinite context without bloating LLM tokens.
    return {
      recentHistory: history,
      contextWindowSummary: undefined
    };
  }
}

export const contextEngine = ContextEngine.getInstance();

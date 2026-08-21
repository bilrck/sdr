import { repo, HumanCorrection } from '../../layers/database/repository.js';

export class LearningEngine {
  private static instance: LearningEngine;

  private constructor() {}

  public static getInstance(): LearningEngine {
    if (!LearningEngine.instance) {
      LearningEngine.instance = new LearningEngine();
    }
    return LearningEngine.instance;
  }

  /**
   * Save a manual correction from a supervisor.
   * Generates embedding for the context of the error to allow semantic lookup.
   */
  public async learnFromCorrection(data: {
    tenantId: string;
    leadId?: string;
    errorContext: string;
    originalResponse: string;
    correctedResponse: string;
    feedbackText: string;
  }): Promise<HumanCorrection> {
    console.log(`[LearningEngine] Learning from human correction on context: "${data.errorContext.substring(0, 40)}..."`);
    return repo.saveHumanCorrection(data);
  }

  /**
   * Retrieve similar corrections based on semantic search of the current context.
   */
  public async getRelevantLearning(tenantId: string, currentContext: string, limit = 2): Promise<HumanCorrection[]> {
    console.log(`[LearningEngine] Searching relevant feedback for context: "${currentContext.substring(0, 40)}..."`);
    return repo.searchSimilarCorrections(tenantId, currentContext, limit);
  }

  /**
   * Formats retrieved corrections as few-shot learning instructions for the prompt.
   */
  public formatCorrectionsAsFewShot(corrections: HumanCorrection[]): string {
    if (corrections.length === 0) {
      return '';
    }

    let segment = `\n### HISTÓRICO DE APRENDIZADO (FEEDBACKS DE SUPERVISORES HUMANOS)\n`;
    segment += `Importante: Você cometeu erros no passado nestes contextos. Siga estritamente as diretrizes de correção abaixo:\n\n`;

    for (let i = 0; i < corrections.length; i++) {
      const c = corrections[i];
      segment += `[Aprendizado #${i + 1}]\n`;
      segment += `- Contexto em que ocorreu: "${c.errorContext}"\n`;
      segment += `- Sua resposta antiga (ERRADA): "${c.originalResponse}"\n`;
      segment += `- Feedback de correção: "${c.feedbackText}"\n`;
      segment += `- Como deve responder (CORRETO): "${c.correctedResponse}"\n\n`;
    }

    return segment;
  }
}

export const learningEngine = LearningEngine.getInstance();

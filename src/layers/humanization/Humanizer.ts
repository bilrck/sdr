import { eventBus } from '../../core/event-bus/EventBus.js';
import { EVENT_TYPES, ResponseGeneratedPayload, ResponseReadyPayload } from '../../core/event-bus/events.js';
import { responseFormatter } from './ResponseFormatter.js';

export class Humanizer {
  private static instance: Humanizer;

  private constructor() {
    this.setupListeners();
  }

  public static getInstance(): Humanizer {
    if (!Humanizer.instance) {
      Humanizer.instance = new Humanizer();
    }
    return Humanizer.instance;
  }

  private setupListeners() {
    // Listen to LLM response generated events
    eventBus.subscribe<ResponseGeneratedPayload>(
      EVENT_TYPES.RESPONSE_GENERATED,
      async (event) => {
        await this.humanize(event.tenantId, event.payload);
      }
    );
  }

  /**
   * Humanization Layer: Cleans LLM quirks, standardizes tags, removes AI prefixes
   */
  public async humanize(tenantId: string, payload: ResponseGeneratedPayload) {
    const { leadId, phone, rawContent } = payload;
    console.log(`[Humanizer] Humanizing response for Lead: ${phone}`);

    // 1. Clean prefixes like "SDR:", "Lucas:", "[Resposta]:"
    let cleaned = rawContent.replace(/^(SDR|Lucas|Consultor|Bot|Resposta|IA):\s*/i, '');

    // 2. Clean markdown headers (e.g. "#", "##") since WhatsApp doesn't render them well
    cleaned = cleaned.replace(/^#+\s+/gm, '');

    // 3. Remove triple backticks for code blocks if the LLM accidentally used them
    cleaned = cleaned.replace(/```[a-z]*\n?/g, '');

    // 4. Trim spaces
    cleaned = cleaned.trim();

    // 5. Pass to ResponseFormatter for final formatting
    const formatted = await responseFormatter.format(cleaned);

    console.log(`[Humanizer] Humanization completed. Cleaned content: "${formatted}"`);

    // 6. Publish response.ready event
    eventBus.publish<ResponseReadyPayload>(EVENT_TYPES.RESPONSE_READY, tenantId, {
      leadId,
      phone,
      formattedContent: formatted,
    });
  }
}

export const humanizer = Humanizer.getInstance();

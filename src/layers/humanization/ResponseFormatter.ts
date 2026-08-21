export class ResponseFormatter {
  private static instance: ResponseFormatter;

  private constructor() {}

  public static getInstance(): ResponseFormatter {
    if (!ResponseFormatter.instance) {
      ResponseFormatter.instance = new ResponseFormatter();
    }
    return ResponseFormatter.instance;
  }

  /**
   * Formats text specifically for WhatsApp and mobile chat interfaces.
   */
  public async format(content: string): Promise<string> {
    let text = content;

    // 1. Convert markdown bold **text** to WhatsApp bold *text*
    // Be careful to match double asterisks and replace with single asterisks
    text = text.replace(/\*\*(.*?)\*\*/g, '*$1*');

    // 2. Limit consecutive empty newlines to maximum 2 (double enter)
    text = text.replace(/\n{3,}/g, '\n\n');

    // 3. Ensure no trailing/leading empty lines
    text = text.trim();

    // 4. Ensure question marks have clean spacing
    // e.g. "tudo bem ? " -> "tudo bem?"
    text = text.replace(/\s+\?/g, '?');

    // 5. In future phases: check for multiple Call to Actions (CTAs) and warn or rewrite
    
    return text;
  }
}

export const responseFormatter = ResponseFormatter.getInstance();

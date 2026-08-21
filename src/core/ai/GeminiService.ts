import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { repo } from '../../layers/database/repository.js';
import * as dotenv from 'dotenv';

dotenv.config();

export class AIService {
  private static instance: AIService;
  private geminiClient: GoogleGenAI | null = null;
  private openaiClient: OpenAI | null = null;
  private currentProvider: 'GEMINI' | 'OPENAI' = (process.env.AI_PROVIDER as any) || 'GEMINI';
  private geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  private openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  private lastRequestTime = 0;
  private lastSettingsFetch = 0;

  private constructor() {
    this.initDefaultClients();
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  private initDefaultClients() {
    // Gemini setup
    const geminiKey = process.env.GEMINI_API_KEY || '';
    if (geminiKey && geminiKey !== 'your-gemini-api-key-here') {
      try {
        this.geminiClient = new GoogleGenAI({ apiKey: geminiKey });
        console.log(`[AIService] Initialized Google GenAI with model ${this.geminiModel}.`);
      } catch (err) {
        console.error('[AIService] Failed to initialize Google GenAI SDK:', err);
      }
    }

    // OpenAI setup
    const openaiKey = process.env.OPENAI_API_KEY || '';
    if (openaiKey && openaiKey !== 'your-openai-api-key-here') {
      try {
        this.openaiClient = new OpenAI({ apiKey: openaiKey });
        console.log(`[AIService] Initialized OpenAI SDK with model ${this.openaiModel}.`);
      } catch (err) {
        console.error('[AIService] Failed to initialize OpenAI SDK:', err);
      }
    }
  }

  /**
   * Sync active provider, models, and keys from database SystemSetting
   */
  public async syncSettings(): Promise<void> {
    const now = Date.now();
    // Cache settings for 5 seconds to prevent DB hammering
    if (now - this.lastSettingsFetch < 5000) return;
    this.lastSettingsFetch = now;

    try {
      const settings = await repo.getSystemSettings();
      if (settings) {
        this.currentProvider = (settings.aiProvider || 'GEMINI').toUpperCase() as 'GEMINI' | 'OPENAI';
        
        if (settings.geminiModel) this.geminiModel = settings.geminiModel;
        if (settings.openaiModel) this.openaiModel = settings.openaiModel;

        const effectiveGeminiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
        if (effectiveGeminiKey && effectiveGeminiKey !== 'your-gemini-api-key-here') {
          this.geminiClient = new GoogleGenAI({ apiKey: effectiveGeminiKey });
        }

        const effectiveOpenAIKey = settings.openaiApiKey || process.env.OPENAI_API_KEY || '';
        if (effectiveOpenAIKey && effectiveOpenAIKey !== 'your-openai-api-key-here') {
          this.openaiClient = new OpenAI({ apiKey: effectiveOpenAIKey });
        }
      }
    } catch (err) {
      console.warn('[AIService] Could not sync system settings from DB, using env defaults:', err);
    }
  }

  public getActiveProvider(): 'GEMINI' | 'OPENAI' {
    return this.currentProvider;
  }

  public isMockMode(): boolean {
    return this.currentProvider === 'GEMINI' ? this.geminiClient === null : this.openaiClient === null;
  }

  private throttleQueue: Promise<void> = Promise.resolve();

  private async throttle() {
    this.throttleQueue = this.throttleQueue.then(async () => {
      const now = Date.now();
      const timeSinceLastReq = now - this.lastRequestTime;
      if (timeSinceLastReq < 1500) {
        await new Promise(r => setTimeout(r, 1500 - timeSinceLastReq));
      }
      this.lastRequestTime = Date.now();
    });
    await this.throttleQueue;
  }

  private extractKeyTerms(text: string): string[] {
    const stopwords = ['qual', 'como', 'quando', 'onde', 'para', 'esse', 'esta', 'este', 'está', 'mais', 'menos', 'pelo', 'pela', 'nosso', 'nossa', 'voce', 'você', 'seria', 'existe', 'possui', 'fazer', 'feito', 'sobre', 'tipo', 'todos', 'todas'];
    return text.split(/\s+/)
      .map(w => w.toLowerCase().replace(/[^a-zà-ÿ]/g, ''))
      .filter(w => w.length > 3 && !stopwords.includes(w));
  }

  private buildSimpleModeResponse(prompt: string, systemInstruction: string): string {
    const flowMatch = systemInstruction.match(/FLUXO DE QUALIFICAÇÃO OBRIGATÓRIO:\n"([^"]+)"/s);
    const flowText = flowMatch ? flowMatch[1] : '';
    
    const personaMatch = systemInstruction.match(/Você é ([A-Za-zÀ-ÿ]+)[, ]/i);
    const personaName = personaMatch ? personaMatch[1].trim() : 'Consultor';

    const historyMatch = prompt.match(/HISTÓRICO RECENTE DA CONVERSA:\n([\s\S]+?)\n\n###/);
    const historyText = historyMatch ? historyMatch[1] : '';

    const questions = flowText.split('\n')
      .map(q => q.replace(/^\d+[\.)\s]*/, '').trim())
      .filter(q => q.length > 0);

    const historyLower = historyText.toLowerCase();
    let nextQuestion = '';

    for (const question of questions) {
      const keyTerms = this.extractKeyTerms(question).slice(0, 3);
      let answered = false;
      if (keyTerms.length > 0) {
        answered = keyTerms.some(term => historyLower.includes(term));
      }
      if (!answered) {
        nextQuestion = question;
        break;
      }
    }

    if (!nextQuestion) {
      const postMatch = systemInstruction.match(/AÇÃO DE ENCERRAMENTO \(PÓS-QUALIFICAÇÃO\):\n"([^"]+)"/s);
      const postAction = postMatch ? postMatch[1] : '';
      return `Perfeito! Já tenho tudo. ${postAction}`;
    }

    const hasHistory = historyText.includes(`${personaName}:`);
    if (!hasHistory) {
      return `Olá! Sou ${personaName}. 😊 Para te ajudar: ${nextQuestion}`;
    }

    const promptLower = prompt.toLowerCase();
    if (promptLower.includes('não entendi') || promptLower.includes('nao entendi') || promptLower.includes('como assim')) {
      return `Sem problema, vou reformular: ${nextQuestion}`;
    }

    const transitions = ['Anotado! Agora:', 'Certo! E por favor:', 'Entendido! Mais uma:'];
    const transition = transitions[Math.floor(Math.random() * transitions.length)];
    
    return `${transition} ${nextQuestion}`;
  }

  private generateContextualFallback(prompt: string, systemInstruction?: string): string {
    const sysInst = systemInstruction || '';
    const personaMatch = sysInst.match(/Você é ([A-Za-zÀ-ÿ]+)[, ]/i);
    const personaName = personaMatch ? personaMatch[1].trim() : 'Consultor';

    if (prompt.includes('HISTÓRICO RECENTE') || prompt.includes(personaName + ':')) {
      return `Entendido! Pode me contar mais?`;
    }

    return `Olá! Sou ${personaName}. Que bom falar com você! 😊 Como posso te ajudar?`;
  }

  private generateContextualJsonFallback<T>(prompt: string, systemInstruction?: string): T {
    const promptLower = prompt.toLowerCase();
    const sysLower = (systemInstruction || '').toLowerCase();

    if (promptLower.includes('isqualified') || sysLower.includes('modo simples') || sysLower.includes('qualificação direta')) {
      return {
        isQualified: false,
        response: this.buildSimpleModeResponse(prompt, systemInstruction || ''),
        summary: 'Lead em qualificação.'
      } as unknown as T;
    }

    if (promptLower.includes('objective') || sysLower.includes('objective engine')) {
      let nextStatus = 'ACTIVE';
      let nextObjective = 'Continuar qualificando e conhecendo o lead';
      let reason = 'Conversa em andamento.';

      if (promptLower.includes('humano') || promptLower.includes('atendente') || promptLower.includes('gerente') || promptLower.includes('parar')) {
        nextStatus = 'HANDOFF';
        nextObjective = 'Transferência para atendimento humano';
        reason = 'Lead solicitou atendimento humano ou acionou condição de parada.';
      } else if (promptLower.includes('aluguel') || promptLower.includes('desisto') || promptLower.includes('sem interesse') || promptLower.includes('não quero') || promptLower.includes('nao quero')) {
        nextStatus = 'DISQUALIFIED';
        nextObjective = 'Encerramento de contato';
        reason = 'Lead demonstrou desinteresse ou perfil incompatível.';
      }

      return {
        nextObjective,
        nextStatus,
        reason
      } as unknown as T;
    }

    if (promptLower.includes('memory') || promptLower.includes('memória')) {
      return { memories: [] } as unknown as T;
    }

    if (promptLower.includes('strategy') || sysLower.includes('strategy engine')) {
      return {
        nextStrategy: 'Qualificação ativa',
        reason: 'Continuar coletando informações.'
      } as unknown as T;
    }

    return {
      response: this.generateContextualFallback(prompt, systemInstruction),
      isQualified: false,
      memories: [],
      nextObjective: 'Atendimento e qualificação',
      nextStrategy: 'Atendimento consultivo',
      reason: 'Resposta de contingência contextual.'
    } as unknown as T;
  }

  public async generateText(prompt: string, systemInstruction?: string, retryCount = 0): Promise<string> {
    await this.syncSettings();

    // 1. OPENAI Provider
    if (this.currentProvider === 'OPENAI' && this.openaiClient) {
      try {
        await this.throttle();
        const messages: any[] = [];
        if (systemInstruction) {
          messages.push({ role: 'system', content: systemInstruction });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await this.openaiClient.chat.completions.create({
          model: this.openaiModel,
          messages,
          temperature: 0.7,
        });

        return response.choices[0]?.message?.content || '';
      } catch (error: any) {
        const isRetryable = error?.status === 429 || error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('429');
        if (isRetryable && retryCount < 2) {
          const delay = retryCount === 0 ? 2000 : 4000;
          console.warn(`[AIService-OpenAI] Temporary error (${error?.status || '503/429'}). Retrying in ${delay}ms (attempt ${retryCount + 1}/2)...`);
          await new Promise(r => setTimeout(r, delay));
          return this.generateText(prompt, systemInstruction, retryCount + 1);
        }
        console.error('[AIService-OpenAI] Error calling OpenAI API, falling back to dynamic fallback:', error);
        return this.generateContextualFallback(prompt, systemInstruction);
      }
    }

    // 2. GEMINI Provider
    if (this.geminiClient) {
      try {
        await this.throttle();
        const response = await this.geminiClient.models.generateContent({
          model: this.geminiModel,
          contents: prompt,
          config: systemInstruction ? {
            systemInstruction: systemInstruction
          } : undefined
        });
        
        return response.text || '';
      } catch (error: any) {
        const isRetryable = error?.status === 429 || error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED') || error?.message?.includes('high demand');
        if (isRetryable && retryCount < 2) {
          const delay = retryCount === 0 ? 2500 : 5000;
          console.warn(`[AIService-Gemini] Temporary error (${error?.status || '503/429'}). Retrying in ${delay}ms (attempt ${retryCount + 1}/2)...`);
          await new Promise(r => setTimeout(r, delay));
          return this.generateText(prompt, systemInstruction, retryCount + 1);
        }
        if (error?.status === 404 || error?.message?.includes('404')) {
           console.error(`[AIService-Gemini] Model not found error for ${this.geminiModel}:`, error);
        }
        console.error('[AIService-Gemini] Error calling Gemini API, falling back to dynamic fallback:', error);
        return this.generateContextualFallback(prompt, systemInstruction);
      }
    }

    return this.generateContextualFallback(prompt, systemInstruction);
  }

  public async generateJson<T>(prompt: string, schema: any, systemInstruction?: string, retryCount = 0): Promise<T> {
    await this.syncSettings();

    // 1. OPENAI Provider
    if (this.currentProvider === 'OPENAI' && this.openaiClient) {
      try {
        await this.throttle();
        const messages: any[] = [];
        const fullSysInstruction = `${systemInstruction || ''}\nResponda ESTRITAMENTE em formato JSON válido.`.trim();
        messages.push({ role: 'system', content: fullSysInstruction });
        messages.push({ role: 'user', content: prompt });

        const response = await this.openaiClient.chat.completions.create({
          model: this.openaiModel,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.2,
        });

        const text = response.choices[0]?.message?.content || '{}';
        return JSON.parse(text) as T;
      } catch (error: any) {
        const isRetryable = error?.status === 429 || error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('429');
        if (isRetryable && retryCount < 2) {
          const delay = retryCount === 0 ? 2000 : 4000;
          console.warn(`[AIService-OpenAI] JSON Temporary error (${error?.status || '503/429'}). Retrying in ${delay}ms (attempt ${retryCount + 1}/2)...`);
          await new Promise(r => setTimeout(r, delay));
          return this.generateJson<T>(prompt, schema, systemInstruction, retryCount + 1);
        }
        console.error('[AIService-OpenAI] Error generating JSON, falling back:', error);
        return this.generateContextualJsonFallback<T>(prompt, systemInstruction);
      }
    }

    // 2. GEMINI Provider
    if (this.geminiClient) {
      try {
        await this.throttle();
        const response = await this.geminiClient.models.generateContent({
          model: this.geminiModel,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: schema,
          }
        });
        
        const text = response.text || '{}';
        return JSON.parse(text) as T;
      } catch (error: any) {
        const isRetryable = error?.status === 429 || error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED') || error?.message?.includes('high demand');
        if (isRetryable && retryCount < 2) {
          const delay = retryCount === 0 ? 2500 : 5000;
          console.warn(`[AIService-Gemini] JSON Temporary error (${error?.status || '503/429'}). Retrying in ${delay}ms (attempt ${retryCount + 1}/2)...`);
          await new Promise(r => setTimeout(r, delay));
          return this.generateJson<T>(prompt, schema, systemInstruction, retryCount + 1);
        }
        if (error?.status === 404 || error?.message?.includes('404')) {
           console.error(`[AIService-Gemini] Model not found error for ${this.geminiModel}:`, error);
        }
        console.error('[AIService-Gemini] Error generating structured JSON, trying text parsing fallback:', error);
        
        const textResponse = await this.generateText(prompt + '\nRetorne estritamente em formato JSON válido.', systemInstruction);
        try {
          const match = textResponse.match(/\{[\s\S]*\}/);
          if (match) {
            return JSON.parse(match[0]) as T;
          }
          return JSON.parse(textResponse) as T;
        } catch {
          return this.generateContextualJsonFallback<T>(prompt, systemInstruction);
        }
      }
    }

    return this.generateContextualJsonFallback<T>(prompt, systemInstruction);
  }

  public async generateStructuredResponse(prompt: string, schema: any, systemInstruction?: string): Promise<any> {
    return this.generateJson(prompt, schema, systemInstruction);
  }

  /**
   * Test connection with a specified provider and credentials
   */
  public async testProviderConnection(provider: 'GEMINI' | 'OPENAI', apiKey: string, model: string): Promise<{ success: boolean; message: string; output?: string }> {
    if (!apiKey) {
      return { success: false, message: 'Chave de API não informada.' };
    }

    try {
      if (provider === 'OPENAI') {
        const client = new OpenAI({ apiKey });
        const res = await client.chat.completions.create({
          model: model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Você é um assistente de teste de conexão.' },
            { role: 'user', content: 'Responda apenas: OK_CONEXAO_OPENAI' }
          ],
          max_tokens: 30,
        });
        const output = res.choices[0]?.message?.content?.trim() || '';
        return { success: true, message: `Conexão com OpenAI (${model || 'gpt-4o-mini'}) bem-sucedida!`, output };
      } else {
        const client = new GoogleGenAI({ apiKey });
        const res = await client.models.generateContent({
          model: model || 'gemini-2.5-flash',
          contents: 'Responda apenas: OK_CONEXAO_GEMINI',
        });
        const output = res.text?.trim() || '';
        return { success: true, message: `Conexão com Google Gemini (${model || 'gemini-2.5-flash'}) bem-sucedida!`, output };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Falha na conexão: ${err.message || String(err)}`
      };
    }
  }
}

// Backward-compatible exports
export const aiService = AIService.getInstance();
export const geminiService = aiService;
export const GeminiService = AIService;

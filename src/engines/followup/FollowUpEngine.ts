import { repo, SDRConfig, Lead } from '../../layers/database/repository.js';
import { outboundConnector } from '../../core/whatsapp/OutboundConnector.js';
import { aiService } from '../../core/ai/GeminiService.js';

export interface FollowUpRunResult {
  analyzed: number;
  sent: number;
  skipped: number;
  details: Array<{
    leadId: string;
    phone: string;
    name?: string | null;
    status: string;
    attempt: number;
    messageSent?: string;
    reason?: string;
  }>;
}

export class FollowUpEngine {
  private static instance: FollowUpEngine;
  private isProcessing = false;

  private constructor() {}

  public static getInstance(): FollowUpEngine {
    if (!FollowUpEngine.instance) {
      FollowUpEngine.instance = new FollowUpEngine();
    }
    return FollowUpEngine.instance;
  }

  /**
   * Check if current time falls within configured business hours and days
   */
  public isWithinBusinessHours(config: SDRConfig): boolean {
    const now = new Date();
    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const currentDay = now.getDay();
    // Normalize to 1=Mon, 7=Sun
    const dayNormalized = currentDay === 0 ? 7 : currentDay;

    const allowedDays = (config.businessDays || '1,2,3,4,5')
      .split(',')
      .map(d => parseInt(d.trim(), 10));

    if (!allowedDays.includes(dayNormalized)) {
      return false;
    }

    const [startH, startM] = (config.businessHoursStart || '08:00').split(':').map(Number);
    const [endH, endM] = (config.businessHoursEnd || '18:00').split(':').map(Number);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  /**
   * Execute follow-up cycle for a specific tenant or all active tenants
   */
  public async processFollowUps(tenantId?: string, forceIgnoreBusinessHours = false): Promise<FollowUpRunResult> {
    if (this.isProcessing) {
      return {
        analyzed: 0,
        sent: 0,
        skipped: 0,
        details: [{ leadId: '', phone: '', status: 'BUSY', attempt: 0, reason: 'Ciclo de follow-up já em execução.' }]
      };
    }

    this.isProcessing = true;
    const result: FollowUpRunResult = {
      analyzed: 0,
      sent: 0,
      skipped: 0,
      details: []
    };

    try {
      const tenantsToProcess = tenantId ? [{ id: tenantId }] : await repo.getTenants();

      for (const t of tenantsToProcess) {
        const config = await repo.getSDRConfig(t.id);
        if (!config) continue;

        if (!config.followUpEnabled) {
          result.details.push({
            leadId: '',
            phone: '',
            status: 'SKIPPED',
            attempt: 0,
            reason: `Follow-up desativado para a empresa ${t.id}`
          });
          continue;
        }

        if (!forceIgnoreBusinessHours && !this.isWithinBusinessHours(config)) {
          result.details.push({
            leadId: '',
            phone: '',
            status: 'SKIPPED',
            attempt: 0,
            reason: `Fora do horário comercial configurado (${config.businessHoursStart || '08:00'} às ${config.businessHoursEnd || '18:00'})`
          });
          continue;
        }

        const delayHours = config.followUpDelayHours ?? 2;
        const maxAttempts = config.followUpMaxAttempts ?? 3;

        const eligibleLeads = await repo.getEligibleFollowUpLeads(t.id, delayHours, maxAttempts);
        result.analyzed += eligibleLeads.length;

        for (const lead of eligibleLeads) {
          // ─── ANTI-CONFLICT SAFEGUARDS ──────────────────────────────
          // 1. Never follow up on paused, qualified, disqualified or handoff leads
          if (lead.botPaused || ['QUALIFIED', 'DISQUALIFIED', 'HANDOFF', 'UNRESPONSIVE'].includes(lead.status)) {
            result.skipped++;
            result.details.push({
              leadId: lead.id,
              phone: lead.phone,
              name: lead.name,
              status: 'SKIPPED',
              attempt: lead.followUpCount || 0,
              reason: `Lead com status protegido (${lead.status}) ou bot pausado.`
            });
            continue;
          }

          // 2. Check recent messages: If lead was the last to speak in the last 15 min, do not interrupt
          const messages = (lead as any).messages || [];
          if (messages.length > 0) {
            const lastMsg = messages[0];
            const isLastFromLead = lastMsg.sender === 'LEAD' || lastMsg.sender === 'lead';
            const timeSinceLastMsg = Date.now() - new Date(lastMsg.createdAt).getTime();
            if (isLastFromLead && timeSinceLastMsg < 15 * 60 * 1000) {
              result.skipped++;
              result.details.push({
                leadId: lead.id,
                phone: lead.phone,
                name: lead.name,
                status: 'SKIPPED',
                attempt: lead.followUpCount || 0,
                reason: 'Lead enviou mensagem recente (<15m), aguardando interação normal.'
              });
              continue;
            }
          }

          const currentAttempt = (lead.followUpCount || 0) + 1;

          // 3. Generate Follow-up Message based on Mode & Settings
          let followUpMsg = '';

          if (config.followUpMode === 'CUSTOM_SEQUENCE' && config.followUpSequence) {
            try {
              const seq = JSON.parse(config.followUpSequence);
              if (Array.isArray(seq) && seq.length > 0) {
                const seqIndex = Math.min(currentAttempt - 1, seq.length - 1);
                const template = seq[seqIndex] || seq[0];
                followUpMsg = template
                  .replace(/\{nome\}/gi, lead.name || 'tudo bem')
                  .replace(/\{name\}/gi, lead.name || 'tudo bem');
              }
            } catch (err) {
              console.warn('[FollowUpEngine] Error parsing custom sequence JSON, fallback to AI:', err);
            }
          }

          if (!followUpMsg) {
            followUpMsg = await this.generateAIFollowUpMessage(config, lead, messages, currentAttempt);
          }

          // 4. Send Message via WhatsApp Connector
          if (followUpMsg && followUpMsg.trim().length > 0) {
            await outboundConnector.sendMessage(t.id, {
              phone: lead.phone,
              leadId: lead.id,
              formattedContent: followUpMsg,
            });
            await repo.createMessage(lead.id, 'SDR', followUpMsg);
            await repo.incrementLeadFollowUp(lead.id);

            // Apply configured action if lead reached max attempts
            if (currentAttempt >= maxAttempts) {
              const action = config.followUpActionAfterLimit || 'PAUSE_FOLLOWUP';
              if (action === 'UNRESPONSIVE') {
                await repo.updateLeadFull(lead.id, { status: 'UNRESPONSIVE', botPaused: true });
              } else if (action === 'DISQUALIFY') {
                await repo.updateLeadFull(lead.id, {
                  status: 'DISQUALIFIED',
                  botPaused: true,
                  notes: (lead.notes ? lead.notes + '\n' : '') + 'Desqualificado automaticamente: limite de tentativas de follow-up atingido.'
                });
              } else {
                // Default 'PAUSE_FOLLOWUP': bot paused for follow-ups
                await repo.updateLeadFull(lead.id, { botPaused: true });
              }
            }

            await repo.createAnalyticsEvent({
              tenantId: t.id,
              leadId: lead.id,
              eventType: 'followup_sent',
              metadata: JSON.stringify({ attempt: currentAttempt, sdrMode: config.sdrMode, limitReached: currentAttempt >= maxAttempts }),
            });

            result.sent++;
            result.details.push({
              leadId: lead.id,
              phone: lead.phone,
              name: lead.name,
              status: 'SENT',
              attempt: currentAttempt,
              messageSent: followUpMsg
            });
          }
        }
      }
    } catch (err) {
      console.error('[FollowUpEngine] Error in processFollowUps:', err);
    } finally {
      this.isProcessing = false;
    }

    return result;
  }

  /**
   * Generate intelligent contextual follow-up message respecting SDR Mode
   */
  private async generateAIFollowUpMessage(
    config: SDRConfig,
    lead: Lead,
    recentMessages: any[],
    attempt: number
  ): Promise<string> {
    const personaName = config.personaName || 'Consultor';
    const sdrMode = config.sdrMode || 'ADVANCED';
    const historyText = recentMessages
      .slice(0, 4)
      .reverse()
      .map(m => `${m.sender === 'LEAD' ? 'Lead' : personaName}: ${m.content}`)
      .join('\n');

    if (sdrMode === 'SIMPLE') {
      // Simple Mode: gently remind of the unanswered qualification step
      const prompt = `Você é ${personaName}, assistente comercial.
O lead ${lead.name || ''} parou de responder há algum tempo.
Fluxo de qualificação da empresa:
"${config.qualificationFlow}"

Histórico recente:
${historyText || 'Nenhuma mensagem recente.'}

Gere uma mensagem curta e simpática de follow-up (tentativa ${attempt}) para reengajar o lead e relembrar a pergunta pendente com naturalidade (máximo 25 palavras). Sem saudações robóticas.`;

      const res = await aiService.generateText(prompt);
      return res.replace(/^["']|["']$/g, '').trim() || `Olá ${lead.name ? lead.name : ''}! Passando para ver se conseguiu verificar minha mensagem anterior. 😊`;
    } else {
      // Advanced Mode: re-engage based on current objective & consultive approach
      const prompt = `Você é ${personaName}, SDR consultivo de alta performance.
Personalidade: ${config.personality || 'Empático, prestativo e focado em valor.'}
O lead ${lead.name || ''} está sem responder há algumas horas. Esta é a tentativa de follow-up número ${attempt}.

Histórico recente:
${historyText || 'Lead demonstrou interesse inicial.'}

Crie uma mensagem curta, elegante e natural de reengajamento no WhatsApp (máximo 30 palavras).
Mostre que você está à disposição para ajudar, sem parecer insistente ou robótico.`;

      const res = await aiService.generateText(prompt);
      return res.replace(/^["']|["']$/g, '').trim() || `Oi ${lead.name ? lead.name : ''}! Tudo bem? Passando para ver se ficou com alguma dúvida sobre o que conversamos. Estou à disposição!`;
    }
  }
}

export const followUpEngine = FollowUpEngine.getInstance();

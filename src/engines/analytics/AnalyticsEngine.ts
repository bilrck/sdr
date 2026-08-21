import { eventBus } from '../../core/event-bus/EventBus.js';
import { EVENT_TYPES, MessageReceivedPayload, LeadStateUpdatedPayload, ResponseReadyPayload } from '../../core/event-bus/events.js';
import { repo } from '../../layers/database/repository.js';

export class AnalyticsEngine {
  private static instance: AnalyticsEngine;

  private constructor() {
    this.setupListeners();
  }

  public static getInstance(): AnalyticsEngine {
    if (!AnalyticsEngine.instance) {
      AnalyticsEngine.instance = new AnalyticsEngine();
    }
    return AnalyticsEngine.instance;
  }

  private setupListeners() {
    // 1. Track incoming message event
    eventBus.subscribe<MessageReceivedPayload>(
      EVENT_TYPES.MESSAGE_RECEIVED,
      async (event) => {
        const { phone, content } = event.payload;
        const lead = await repo.getLeadByPhone(event.tenantId, phone);
        
        await repo.createAnalyticsEvent({
          tenantId: event.tenantId,
          leadId: lead?.id,
          eventType: 'message_received',
          metadata: JSON.stringify({ charCount: content.length, wordCount: content.split(/\s+/).length }),
        });
      }
    );

    // 2. Track lead state transitions (Objective & Strategy updates)
    eventBus.subscribe<LeadStateUpdatedPayload>(
      EVENT_TYPES.LEAD_STATE_UPDATED,
      async (event) => {
        const { leadId, currentObjective, currentStrategy } = event.payload;
        
        // Log snapshot of state
        await repo.createAnalyticsEvent({
          tenantId: event.tenantId,
          leadId: leadId,
          eventType: 'lead_state_snapshot',
          objective: currentObjective,
          strategy: currentStrategy,
        });
      }
    );

    // 3. Track outbound message event
    eventBus.subscribe<ResponseReadyPayload>(
      EVENT_TYPES.RESPONSE_READY,
      async (event) => {
        const { leadId, formattedContent } = event.payload;
        const state = await repo.getLeadStrategyState(leadId);
        
        await repo.createAnalyticsEvent({
          tenantId: event.tenantId,
          leadId,
          eventType: 'message_sent',
          objective: state?.currentObjective,
          strategy: state?.currentStrategy,
          metadata: JSON.stringify({ charCount: formattedContent.length, wordCount: formattedContent.split(/\s+/).length }),
        });
      }
    );
  }

  /**
   * Generates a complete commercial and conversational analytics dashboard for a Tenant.
   */
  public async getDashboard(tenantId: string) {
    const events = await repo.getAnalyticsEvents(tenantId);
    
    const totalReceived = events.filter(e => e.eventType === 'message_received').length;
    const totalSent = events.filter(e => e.eventType === 'message_sent').length;
    
    // Group objectives and strategies used
    const objectiveCount: Record<string, number> = {};
    const strategyCount: Record<string, number> = {};
    const uniqueLeads = new Set<string>();

    for (const event of events) {
      if (event.leadId) {
        uniqueLeads.add(event.leadId);
      }
      if (event.objective) {
        objectiveCount[event.objective] = (objectiveCount[event.objective] || 0) + 1;
      }
      if (event.strategy) {
        strategyCount[event.strategy] = (strategyCount[event.strategy] || 0) + 1;
      }
    }

    // Average message lengths
    let totalWordCount = 0;
    let wordCountInstances = 0;

    for (const event of events) {
      if (event.metadata) {
        try {
          const meta = JSON.parse(event.metadata);
          if (meta.wordCount) {
            totalWordCount += meta.wordCount;
            wordCountInstances++;
          }
        } catch {}
      }
    }

    const avgWords = wordCountInstances > 0 ? Math.round(totalWordCount / wordCountInstances) : 0;

    return {
      overview: {
        totalInteractions: events.length,
        activeLeadsCount: uniqueLeads.size,
        messagesReceived: totalReceived,
        messagesSent: totalSent,
        sdrResponseRatio: totalReceived > 0 ? (totalSent / totalReceived).toFixed(2) : '0.00',
      },
      conversational: {
        avgWordLength: avgWords,
        topObjectives: Object.entries(objectiveCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name, count })),
        topStrategies: Object.entries(strategyCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name, count })),
      }
    };
  }
}

export const analyticsEngine = AnalyticsEngine.getInstance();

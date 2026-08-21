import { z } from 'zod';

// Zod schemas for event payloads
export const MessageReceivedSchema = z.object({
  phone: z.string(),
  content: z.string(),
  senderName: z.string().optional(),
});

export const LeadStateUpdatedSchema = z.object({
  leadId: z.string(),
  phone: z.string(),
  status: z.string(),
  currentObjective: z.string(),
  currentStrategy: z.string(),
  lastMessageContent: z.string(),
  isOutsideBusinessHours: z.boolean().optional(),
});

export const ResponseGeneratedSchema = z.object({
  leadId: z.string(),
  phone: z.string(),
  rawContent: z.string(),
});

export const ResponseReadySchema = z.object({
  leadId: z.string(),
  phone: z.string(),
  formattedContent: z.string(),
});

// TypeScript interfaces inferred from schemas
export type MessageReceivedPayload = z.infer<typeof MessageReceivedSchema>;
export type LeadStateUpdatedPayload = z.infer<typeof LeadStateUpdatedSchema>;
export type ResponseGeneratedPayload = z.infer<typeof ResponseGeneratedSchema>;
export type ResponseReadyPayload = z.infer<typeof ResponseReadySchema>;

export const EVENT_TYPES = {
  MESSAGE_RECEIVED: 'message.received',
  LEAD_STATE_UPDATED: 'lead.state.updated',
  RESPONSE_GENERATED: 'response.generated',
  RESPONSE_READY: 'response.ready',
} as const;

import { eventBus } from '../event-bus/EventBus.js';
import { EVENT_TYPES, ResponseReadyPayload } from '../event-bus/events.js';
import { repo } from '../../layers/database/repository.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

export class OutboundConnector {
  private static instance: OutboundConnector;
  private apiUrl: string;
  private apiKey: string;
  private apiInstance: string;

  private constructor() {
    this.apiUrl = process.env.EVOLUTION_API_URL || '';
    this.apiKey = process.env.EVOLUTION_API_KEY || '';
    this.apiInstance = process.env.EVOLUTION_API_INSTANCE || '';
    
    this.setupListeners();
  }

  public static getInstance(): OutboundConnector {
    if (!OutboundConnector.instance) {
      OutboundConnector.instance = new OutboundConnector();
    }
    return OutboundConnector.instance;
  }

  private setupListeners() {
    // Listen to final formatted responses ready to be sent
    eventBus.subscribe<ResponseReadyPayload>(
      EVENT_TYPES.RESPONSE_READY,
      async (event) => {
        await this.sendMessage(event.tenantId, event.payload);
      }
    );
  }

  /**
   * Sends the outbound message to the lead via Evolution API.
   * Splitting paragraph text into multiple bubbles if enabled.
   * Falls back to console log if the Evolution API is not configured.
   */
  public async sendMessage(tenantId: string, payload: ResponseReadyPayload): Promise<boolean> {
    const { phone, formattedContent } = payload;

    // Check for media tags like [SEND_MEDIA: decorado_video]
    const mediaTagRegex = /\[SEND_MEDIA:\s*([^\]]+)\]/g;
    const mediaTriggerKeys: string[] = [];
    let match;
    while ((match = mediaTagRegex.exec(formattedContent)) !== null) {
      mediaTriggerKeys.push(match[1].trim());
    }

    // Clean text by removing the tags
    const cleanContent = formattedContent.replace(mediaTagRegex, '').trim();

    // Load media assets that match the triggers
    const mediaAssetsToSend: any[] = [];
    if (mediaTriggerKeys.length > 0) {
      try {
        const tenantAssets = await repo.getMediaAssets(tenantId);
        for (const key of mediaTriggerKeys) {
          const matchedAsset = tenantAssets.find(a => a.triggerValue.toLowerCase() === key.toLowerCase());
          if (matchedAsset) {
            mediaAssetsToSend.push(matchedAsset);
          } else {
            console.log(`[OutboundConnector] No media asset found matching trigger key: "${key}"`);
          }
        }
      } catch (err) {
        console.error('[OutboundConnector] Error loading media assets for triggers:', err);
      }
    }

    // Check if Evolution API details are configured
    if (!this.apiUrl || !this.apiKey || !this.apiInstance) {
      console.log(`\n\x1b[35m[OutboundConnector] [MOCK] Sending WhatsApp Message to ${phone}:\x1b[0m`);
      console.log(`\x1b[90m--------------------------------------------------------------\n${cleanContent}\n--------------------------------------------------------------\x1b[0m\n`);

      for (const asset of mediaAssetsToSend) {
        console.log(`\n\x1b[36m[OutboundConnector] [MOCK MEDIA] Sending ${asset.mediaType.toUpperCase()} to ${phone}:\x1b[0m`);
        console.log(`\x1b[90m--------------------------------------------------------------`);
        console.log(`  URL: ${asset.mediaUrl}`);
        console.log(`  Legenda: ${asset.caption || 'Sem legenda'}`);
        console.log(`--------------------------------------------------------------\x1b[0m\n`);
      }
      return true;
    }

    // 1. Fetch SDR Config to check splitMessages, maxBubbles, and target instanceName
    let splitEnabled = true;
    let maxBubbles = 3;
    let targetInstance = `tenant-${tenantId}`;
    try {
      const sdrConfig = await repo.getSDRConfigByTenant(tenantId);
      if (sdrConfig) {
        splitEnabled = sdrConfig.splitMessages;
        maxBubbles = sdrConfig.maxBubbles;
        if (sdrConfig.instanceName) {
          targetInstance = sdrConfig.instanceName;
        }
      }
    } catch (e) {
      console.warn('[OutboundConnector] Failed to fetch SDR Config for message splitting, falling back to defaults:', e);
    }

    // 2. Fatiar a mensagem por quebra de linha se splitEnabled for true
    const initialBubbles = splitEnabled
      ? cleanContent.split(/\n+/).map(b => b.trim()).filter(b => b.length > 0)
      : [cleanContent.trim()];

    // 3. Consolidar balões excedentes se ultrapassar o limite maxBubbles
    let bubbles = [...initialBubbles];
    if (splitEnabled && initialBubbles.length > maxBubbles && maxBubbles >= 1) {
      console.log(`[OutboundConnector] Bubbles count (${initialBubbles.length}) exceeds maxBubbles limit (${maxBubbles}). Consolidating surplus bubbles...`);
      const kept = initialBubbles.slice(0, maxBubbles - 1);
      const mergedRest = initialBubbles.slice(maxBubbles - 1).join('\n\n');
      bubbles = [...kept, mergedRest];
    }

    console.log(`[OutboundConnector] Sending response to ${phone} using instance "${targetInstance}". Total WhatsApp bubbles: ${bubbles.length} (Splitting: ${splitEnabled}, Max Limit: ${maxBubbles})`);

    let allSuccess = true;

    // Send text bubbles
    for (let i = 0; i < bubbles.length; i++) {
      const bubble = bubbles[i];
      if (!bubble) continue;

      const endpoint = `${this.apiUrl.replace(/\/$/, '')}/message/sendText/${targetInstance}`;
      
      // Calculate dynamic typing delay (approx. 35ms per character)
      const delayMs = Math.min(4000, Math.max(1500, bubble.length * 35));
      
      console.log(`[OutboundConnector] [Bubble ${i + 1}/${bubbles.length}] Sending "${bubble.substring(0, 30)}..." with typing delay of ${delayMs}ms`);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'apikey': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number: phone,
            options: {
              delay: delayMs,
              presence: 'composing',
              linkPreview: false,
            },
            text: bubble,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[OutboundConnector] Evolution API error (${response.status}) on bubble ${i + 1}:`, errorText);
          allSuccess = false;
        } else {
          const result = (await response.json()) as any;
          console.log(`[OutboundConnector] Bubble ${i + 1} sent successfully. ID:`, result?.key?.id || 'unknown');
        }

        // Wait in our code to maintain bubble sequence order
        if (i < bubbles.length - 1 || mediaAssetsToSend.length > 0) {
          const waitTime = delayMs + 500; // delayMs plus safety buffer
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }

      } catch (error) {
        console.error(`[OutboundConnector] Failed to send bubble ${i + 1} via Evolution API:`, error);
        allSuccess = false;
      }
    }

    // Send triggered media assets via Evolution API
    for (const asset of mediaAssetsToSend) {
      const endpoint = `${this.apiUrl.replace(/\/$/, '')}/message/sendMedia/${targetInstance}`;
      console.log(`[OutboundConnector] Sending media asset (${asset.mediaType}) to ${phone}. URL: ${asset.mediaUrl}`);

      try {
        let mediaPayload = asset.mediaUrl;

        // If local uploaded file, convert to base64 data URI so Evolution API can send it reliably
        if (asset.mediaUrl && (asset.mediaUrl.startsWith('/uploads/') || asset.mediaUrl.startsWith('uploads/'))) {
          const filename = path.basename(asset.mediaUrl);
          const fullPath = path.resolve(process.cwd(), 'public/uploads', filename);

          if (fs.existsSync(fullPath)) {
            const buffer = fs.readFileSync(fullPath);
            const ext = path.extname(fullPath).toLowerCase();
            let mimeType = 'application/octet-stream';
            if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
            else if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.webp') mimeType = 'image/webp';
            else if (ext === '.gif') mimeType = 'image/gif';
            else if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) mimeType = 'video/mp4';
            else if (['.mp3', '.m4a', '.aac'].includes(ext)) mimeType = 'audio/mp3';
            else if (ext === '.ogg') mimeType = 'audio/ogg';
            else if (ext === '.wav') mimeType = 'audio/wav';
            else if (ext === '.pdf') mimeType = 'application/pdf';
            else if (['.doc', '.docx'].includes(ext)) mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

            mediaPayload = `data:${mimeType};base64,${buffer.toString('base64')}`;
          }
        }

        const mediatype = asset.mediaType === 'video' ? 'video' 
          : (asset.mediaType === 'audio' ? 'audio' 
          : (asset.mediaType === 'document' ? 'document' : 'image'));

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'apikey': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number: phone,
            mediatype,
            media: mediaPayload,
            caption: asset.caption || undefined
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[OutboundConnector] Evolution API error (${response.status}) on sendMedia:`, errorText);
          allSuccess = false;
        } else {
          console.log(`[OutboundConnector] Media asset sent successfully.`);
        }
      } catch (error) {
        console.error(`[OutboundConnector] Failed to send media via Evolution API:`, error);
        allSuccess = false;
      }
    }

    return allSuccess;
  }
}

export const outboundConnector = OutboundConnector.getInstance();

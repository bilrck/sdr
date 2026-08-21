import fastify from 'fastify';
import cors from '@fastify/cors';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { dbService } from './layers/database/db.js';
import { repo } from './layers/database/repository.js';
import { conversationEngine } from './engines/conversation/ConversationEngine.js';
import { aiOrchestrator } from './core/orchestrator/AIOrchestrator.js';
import { humanizer } from './layers/humanization/Humanizer.js';
import { outboundConnector } from './core/whatsapp/OutboundConnector.js';
import { analyticsEngine } from './engines/analytics/AnalyticsEngine.js';
import { authService } from './core/auth/AuthService.js';
import { aiService } from './core/ai/GeminiService.js';
import { followUpEngine } from './engines/followup/FollowUpEngine.js';

import rateLimit from '@fastify/rate-limit';

dotenv.config();

// Strict Environment Validation
const REQUIRED_ENV = ['GEMINI_API_KEY', 'JWT_SECRET'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.warn(`[Config Warning] VariÃ¡veis de ambiente crÃ­ticas ausentes: ${missingEnv.join(', ')}`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure all engines and services are registered to event listeners
const _engines = [conversationEngine, aiOrchestrator, humanizer, outboundConnector, analyticsEngine];

const server = fastify({ logger: true, bodyLimit: 52428800 });

// Register Multipart (for File Uploads - max 50MB)
server.register(multipart, {
  limits: {
    fileSize: 52428800, // 50MB
  }
});

// Register Rate Limiter (Protects auth endpoints against brute-force attacks)
server.register(rateLimit, {
  max: 120,
  timeWindow: '1 minute',
  skipOnError: false,
  keyGenerator: (req) => `${req.ip}-${req.url.startsWith('/auth') ? 'auth' : 'api'}`,
  errorResponseBuilder: (req, context) => {
    return { error: 'Limite de requisiÃ§Ãµes atingido. Aguarde um momento.' };
  },
});

// Register CORS
server.register(cors, {
  origin: '*',
});

// Serve public static dashboard files
server.register(fastifyStatic, {
  root: path.resolve(__dirname, '../public'),
  prefix: '/dashboard/',
});

// Serve uploaded media files publicly
server.register(fastifyStatic, {
  root: path.resolve(__dirname, '../public/uploads'),
  prefix: '/uploads/',
  decorateReply: false,
});

// ==========================================
//   SECURITY HEADERS (LGPD & OWASP Standards)
// ==========================================
server.addHook('onRequest', async (request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'SAMEORIGIN');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});

// ==========================================
//   AUTH MIDDLEWARE (JWT Guard)
// ==========================================
const UNPROTECTED_PATHS = new Set([
  '/', '/health', '/favicon.ico',
  '/auth/login', '/auth/register',
  '/webhook/whatsapp/receive', '/webhook/inbound',
]);

server.addHook('preHandler', async (request, reply) => {
  const url = request.url.split('?')[0];
  // Allow unprotected paths and static files
  if (UNPROTECTED_PATHS.has(url) || url.startsWith('/dashboard/') || url.startsWith('/uploads/')) return;

  const token = authService.extractTokenFromHeader(request.headers.authorization);
  if (!token) {
    return reply.status(401).send({ error: 'NÃ£o autorizado. FaÃ§a login para continuar.' });
  }

  const decoded = authService.verifyToken(token);
  if (!decoded) {
    return reply.status(401).send({ error: 'Token invÃ¡lido ou expirado. FaÃ§a login novamente.' });
  }

  (request as any).user = decoded;

  // Protect /tenants/:id/* routes against IDOR / BOLA (Broken Object Level Authorization)
  const tenantMatch = url.match(/^\/tenants\/([^/]+)/);
  if (tenantMatch && tenantMatch[1] && url !== '/tenants') {
    const requestedTenantId = tenantMatch[1];
    const hasAccess = await repo.userHasAccessToTenant(decoded.userId, requestedTenantId);
    if (!hasAccess) {
      return reply.status(403).send({ error: 'Acesso negado. VocÃª nÃ£o tem permissÃ£o para acessar esta empresa.' });
    }
  }
});

// ==========================================
//   AUTH ROUTES
// ==========================================

// REGISTER
server.post('/auth/register', async (request, reply) => {
  const body = request.body as { email: string; name: string; password: string };

  if (!body.email || !body.name || !body.password) {
    return reply.status(400).send({ error: 'Email, nome e senha sÃ£o obrigatÃ³rios.' });
  }
  if (body.password.length < 6) {
    return reply.status(400).send({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  const existing = await repo.getUserByEmail(body.email);
  if (existing) {
    return reply.status(409).send({ error: 'Este e-mail jÃ¡ estÃ¡ cadastrado.' });
  }

  const passwordHash = await authService.hashPassword(body.password);
  const user = await repo.createUser(body.email, body.name, passwordHash);

  // Auto-create default tenant for the new user
  const defaultTenantName = `Empresa de ${body.name.split(' ')[0]}`;
  await repo.createTenantForUser(defaultTenantName, user.id);

  
  if (user.status === 'SUSPENDED') {
    return reply.status(403).send({ error: 'Sua conta estÃ¡ suspensa. Contate o suporte.' });
  }

  const token = authService.generateToken(user.id, user.email, user.name);
  return {
    success: true,
    token,
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role, status: user.status }
  };
});

// LOGIN
server.post('/auth/login', async (request, reply) => {
  const body = request.body as { email: string; password: string };

  if (!body.email || !body.password) {
    return reply.status(400).send({ error: 'Email e senha sÃ£o obrigatÃ³rios.' });
  }

  const user = await repo.getUserByEmail(body.email);
  if (!user) {
    return reply.status(401).send({ error: 'E-mail ou senha incorretos.' });
  }

  const valid = await authService.comparePassword(body.password, user.passwordHash);
  if (!valid) {
    return reply.status(401).send({ error: 'E-mail ou senha incorretos.' });
  }

  const token = authService.generateToken(user.id, user.email, user.name);
  return {
    success: true,
    token,
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role, status: user.status }
  };
});

// GET CURRENT USER
server.get('/auth/me', async (request, reply) => {
  const reqUser = (request as any).user;
  const user = await repo.getUserById(reqUser.userId);
  if (!user) return reply.status(404).send({ error: 'UsuÃ¡rio nÃ£o encontrado.' });

  const tenantsUsed = await repo.countTenantsByUser(user.id);
  const agentsUsed = await repo.countAgentsByUser(user.id);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    role: user.role,
    status: user.status,
    maxTenants: user.maxTenants,
    maxAgentsPerTenant: user.maxAgentsPerTenant,
    tenantsUsed,
    agentsUsed,
  };
});

// CHANGE USER PASSWORD
server.post('/auth/change-password', async (request, reply) => {
  const reqUser = (request as any).user;
  if (!reqUser || !reqUser.userId) {
    return reply.status(401).send({ error: 'NÃ£o autorizado.' });
  }

  const body = request.body as { currentPassword?: string; newPassword?: string; confirmPassword?: string };
  if (!body.currentPassword || !body.newPassword) {
    return reply.status(400).send({ error: 'Senha atual e nova senha sÃ£o obrigatÃ³rias.' });
  }

  if (body.newPassword.length < 6) {
    return reply.status(400).send({ error: 'A nova senha deve ter no mÃ­nimo 6 caracteres.' });
  }

  if (body.confirmPassword && body.newPassword !== body.confirmPassword) {
    return reply.status(400).send({ error: 'A confirmaÃ§Ã£o de senha nÃ£o confere.' });
  }

  const user = await repo.getUserById(reqUser.userId);
  if (!user) {
    return reply.status(404).send({ error: 'UsuÃ¡rio nÃ£o encontrado.' });
  }

  const isCurrentValid = await authService.comparePassword(body.currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    return reply.status(400).send({ error: 'A senha atual informada estÃ¡ incorreta.' });
  }

  const newHash = await authService.hashPassword(body.newPassword);
  await repo.updateUserPassword(user.id, newHash);

  return { success: true, message: 'Senha alterada com sucesso!' };
});

// Redirect root / to dashboard
server.get('/', async (request, reply) => {
  return reply.redirect('/dashboard/index.html');
});

// Simple health check
server.get('/health', async () => {
  return {
    status: 'ok',
    database: dbService.getIsConnected() ? 'connected (PostgreSQL)' : 'memory-fallback'
  };
});

// Favicon handler
server.get('/favicon.ico', async (request, reply) => {
  reply.header('Content-Type', 'image/svg+xml');
  return reply.send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">ðŸ¤–</text></svg>');
});

function extractMessageContent(msgObj: any): string {
  if (!msgObj) return '';
  if (msgObj.ephemeralMessage?.message) return extractMessageContent(msgObj.ephemeralMessage.message);
  if (msgObj.viewOnceMessage?.message) return extractMessageContent(msgObj.viewOnceMessage.message);
  if (msgObj.documentWithCaptionMessage?.message) return extractMessageContent(msgObj.documentWithCaptionMessage.message);

  if (typeof msgObj.conversation === 'string') return msgObj.conversation;
  if (typeof msgObj.extendedTextMessage?.text === 'string') return msgObj.extendedTextMessage.text;
  if (typeof msgObj.imageMessage?.caption === 'string') return msgObj.imageMessage.caption;
  if (typeof msgObj.videoMessage?.caption === 'string') return msgObj.videoMessage.caption;
  if (typeof msgObj.documentMessage?.caption === 'string') return msgObj.documentMessage.caption;
  return '';
}

const processedMessageIds = new Map<string, number>();

// Clean up old message IDs every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [msgId, time] of processedMessageIds.entries()) {
    if (now - time > 60000) {
      processedMessageIds.delete(msgId);
    }
  }
}, 60000);

// Webhook for Evolution API (messages.upsert event)
server.post('/webhook/whatsapp/receive', async (request, reply) => {
  const body = request.body as any;
  if (!body) return reply.status(400).send({ error: 'Payload vazio' });
  
  // Verify if it's the messages.upsert event (case-insensitive)
  const eventName = (body.event || '').toLowerCase();
  if (eventName && eventName !== 'messages.upsert' && eventName !== 'messages_upsert') {
    return reply.status(200).send({ status: 'ignored', reason: 'event_not_supported', event: body.event });
  }

  const data = body.data || body;
  if (!data || !data.key) {
    return reply.status(200).send({ status: 'ignored', reason: 'no_message_key' });
  }

  // CRITICAL: Ignore messages sent by the SDR itself to prevent infinite loop
  if (data.key.fromMe === true) {
    return reply.status(200).send({ status: 'ignored', reason: 'message_from_me' });
  }

  // CRITICAL: Deduplicate repeated webhook triggers for the same WhatsApp message ID
  const messageId = data.key.id;
  if (messageId) {
    if (processedMessageIds.has(messageId)) {
      return reply.status(200).send({ status: 'ignored', reason: 'duplicate_message_id', id: messageId });
    }
    processedMessageIds.set(messageId, Date.now());
  }

  const remoteJid = data.key.remoteJid || '';
  // Ignore group chats, newsletters and status broadcasts
  if (remoteJid.includes('@g.us') || remoteJid.includes('broadcast') || remoteJid.includes('@newsletter')) {
    return reply.status(200).send({ status: 'ignored', reason: 'group_or_broadcast' });
  }

  const phone = remoteJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  if (!phone || phone.length < 7 || phone.length > 15) {
    return reply.status(400).send({ error: 'Invalid phone number format' });
  }

  // Extract message text
  const content = (extractMessageContent(data.message) || '').slice(0, 2000);
  if (!content || content.trim().length === 0) {
    return reply.status(200).send({ status: 'ignored', reason: 'empty_content_or_unsupported_media' });
  }

  const senderName = (data.pushName || 'Lead Interessado').slice(0, 100);
  
  // 1. Resolve tenant dynamic matching based on the webhook's instanceName
  const instanceName = body.instance || data.instance || '';
  let tenantId: string | null = null;

  if (instanceName && instanceName.startsWith('tenant-')) {
    const rawId = instanceName.replace('tenant-', '');
    const t = await repo.getTenant(rawId);
    if (t) tenantId = t.id;
  } 
  
  if (!tenantId && instanceName) {
    const sdrConfig = await repo.getSDRConfigByInstance(instanceName);
    if (sdrConfig) {
      tenantId = sdrConfig.tenantId;
    }
  }
  
  if (!tenantId && !instanceName) {
    const defaultTenant = await repo.getFirstTenant();
    if (defaultTenant) {
      tenantId = defaultTenant.id;
    }
  }

  if (!tenantId) {
    console.warn(`[Webhook] No valid tenant found for instance "${instanceName}". Message ignored.`);
    return reply.status(400).send({ error: 'Nenhum tenant associado Ã  instÃ¢ncia fornecida' });
  }

  console.log(`[Webhook] Evolution API Inbound Message from ${phone} (${senderName}) for tenant ${tenantId}: "${content}"`);

  // Let the pipeline process asynchronously (Event-driven)
  conversationEngine.handleInboundMessage(tenantId, phone, content, senderName);

  return { success: true, message: 'Message successfully received and queued for SDR processing' };
});

// Simulated Inbound Message Webhook (matches generic API triggers)
server.post('/webhook/inbound', async (request, reply) => {
  const body = request.body as { tenantId?: string; phone: string; content: string; name?: string };
  
  const content = (body.content || '').slice(0, 2000);
  const name = (body.name || '').slice(0, 100);
  let phone = (body.phone || '').toString();
  
  if (phone.includes('+')) {
    phone = '+' + phone.replace(/[^0-9]/g, '');
  } else {
    phone = phone.replace(/[^0-9]/g, '');
  }

  if (!phone || !content) {
    return reply.status(400).send({ error: 'Phone and content are required.' });
  }

  let tenantId = body.tenantId;
  if (!tenantId) {
    const tenant = await repo.getFirstTenant();
    tenantId = tenant.id;
  }

  // Let the pipeline process asynchronously (Event-driven)
  conversationEngine.handleInboundMessage(tenantId, phone, content, name);

  return { success: true, message: 'Message queued for orchestration' };
});

// Analytics Dashboard Endpoint (with tenant filter support)
server.get('/analytics/dashboard', async (request, reply) => {
  const query = request.query as { tenantId?: string };
  let tenantId = query.tenantId;
  
  if (!tenantId) {
    const tenant = await repo.getFirstTenant();
    tenantId = tenant.id;
  }
  
  const dashboard = await analyticsEngine.getDashboard(tenantId);
  return dashboard;
});

// ==========================================
//   ADMIN MULTI-TENANT ENDPOINTS
// ==========================================

// CREATE TENANT

// CREATE TENANT
server.post('/tenants', async (request, reply) => {
  const body = request.body as { name: string; id?: string };
  if (!body.name) {
    return reply.status(400).send({ error: 'Tenant name is required' });
  }

  // LIMIT CHECK
  const reqUser = (request as any).user;
  const user = await repo.getUserById(reqUser.userId);
  if (!user) return reply.status(403).send({ error: 'User not found' });
  
  const count = await repo.countTenantsByUser(user.id);
  if (count >= user.maxTenants) {
    return reply.status(403).send({ error: `Limite atingido (${user.maxTenants} workspaces). Upgrade seu plano.` });
  }

  const tenant = await repo.createTenantForUser(body.name, user.id);
  return { success: true, tenant };
});

// CREATE/UPDATE SDR CONFIG FOR TENANT
server.post('/tenants/:id/sdr', async (request, reply) => {
  const params = request.params as { id: string };
  const tenantId = params.id;
  const body = request.body as any;

  // LIMIT CHECK
  const reqUser = (request as any).user;
  const user = await repo.getUserById(reqUser.userId);
  if (!user) return reply.status(403).send({ error: 'User not found' });

  // Only check limit if it's a new config
  const currentConfig = await repo.getSDRConfigByTenant(tenantId);
  if (!currentConfig) {
    const count = await repo.countAgentsByUser(user.id);
    if (count >= user.maxAgentsPerTenant) {
      return reply.status(403).send({ error: `Limite de agentes SDR atingido (${user.maxAgentsPerTenant}). Upgrade seu plano.` });
    }
  }


  if (!body.name || !body.personaName || !body.personaRole || !body.personality || !body.baseInstructions) {
    return reply.status(400).send({ error: 'All SDR configuration fields are required' });
  }

  const sdrConfig = await repo.upsertSDRConfig({
    tenantId,
    name: body.name,
    personaName: body.personaName,
    personaRole: body.personaRole,
    personality: body.personality,
    baseInstructions: body.baseInstructions,
    instanceName: body.instanceName,
    maxWords: body.maxWords,
    splitMessages: body.splitMessages,
    maxBubbles: body.maxBubbles,
    qualificationFlow: body.qualificationFlow,
    postQualificationAction: body.postQualificationAction,
    webhookUrl: body.webhookUrl,
    spreadsheetEnabled: body.spreadsheetEnabled,
    filterEnabled: body.filterEnabled,
    triggerType: body.triggerType,
    triggerKeywords: body.triggerKeywords,
    triggerCondition: body.triggerCondition,
    funnelObjectives: body.funnelObjectives,
    salesStrategies: body.salesStrategies,
    qualificationCriteria: body.qualificationCriteria,
    disqualificationCriteria: body.disqualificationCriteria,
    stopConditions: body.stopConditions,
    sdrMode: body.sdrMode,
  });

  return { success: true, sdrConfig };
});

// UPDATE SDR MODE (SIMPLE vs ADVANCED)
server.post('/tenants/:id/sdr-mode', async (request, reply) => {
  const params = request.params as { id: string };
  const body = request.body as { sdrMode: string };
  const mode = (body.sdrMode || 'ADVANCED').toUpperCase();

  if (mode !== 'SIMPLE' && mode !== 'ADVANCED') {
    return reply.status(400).send({ error: 'Modo invÃ¡lido. Escolha SIMPLE ou ADVANCED.' });
  }

  const updated = await repo.updateSDRMode(params.id, mode);
  if (!updated) {
    // If no SDRConfig exists yet, create default one
    const created = await repo.upsertSDRConfig({
      tenantId: params.id,
      name: 'Agente Comercial IA',
      personaName: 'Ana',
      personaRole: 'Consultora de Vendas',
      personality: 'Humana, empÃ¡tica e focada em resultados.',
      baseInstructions: 'Atenda e qualifique leads com clareza.',
      sdrMode: mode,
    });
    return { success: true, sdrConfig: created };
  }

  return { success: true, sdrConfig: updated };
});

// LIST MEDIA ASSETS FOR TENANT
server.get('/tenants/:id/media', async (request, reply) => {
  const params = request.params as { id: string };
  const tenantId = params.id;
  const media = await repo.getMediaAssets(tenantId);
  return media;
});

// CREATE MEDIA ASSET (VIA PUBLIC URL)
server.post('/tenants/:id/media', async (request, reply) => {
  const params = request.params as { id: string };
  const body = request.body as any;

  if (!body.triggerValue || !body.mediaUrl) {
    return reply.status(400).send({ error: 'Tag de disparo e URL da mÃ­dia sÃ£o obrigatÃ³rios.' });
  }

  const asset = await repo.createMediaAsset({
    tenantId: params.id,
    triggerValue: body.triggerValue.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
    mediaType: body.mediaType || 'image',
    mediaUrl: body.mediaUrl.trim(),
    caption: body.caption ? body.caption.trim() : undefined,
  });
  return asset;
});

const ALLOWED_UPLOAD_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  '.mp3', '.ogg', '.wav', '.m4a', '.aac',
  '.pdf', '.txt', '.docx', '.xlsx', '.csv'
]);

// UPLOAD MEDIA FILE (MULTIPART OR BASE64)
server.post('/tenants/:id/media/upload', async (request, reply) => {
  const params = request.params as { id: string };
  const tenantId = params.id;

  const uploadsDir = path.resolve(__dirname, '../public/uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // 1. Multipart/form-data File Upload
  if (request.isMultipart()) {
    const parts = request.parts();
    let fileBuffer: Buffer | null = null;
    let originalFilename = 'arquivo';
    let fileMimeType = '';
    let triggerValue = '';
    let caption = '';
    let mediaType = '';

    for await (const part of parts) {
      if (part.type === 'file') {
        originalFilename = part.filename || 'arquivo';
        fileMimeType = part.mimetype || '';
        fileBuffer = await part.toBuffer();
      } else {
        if (part.fieldname === 'triggerValue') triggerValue = String(part.value || '').trim();
        else if (part.fieldname === 'caption') caption = String(part.value || '').trim();
        else if (part.fieldname === 'mediaType') mediaType = String(part.value || '').trim();
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });
    }

    const rawExt = path.extname(originalFilename).toLowerCase();
    const ext = rawExt || (fileMimeType.includes('image') ? '.jpg' : '.bin');
    if (!ALLOWED_UPLOAD_EXTS.has(ext)) {
      return reply.status(400).send({ error: 'Tipo de arquivo nÃ£o permitido. Apenas imagens, vÃ­deos, Ã¡udios e documentos sÃ£o aceitos.' });
    }

    if (!triggerValue) {
      triggerValue = path.basename(originalFilename, ext).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    } else {
      triggerValue = triggerValue.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    }

    // Auto-detect mediaType
    if (!mediaType || mediaType === 'auto') {
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) || fileMimeType.startsWith('image/')) mediaType = 'image';
      else if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext) || fileMimeType.startsWith('video/')) mediaType = 'video';
      else if (['.mp3', '.ogg', '.wav', '.m4a', '.aac'].includes(ext) || fileMimeType.startsWith('audio/')) mediaType = 'audio';
      else mediaType = 'document';
    }

    const uniqueName = `${tenantId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const destinationPath = path.join(uploadsDir, uniqueName);
    fs.writeFileSync(destinationPath, fileBuffer);

    const mediaUrl = `/uploads/${uniqueName}`;

    const asset = await repo.createMediaAsset({
      tenantId,
      triggerValue,
      mediaType,
      mediaUrl,
      caption: caption || undefined,
    });

    return { success: true, asset, message: 'Arquivo enviado e mÃ­dia cadastrada com sucesso!' };
  }

  // 2. JSON Base64 File Upload
  const body = request.body as any;
  if (!body) {
    return reply.status(400).send({ error: 'Payload vazio.' });
  }

  const { triggerValue: rawTrigger, caption, mediaType: customType, filename, base64 } = body;
  if (!base64) {
    return reply.status(400).send({ error: 'Arquivo base64 Ã© obrigatÃ³rio.' });
  }

  const rawBase64 = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
  const fileBuffer = Buffer.from(rawBase64, 'base64');
  const ext = filename ? path.extname(filename).toLowerCase() : '.jpg';
  
  if (!ALLOWED_UPLOAD_EXTS.has(ext)) {
    return reply.status(400).send({ error: 'Tipo de arquivo nÃ£o permitido. Apenas imagens, vÃ­deos, Ã¡udios e documentos sÃ£o aceitos.' });
  }

  let mediaType = customType || 'image';
  if (!customType || customType === 'auto') {
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) mediaType = 'image';
    else if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) mediaType = 'video';
    else if (['.mp3', '.ogg', '.wav'].includes(ext)) mediaType = 'audio';
    else mediaType = 'document';
  }

  const triggerValue = (rawTrigger || (filename ? path.basename(filename, ext) : 'midia')).toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const uniqueName = `${tenantId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
  const destinationPath = path.join(uploadsDir, uniqueName);
  fs.writeFileSync(destinationPath, fileBuffer);

  const mediaUrl = `/uploads/${uniqueName}`;
  const asset = await repo.createMediaAsset({
    tenantId,
    triggerValue,
    mediaType,
    mediaUrl,
    caption: caption ? String(caption).trim() : undefined,
  });

  return { success: true, asset, message: 'Arquivo enviado e mÃ­dia cadastrada com sucesso!' };
});

// DELETE MEDIA ASSET
server.delete('/media/:assetId', async (request, reply) => {
  const params = request.params as { assetId: string };
  const asset = await repo.getMediaAssetById(params.assetId);
  if (asset && asset.mediaUrl && (asset.mediaUrl.startsWith('/uploads/') || asset.mediaUrl.startsWith('uploads/'))) {
    try {
      const filename = path.basename(asset.mediaUrl);
      const filePath = path.resolve(__dirname, '../public/uploads', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.warn('[Media] Could not delete physical uploaded file:', e);
    }
  }

  await repo.deleteMediaAsset(params.assetId);
  return { success: true };
});

// ==========================================
//   FLOWS
// ==========================================

// GET ALL FLOWS FOR TENANT
server.get('/tenants/:id/flows', async (request, reply) => {
  const params = request.params as { id: string };
  return await repo.getFlows(params.id);
});

// GET SINGLE FLOW
server.get('/flows/:flowId', async (request, reply) => {
  const params = request.params as { flowId: string };
  const flow = await repo.getFlowById(params.flowId);
  if (!flow) return reply.status(404).send({ error: 'Fluxo nÃ£o encontrado' });
  return flow;
});

// CREATE FLOW
server.post('/tenants/:id/flows', async (request, reply) => {
  const params = request.params as { id: string };
  const body = request.body as any;
  const flow = await repo.createFlow({
    tenantId: params.id,
    name: body.name,
    description: body.description || null,
    isActive: body.isActive || false,
    trigger: body.trigger || 'manual',
    triggerValue: body.triggerValue || null,
    nodes: body.nodes || '{}',
  });
  return flow;
});

// UPDATE FLOW
server.put('/flows/:flowId', async (request, reply) => {
  const params = request.params as { flowId: string };
  const body = request.body as any;
  const flow = await repo.updateFlow(params.flowId, {
    name: body.name,
    description: body.description,
    isActive: body.isActive,
    trigger: body.trigger,
    triggerValue: body.triggerValue,
    nodes: body.nodes,
  });
  return flow;
});

// DELETE FLOW
server.delete('/flows/:flowId', async (request, reply) => {
  const params = request.params as { flowId: string };
  await repo.deleteFlow(params.flowId);
  return { success: true };
});

// ==========================================
//   TRAINING & REFLECTION
// ==========================================

// GET TRAINING SESSIONS
server.get('/tenants/:id/training-sessions', async (request, reply) => {
  const params = request.params as { id: string };
  return await repo.getTrainingSessions(params.id);
});

// CREATE TRAINING SESSION
server.post('/tenants/:id/training-sessions', async (request, reply) => {
  const params = request.params as { id: string };
  const body = request.body as any;
  const session = await repo.createTrainingSession({
    tenantId: params.id,
    type: body.type || 'text',
    title: body.title || 'Treinamento',
    content: body.content,
    processed: false
  });
  
  // Assincronamente processa o texto para extrair os chunks
  const { trainingEngine } = await import('./engines/training/TrainingEngine.js');
  trainingEngine.processTrainingSession(session.id).catch(console.error);

  return session;
});

// GET REFLECTIONS
server.get('/tenants/:id/reflections', async (request, reply) => {
  const params = request.params as { id: string };
  return await repo.getAgentReflections(params.id);
});

// TRIGGER REFLECTION (MANUAL TEST)
server.post('/tenants/:id/leads/:leadId/reflect', async (request, reply) => {
  const params = request.params as { id: string, leadId: string };
  const { reflectionEngine } = await import('./engines/reflection/ReflectionEngine.js');
  
  // Roda de forma assÃ­ncrona
  reflectionEngine.reflectOnConversation(params.id, params.leadId).catch(console.error);
  
  return { success: true, message: 'ReflexÃ£o iniciada em background' };
});


// ==========================================
//   ADVANCED HUMAN FEATURES
// ==========================================

// TRIGGER MANUAL FOLLOW-UPS
server.post('/tenants/:id/cron/follow-up', async (request, reply) => {
  const params = request.params as { id: string };
  const { followUpEngine } = await import('./engines/followup/FollowUpEngine.js');
  const result = await followUpEngine.processFollowUps(params.id);
  return result;
});

// UPDATE BOT CONFIG
server.put('/tenants/:id/config', async (request, reply) => {
  const params = request.params as { id: string };
  const body = request.body as any;
  await repo.updateBotConfig(params.id, {
    businessHoursStart: body.businessHoursStart,
    businessHoursEnd: body.businessHoursEnd,
    businessDays: body.businessDays,
    followUpEnabled: body.followUpEnabled,
    spreadsheetEnabled: body.spreadsheetEnabled,
  });
  return { success: true };
});

// PAUSE/UNPAUSE BOT FOR LEAD (HANDOFF)
server.put('/tenants/:id/leads/:leadId/pause', async (request, reply) => {
  const params = request.params as { id: string; leadId: string };
  const body = request.body as { paused?: boolean };
  const { repo } = await import('./layers/database/repository.js');
  
  await repo.updateLead(params.leadId, { 
    botPaused: body.paused,
    status: body.paused ? 'HANDOFF' : 'ACTIVE'
  });
  
  return { success: true };
});

// SEED/ADD PLAYBOOK KNOWLEDGE CHUNKS FOR TENANT
server.post('/tenants/:id/knowledge', async (request, reply) => {
  const params = request.params as { id: string };
  const tenantId = params.id;
  const body = request.body as {
    title: string;
    chunks: string[];
  };

  if (!body.title || !Array.isArray(body.chunks) || body.chunks.length === 0) {
    return reply.status(400).send({ error: 'Title and a non-empty array of chunks are required' });
  }

  await repo.seedKnowledge(tenantId, body.title, body.chunks);
  return { success: true, message: `Successfully seeded knowledge chunks for tenant ${tenantId}` };
});

// GET PLAYBOOK KNOWLEDGE FOR TENANT
server.get('/tenants/:id/knowledge', async (request, reply) => {
  const params = request.params as { id: string };
  const tenantId = params.id;
  const sources = await repo.getKnowledgeSources(tenantId);
  return sources;
});

// GET DEDICATED ANALYTICS FOR SPECIFIC TENANT
server.get('/tenants/:id/analytics', async (request, reply) => {
  const params = request.params as { id: string };
  const tenantId = params.id;
  const dashboard = await analyticsEngine.getDashboard(tenantId);
  return dashboard;
});

// LIST TENANTS FOR LOGGED IN USER
server.get('/tenants', async (request, reply) => {
  const reqUser = (request as any).user;
  if (!reqUser) return reply.status(401).send({ error: 'NÃ£o autorizado' });
  const tenants = await repo.getTenantsByUser(reqUser.userId);
  return tenants;
});

// GET SINGLE TENANT
server.get('/tenants/:id', async (request, reply) => {
  const params = request.params as { id: string };
  const tenant = await repo.getTenant(params.id);
  if (!tenant) return reply.status(404).send({ error: 'Empresa (Tenant) nÃ£o encontrada.' });
  return tenant;
});

// GET HUMAN CORRECTIONS FOR TENANT (Training page)
server.get('/tenants/:id/corrections', async (request, reply) => {
  const params = request.params as { id: string };
  const query = request.query as { limit?: string };
  const limit = parseInt(query.limit || '50');
  const corrections = await repo.getHumanCorrections(params.id, limit);
  return corrections;
});

// GET KNOWLEDGE STATS FOR TENANT (Training Brain section)
server.get('/tenants/:id/knowledge-stats', async (request, reply) => {
  const params = request.params as { id: string };
  const stats = await repo.getKnowledgeStats(params.id);
  return stats;
});

// GET SDR CONFIG FOR SPECIFIC TENANT
server.get('/tenants/:id/sdr', async (request, reply) => {
  const params = request.params as { id: string };
  const tenantId = params.id;
  const sdrConfig = await repo.getSDRConfigByTenant(tenantId);
  return sdrConfig;
});

// GET RECENT AI DECISION TRACES FOR TENANT
server.get('/tenants/:id/ai-traces', async (request, reply) => {
  const params = request.params as { id: string };
  const query = request.query as { limit?: string };
  const limit = parseInt(query.limit || '50');
  const traces = await repo.getAITraces(params.id, limit);
  return traces;
});

// SIMULATE AI COGNITIVE REASONING PIPELINE (AUDIT / DRY-RUN)
server.post('/tenants/:id/ai-traces/simulate', async (request, reply) => {
  const params = request.params as { id: string };
  const body = request.body as { inputMessage: string; leadId?: string };

  if (!body.inputMessage || body.inputMessage.trim().length === 0) {
    return reply.status(400).send({ error: 'Mensagem de entrada Ã© obrigatÃ³ria para a simulaÃ§Ã£o.' });
  }

  const { aiOrchestrator } = await import('./core/orchestrator/AIOrchestrator.js');
  const simulation = await aiOrchestrator.simulateOrchestration(params.id, body.inputMessage.trim(), body.leadId);
  return simulation;
});

// LIST LEADS FOR SPECIFIC TENANT (WITH FILTERS, SEARCH AND STATE)
server.get('/tenants/:id/leads', async (request, reply) => {
  const params = request.params as { id: string };
  const query = request.query as { search?: string; status?: string; tag?: string };
  const tenantId = params.id;
  const leads = await repo.getLeads(tenantId, {
    search: query.search,
    status: query.status,
    tag: query.tag
  });

  const leadsWithState = await Promise.all(leads.map(async (lead) => {
    const state = await repo.getLeadStrategyState(lead.id);
    return {
      ...lead,
      currentObjective: state?.currentObjective || 'Acolher o lead e descobrir seu nome e interesse bÃ¡sico',
      currentStrategy: state?.currentStrategy || 'Rapport & QualificaÃ§Ã£o PrimÃ¡ria',
    };
  }));

  return leadsWithState;
});

// GET TENANT LEADS DISTINCT TAGS
server.get('/tenants/:id/leads/tags', async (request, reply) => {
  const params = request.params as { id: string };
  const tags = await repo.getTenantTags(params.id);
  return tags;
});

// GET SINGLE LEAD BY ID
server.get('/tenants/:id/leads/:leadId', async (request, reply) => {
  const params = request.params as { id: string; leadId: string };
  const lead = await repo.getLeadById(params.leadId);
  if (!lead) return reply.status(404).send({ error: 'Lead nÃ£o encontrado' });
  return lead;
});

// CREATE LEAD VIA API / MANUAL
server.post('/tenants/:id/leads', async (request, reply) => {
  const params = request.params as { id: string };
  const body = request.body as {
    phone: string;
    name?: string;
    email?: string;
    status?: string;
    tags?: string[];
    customFields?: any;
    notes?: string;
    upsert?: boolean;
  };

  if (!body.phone) {
    return reply.status(400).send({ error: 'Telefone do lead Ã© obrigatÃ³rio' });
  }

  const cleanPhone = body.phone.toString().replace(/[^0-9]/g, '');
  if (!cleanPhone || cleanPhone.length < 7) {
    return reply.status(400).send({ error: 'NÃºmero de telefone invÃ¡lido' });
  }

  // Check if lead already exists
  const existing = await repo.getLeadByPhone(params.id, cleanPhone);
  if (existing) {
    if (body.upsert || request.headers['x-upsert'] === 'true') {
      const updated = await repo.updateLeadFull(existing.id, {
        name: body.name !== undefined ? body.name : (existing.name ?? undefined),
        email: body.email !== undefined ? body.email : (existing.email ?? undefined),
        status: body.status || existing.status,
        tags: body.tags ? Array.from(new Set([...(existing.tags || []), ...body.tags])) : existing.tags,
        customFields: body.customFields ? { ...(existing.customFields || {}), ...body.customFields } : existing.customFields,
        notes: body.notes !== undefined ? body.notes : (existing.notes ?? undefined),
      });
      return { success: true, lead: updated, upserted: true };
    }
    return reply.status(409).send({ error: 'JÃ¡ existe um lead cadastrado com este telefone.', leadId: existing.id });
  }

  const lead = await repo.createLeadManual({
    tenantId: params.id,
    phone: cleanPhone,
    name: body.name || undefined,
    email: body.email || undefined,
    status: body.status || 'NEW',
    tags: body.tags || [],
    customFields: body.customFields || {},
    notes: body.notes || '',
  });

  return { success: true, lead, created: true };
});

// OUTBOUND: SEND INITIAL OUTREACH MESSAGE
server.post('/tenants/:id/outbound/send', async (request, reply) => {
  const params = request.params as { id: string };
  const body = request.body as {
    phone: string;
    name?: string;
    message: string;
    source?: string;
    tags?: string[];
    customFields?: any;
    status?: string;
  };

  if (!body.phone || !body.message) {
    return reply.status(400).send({ error: 'Telefone e mensagem inicial sÃ£o obrigatÃ³rios.' });
  }

  const cleanPhone = body.phone.toString().replace(/[^0-9]/g, '');
  if (!cleanPhone || cleanPhone.length < 7) {
    return reply.status(400).send({ error: 'NÃºmero de telefone invÃ¡lido.' });
  }

  const tenantId = params.id;
  const tenant = await repo.getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({ error: 'Empresa nÃ£o encontrada.' });
  }

  // 1. Get or create lead
  let lead = await repo.getLeadByPhone(tenantId, cleanPhone);
  if (!lead) {
    lead = await repo.createLeadManual({
      tenantId,
      phone: cleanPhone,
      name: body.name || undefined,
      tags: body.tags || ['outbound'],
      customFields: body.customFields || {},
      status: body.status || 'NEW',
    });
  } else {
    // If name was provided and lead didn't have one, update name
    if (body.name && !lead.name) {
      await repo.updateLeadFull(lead.id, { name: body.name });
    }
  }

  // 2. Format message with variable substitutions
  const formattedMessage = body.message
    .replace(/\{nome\}/gi, body.name || lead.name || '')
    .replace(/\{name\}/gi, body.name || lead.name || '')
    .replace(/\{empresa\}/gi, tenant.name || '');

  // 3. Send WhatsApp message
  let sendSuccess = false;
  let errorMsg: string | null = null;
  try {
    sendSuccess = await outboundConnector.sendMessage(tenantId, {
      phone: cleanPhone,
      leadId: lead.id,
      formattedContent: formattedMessage,
    });
  } catch (err: any) {
    sendSuccess = false;
    errorMsg = err.message || String(err);
    console.error(`[Outbound] Error sending to ${cleanPhone}:`, err);
  }

  // 4. Save to lead message history
  await repo.createMessage(lead.id, 'SDR', formattedMessage);

  // 5. Save Outbound Campaign log
  const campaignRecord = await repo.createOutboundCampaign({
    tenantId,
    phone: cleanPhone,
    name: body.name || lead.name,
    message: formattedMessage,
    status: sendSuccess ? 'SENT' : 'FAILED',
    source: body.source || 'MANUAL',
    errorMessage: errorMsg,
  });

  return {
    success: sendSuccess,
    message: sendSuccess ? 'Disparo realizado com sucesso!' : `Erro no envio WhatsApp: ${errorMsg}`,
    leadId: lead.id,
    campaignId: campaignRecord.id,
    sentContent: formattedMessage,
  };
});

// OUTBOUND: GET CAMPAIGN HISTORY
server.get('/tenants/:id/outbound', async (request, reply) => {
  const params = request.params as { id: string };
  const query = request.query as { limit?: string };
  const limit = Math.min(Number(query.limit) || 100, 500);

  const history = await repo.getOutboundCampaigns(params.id, limit);
  return history;
});

// FOLLOW-UP: GET CONFIGURATION
server.get('/tenants/:id/followup', async (request, reply) => {
  const params = request.params as { id: string };
  const config = await repo.getSDRConfig(params.id);
  if (!config) {
    return reply.status(404).send({ error: 'ConfiguraÃ§Ã£o do SDR nÃ£o encontrada.' });
  }

  let sequenceList = [];
  try {
    if (config.followUpSequence) {
      sequenceList = JSON.parse(config.followUpSequence);
    }
  } catch (e) {
    sequenceList = [];
  }

  return {
    followUpEnabled: config.followUpEnabled ?? true,
    followUpDelayHours: config.followUpDelayHours ?? 2,
    followUpMaxAttempts: config.followUpMaxAttempts ?? 3,
    followUpMode: config.followUpMode || 'AI_CONTEXTUAL',
    followUpSequence: sequenceList,
    followUpActionAfterLimit: config.followUpActionAfterLimit || 'PAUSE_FOLLOWUP',
    businessHoursStart: config.businessHoursStart || '08:00',
    businessHoursEnd: config.businessHoursEnd || '18:00',
    businessDays: config.businessDays || '1,2,3,4,5',
    sdrMode: config.sdrMode || 'ADVANCED',
  };
});

// FOLLOW-UP: UPDATE CONFIGURATION
server.post('/tenants/:id/followup', async (request, reply) => {
  const params = request.params as { id: string };
  const body = request.body as {
    followUpEnabled?: boolean;
    followUpDelayHours?: number;
    followUpMaxAttempts?: number;
    followUpMode?: string;
    followUpSequence?: any;
    followUpActionAfterLimit?: string;
    businessHoursStart?: string;
    businessHoursEnd?: string;
    businessDays?: string;
  };

  const payload: any = {};
  if (body.followUpEnabled !== undefined) payload.followUpEnabled = Boolean(body.followUpEnabled);
  if (body.followUpDelayHours !== undefined) payload.followUpDelayHours = Math.max(1, Number(body.followUpDelayHours));
  if (body.followUpMaxAttempts !== undefined) payload.followUpMaxAttempts = Math.max(1, Math.min(10, Number(body.followUpMaxAttempts)));
  if (body.followUpMode !== undefined) payload.followUpMode = body.followUpMode;
  if (body.followUpActionAfterLimit !== undefined) payload.followUpActionAfterLimit = body.followUpActionAfterLimit;
  if (body.businessHoursStart !== undefined) payload.businessHoursStart = body.businessHoursStart;
  if (body.businessHoursEnd !== undefined) payload.businessHoursEnd = body.businessHoursEnd;
  if (body.businessDays !== undefined) payload.businessDays = body.businessDays;

  if (body.followUpSequence !== undefined) {
    payload.followUpSequence = typeof body.followUpSequence === 'string' 
      ? body.followUpSequence 
      : JSON.stringify(body.followUpSequence);
  }

  const updated = await repo.updateFollowUpConfig(params.id, payload);
  return { success: true, config: updated, message: 'ConfiguraÃ§Ãµes de follow-up salvas com sucesso!' };
});

// FOLLOW-UP: RUN MANUAL CYCLE (SCAN & TRIGGER)
server.post('/tenants/:id/followup/run', async (request, reply) => {
  const params = request.params as { id: string };
  const body = (request.body as any) || {};
  const forceIgnoreBusinessHours = body.force === true;

  const result = await followUpEngine.processFollowUps(params.id, forceIgnoreBusinessHours);
  return {
    success: true,
    result,
    message: `Varredura concluÃ­da: ${result.sent} follow-ups disparados, ${result.analyzed} analisados.`
  };
});

// UPDATE LEAD (FULL EDIT)
server.put('/tenants/:id/leads/:leadId', async (request, reply) => {
  const params = request.params as { id: string; leadId: string };
  const body = request.body as {
    name?: string;
    phone?: string;
    email?: string;
    status?: string;
    tags?: string[];
    customFields?: any;
    notes?: string;
    botPaused?: boolean;
  };

  const updated = await repo.updateLeadFull(params.leadId, {
    name: body.name,
    phone: body.phone ? body.phone.replace(/[^0-9]/g, '') : undefined,
    email: body.email,
    status: body.status,
    tags: body.tags,
    customFields: body.customFields,
    notes: body.notes,
    botPaused: body.botPaused,
  });

  return { success: true, lead: updated };
});

// DELETE LEAD (PURGE LGPD)
server.delete('/tenants/:id/leads/:leadId', async (request, reply) => {
  const params = request.params as { id: string; leadId: string };
  const deleted = await repo.deleteLead(params.leadId);
  if (!deleted) {
    return reply.status(404).send({ error: 'Lead nÃ£o encontrado ou jÃ¡ excluÃ­do.' });
  }
  return { success: true, message: 'Lead e todos os dados vinculados excluÃ­dos em conformidade com a LGPD.' };
});

// EXPORT LEAD DATA (LGPD ART. 18, II)
server.get('/tenants/:id/leads/:leadId/export-lgpd', async (request, reply) => {
  const params = request.params as { id: string; leadId: string };
  const report = await repo.exportLeadLGPD(params.leadId);
  if (!report) {
    return reply.status(404).send({ error: 'Lead nÃ£o encontrado para exportaÃ§Ã£o.' });
  }
  reply.header('Content-Disposition', `attachment; filename="relatorio-lgpd-lead-${params.leadId}.json"`);
  return report;
});

// GET MESSAGE HISTORY FOR SPECIFIC LEAD
server.get('/leads/:id/messages', async (request, reply) => {
  const params = request.params as { id: string };
  const leadId = params.id;
  const messages = await repo.getMessages(leadId, 50); // Fetch last 50 messages
  return messages;
});

// CREATE HUMAN CORRECTION
server.post('/corrections', async (request, reply) => {
  const body = request.body as {
    tenantId: string;
    leadId?: string;
    errorContext: string;
    originalResponse: string;
    correctedResponse: string;
    feedbackText: string;
  };

  if (!body.tenantId || !body.errorContext || !body.originalResponse || !body.correctedResponse || !body.feedbackText) {
    return reply.status(400).send({ error: 'Missing required correction fields' });
  }

  const correction = await repo.saveHumanCorrection({
    tenantId: body.tenantId,
    leadId: body.leadId,
    errorContext: body.errorContext,
    originalResponse: body.originalResponse,
    correctedResponse: body.correctedResponse,
    feedbackText: body.feedbackText,
  });

  return { success: true, correction };
});

// ==========================================
//   WHATSAPP EVOLUTION API (MULTI-TENANT)
// ==========================================

// GET WHATSAPP STATUS
server.get('/tenants/:id/whatsapp/status', async (request, reply) => {
  const params = request.params as { id: string };
  const tenantId = params.id;
  const instanceName = `tenant-${tenantId}`;
  const evoApiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
  const evoApiKey = process.env.EVOLUTION_API_KEY || '';
  const headers = { 'Content-Type': 'application/json', 'apikey': evoApiKey };
  try {
    const res = await fetch(`${evoApiUrl}/instance/connectionState/${instanceName}`, { headers });
    if (res.ok) {
      const data = await res.json() as any;
      const state = data.instance?.state || data.state || 'close';
      const isConnected = state === 'open';
      if (isConnected) {
        const sdrConfig = await repo.getSDRConfigByTenant(tenantId);
        if (sdrConfig && sdrConfig.instanceName !== instanceName) {
          await repo.upsertSDRConfig({ ...sdrConfig, instanceName });
        }
      }
      return { connected: isConnected, state, instanceName, profileName: data.instance?.profileName || null, phone: data.instance?.owner || null };
    }
    return { connected: false, state: 'close', instanceName };
  } catch (error) {
    return { connected: false, state: 'disconnected', instanceName, error: 'InstÃ¢ncia offline ou nÃ£o criada' };
  }
});
server.get('/tenants/:id/whatsapp/qr', async (request, reply) => {
  const params = request.params as { id: string };
  const tenantId = params.id;
  
  // Use tenantId as the instance name so it's unique per tenant
  const instanceName = `tenant-${tenantId}`;
  const evoApiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
  const evoApiKey = process.env.EVOLUTION_API_KEY || '';

  const headers = { 'Content-Type': 'application/json', 'apikey': evoApiKey };

  try {
    // 1. Check if instance exists and connection state
    const connectRes = await fetch(`${evoApiUrl}/instance/connect/${instanceName}`, { headers });
    
    // Ensure Webhook is configured for this instance
    const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL || 'http://host.docker.internal:3030/webhook/whatsapp/receive';
    try {
      await fetch(`${evoApiUrl}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            webhookByEvents: false,
            webhookBase64: false,
            events: [
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'CONNECTION_UPDATE'
            ]
          }
        })
      });
    } catch (e) {
      console.warn(`[Evolution] Warning setting webhook for ${instanceName}:`, e);
    }

    if (connectRes.ok) {
      const data = await connectRes.json() as any;
      if (data.status === 'CONNECTED' || data.instance?.state === 'open') {
        return { status: 'CONNECTED' };
      }
      if (data.base64) {
        return { status: 'QRCODE', base64: data.base64 };
      }
    }

    // 2. If we reach here, it either doesn't exist or isn't returning a QR code. Try to create it.
    const createRes = await fetch(`${evoApiUrl}/instance/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'CONNECTION_UPDATE'
          ]
        }
      })
    });

    const createData = await createRes.json() as any;
    
    if (createData.qrcode?.base64) {
      return { status: 'QRCODE', base64: createData.qrcode.base64 };
    } else if (createData.code) {
      return { status: 'QRCODE', base64: createData.code };
    }
    
    // Fallback: wait a bit and fetch connect again
    await new Promise(r => setTimeout(r, 2000));
    const retryRes = await fetch(`${evoApiUrl}/instance/connect/${instanceName}`, { headers });
    const retryData = await retryRes.json() as any;
    if (retryData.base64) {
      return { status: 'QRCODE', base64: retryData.base64 };
    }

    return reply.status(500).send({ error: 'N├úo foi poss├¡vel gerar o QR Code' });
  } catch (error) {
    console.error('Evolution API Error:', error);
    return reply.status(500).send({ error: 'Erro de comunica├º├úo com a Evolution API' });
  }
});

server.delete('/tenants/:id/whatsapp/disconnect', async (request, reply) => {
  const params = request.params as { id: string };
  const instanceName = `tenant-${params.id}`;
  const evoApiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
  const evoApiKey = process.env.EVOLUTION_API_KEY || '';

  try {
    await fetch(`${evoApiUrl}/instance/logout/${instanceName}`, {
      method: 'DELETE',
      headers: { 'apikey': evoApiKey }
    });
    
    await fetch(`${evoApiUrl}/instance/delete/${instanceName}`, {
      method: 'DELETE',
      headers: { 'apikey': evoApiKey }
    });
    return { success: true };
  } catch (error) {
    console.error('Disconnect error:', error);
    return reply.status(500).send({ error: 'Erro ao desconectar' });
  }
});


    
// ==========================================
//   KNOWLEDGE API LOGIC
// ==========================================

server.delete('/tenants/:id/knowledge/:knowledgeId', async (request, reply) => {
  const params = request.params as { id: string; knowledgeId: string };
  try {
    await repo.deleteKnowledge(params.knowledgeId);
    return { success: true };
  } catch (error) {
    console.error('Delete knowledge error:', error);
    return reply.status(500).send({ error: 'Erro ao deletar playbook' });
  }
});


// ==========================================
//   ADMIN GLOBAL API ROUTES
// ==========================================

// Helper to enforce ADMIN role
const ensureAdmin = async (request: any, reply: any) => {
  const reqUser = (request as any).user;
  if (!reqUser) {
    reply.status(401).send({ error: 'N├úo autorizado.' });
    return null;
  }
  const user = await repo.getUserById(reqUser.userId);
  if (!user || user.role !== 'ADMIN') {
    reply.status(403).send({ error: 'Acesso restrito ao administrador do sistema.' });
    return null;
  }
  return user;
};

// GET /admin/stats - Global system overview
server.get('/admin/stats', async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  const users = await repo.getAllUsers();
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === 'ACTIVE').length;
  
  let totalTenants = 0;
  let totalAgents = 0;
  users.forEach(u => {
    totalTenants += (u.tenants ? u.tenants.length : 0);
    if (u.tenants) {
      u.tenants.forEach((t: any) => {
        totalAgents += (t._count?.sdrConfigs || 0);
      });
    }
  });

  return {
    totalUsers,
    activeUsers,
    totalTenants,
    totalAgents,
    isHealthy: true,
  };
});

// GET /admin/users - List all users with workspace counts
server.get('/admin/users', async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  const users = await repo.getAllUsers();
  return users;
});

// POST /admin/users - Create new user manually from admin panel
server.post('/admin/users', async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  const body = request.body as {
    name: string;
    email: string;
    password: string;
    role?: string;
    plan?: string;
    maxTenants?: number;
    maxAgentsPerTenant?: number;
    status?: string;
  };

  if (!body.email || !body.name || !body.password) {
    return reply.status(400).send({ error: 'Nome, e-mail e senha inicial s├úo obrigat├│rios.' });
  }
  if (body.password.length < 6) {
    return reply.status(400).send({ error: 'A senha deve ter no m├¡nimo 6 caracteres.' });
  }

  const existing = await repo.getUserByEmail(body.email);
  if (existing) {
    return reply.status(409).send({ error: 'J├í existe um usu├írio cadastrado com este e-mail.' });
  }

  const passwordHash = await authService.hashPassword(body.password);
  const newUser = await repo.createUserAdmin({
    email: body.email,
    name: body.name,
    passwordHash,
    role: body.role || 'USER',
    plan: body.plan || 'free',
    maxTenants: Number(body.maxTenants) || 1,
    maxAgentsPerTenant: Number(body.maxAgentsPerTenant) || 1,
    status: body.status || 'ACTIVE',
  });

  // Automatically create their primary workspace
  const defaultTenantName = `Empresa de ${body.name.split(' ')[0]}`;
  await repo.createTenantForUser(defaultTenantName, newUser.id);

  return { success: true, user: newUser };
});

// PUT /admin/users/:id - Update user roles, limits, status, and plans
server.put('/admin/users/:id', async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  const params = request.params as { id: string };
  const body = request.body as any;

  const updateData: any = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.role !== undefined) updateData.role = body.role;
  if (body.plan !== undefined) updateData.plan = body.plan;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.maxTenants !== undefined) updateData.maxTenants = Number(body.maxTenants);
  if (body.maxAgentsPerTenant !== undefined) updateData.maxAgentsPerTenant = Number(body.maxAgentsPerTenant);
  if (body.password && body.password.length >= 6) {
    updateData.passwordHash = await authService.hashPassword(body.password);
  }

  const updated = await repo.updateUserAdmin(params.id, updateData);
  return { success: true, user: updated };
});

// DELETE /admin/users/:id - Delete a user and cascade their workspaces
server.delete('/admin/users/:id', async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  const params = request.params as { id: string };
  const reqUser = (request as any).user;

  if (params.id === reqUser.userId) {
    return reply.status(400).send({ error: 'Voc├¬ n├úo pode excluir sua pr├│pria conta de administrador.' });
  }

  await repo.deleteUser(params.id);
  return { success: true, message: 'Usu├írio exclu├¡do com sucesso.' };
});

// GET /admin/settings - Read Global AI & System Settings
server.get('/admin/settings', async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  const settings = await repo.getSystemSettings();
  
  // Return masked keys for security
  const maskKey = (key: string | null) => {
    if (!key || key.length < 8) return key ? '******' : '';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  };

  return {
    aiProvider: settings.aiProvider || 'GEMINI',
    openaiApiKey: settings.openaiApiKey ? maskKey(settings.openaiApiKey) : '',
    hasOpenaiKey: Boolean(settings.openaiApiKey && settings.openaiApiKey.length > 5),
    openaiModel: settings.openaiModel || 'gpt-4o-mini',
    geminiApiKey: settings.geminiApiKey ? maskKey(settings.geminiApiKey) : '',
    hasGeminiKey: Boolean(settings.geminiApiKey && settings.geminiApiKey.length > 5),
    geminiModel: settings.geminiModel || 'gemini-2.5-flash',
  };
});

// POST /admin/settings - Update Global AI & System Settings
server.post('/admin/settings', async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  const body = request.body as {
    aiProvider?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    geminiApiKey?: string;
    geminiModel?: string;
  };

  const updatePayload: any = {};
  if (body.aiProvider) {
    const prov = body.aiProvider.toUpperCase();
    if (prov === 'GEMINI' || prov === 'OPENAI') {
      updatePayload.aiProvider = prov;
    }
  }

  // Only update keys if provided and not masked placeholder
  if (body.openaiApiKey !== undefined && !body.openaiApiKey.includes('...')) {
    updatePayload.openaiApiKey = body.openaiApiKey.trim() || null;
  }
  if (body.openaiModel) {
    updatePayload.openaiModel = body.openaiModel.trim();
  }

  if (body.geminiApiKey !== undefined && !body.geminiApiKey.includes('...')) {
    updatePayload.geminiApiKey = body.geminiApiKey.trim() || null;
  }
  if (body.geminiModel) {
    updatePayload.geminiModel = body.geminiModel.trim();
  }

  const updated = await repo.updateSystemSettings(updatePayload);
  await aiService.syncSettings();

  return { success: true, settings: updated, message: 'Configura├º├Áes de IA salvas com sucesso!' };
});

// POST /admin/test-ai - Test connection with active or specified AI provider
server.post('/admin/test-ai', async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  const body = request.body as {
    provider?: string;
    apiKey?: string;
    model?: string;
  };

  const currentSettings = await repo.getSystemSettings();
  const provider = (body.provider || currentSettings.aiProvider || 'GEMINI').toUpperCase() as 'GEMINI' | 'OPENAI';
  
  let apiKey = body.apiKey;
  if (!apiKey || apiKey.includes('...')) {
    apiKey = provider === 'OPENAI' ? (currentSettings.openaiApiKey || process.env.OPENAI_API_KEY || '') : (currentSettings.geminiApiKey || process.env.GEMINI_API_KEY || '');
  }

  const model = body.model || (provider === 'OPENAI' ? currentSettings.openaiModel : currentSettings.geminiModel);

  const testResult = await aiService.testProviderConnection(provider, apiKey, model);
  return testResult;
});


// ==========================================
//   SERVER STARTUP
// ==========================================

const start = async () => {
  try {
    // 1. Connect to PostgreSQL database (falls back to in-memory if unavailable)
    await dbService.connect();

    // 2. Seed default playbook knowledge (only if DB is connected)
    if (dbService.getIsConnected()) {
      const tenant = await repo.getFirstTenant();
      await repo.seedKnowledge(tenant.id, 'Playbook Comercial Imobiliaria Prime', [
        'O condominio Vila Nova possui apartamentos de 2 e 3 dormitorios com suite e varanda gourmet integrada.',
        'A area de lazer do condominio conta com piscina adulto com raia, piscina infantil, brinquedoteca, salao de festas decorado, academia completa, quadra poliesportiva e portaria presencial 24h.',
        'O preco das unidades de 2 dormitorios comeca em R\$ 450.000,00 e o fluxo de pagamento e composto de 10% de entrada, mensais de R\$ 2.500,00 durante as obras, e o restante via financiamento bancario.',
        'As visitas ao decorado ocorrem de segunda a domingo, das 9h as 18h. O endereco e Avenida Paulista, 1000, Sao Paulo.',
        'O prazo de entrega da obra esta previsto para Dezembro de 2027.'
      ]);
    }

    // 3. Start Fastify server
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    console.log(`[Server] SDR Inteligente rodando em http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

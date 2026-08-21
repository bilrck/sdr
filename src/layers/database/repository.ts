import { dbService } from './db.js';
import { vectorService } from '../../core/ai/VectorService.js';
import { Prisma } from '@prisma/client';

// Define model interfaces to support both prisma and memory implementations
export interface Tenant {
  id: string;
  name: string;
  ownerId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SDRConfig {
  id: string;
  tenantId: string;
  name: string;
  personaName: string;
  personaRole: string;
  personality: string;
  baseInstructions: string;
  instanceName: string | null;
  maxWords: number;
  splitMessages: boolean;
  maxBubbles: number;
  qualificationFlow: string;
  postQualificationAction: string;
  webhookUrl: string;
  spreadsheetEnabled: boolean;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: string;
  followUpEnabled: boolean;
  followUpDelayHours?: number;
  followUpMaxAttempts?: number;
  followUpMode?: string;
  followUpSequence?: string | null;
  followUpActionAfterLimit?: string;
  filterEnabled?: boolean;
  triggerType?: string;
  triggerKeywords?: string;
  triggerCondition?: string;
  funnelObjectives?: string | null;
  salesStrategies?: string | null;
  qualificationCriteria?: string | null;
  disqualificationCriteria?: string | null;
  stopConditions?: string | null;
  sdrMode?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaAsset {
  id: string;
  tenantId: string;
  triggerValue: string;
  mediaType: string;
  mediaUrl: string;
  caption: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutboundCampaign {
  id: string;
  tenantId: string;
  phone: string;
  name: string | null;
  message: string;
  status: string;
  source: string;
  errorMessage: string | null;
  createdAt: Date;
}

export interface Lead {
  id: string;
  tenantId: string;
  sdrConfigId?: string | null;
  phone: string;
  name: string | null;
  email: string | null;
  status: string;
  tags?: string[];
  customFields?: any;
  notes?: string | null;
  botPaused: boolean;
  followUpCount?: number;
  lastFollowUpAt?: Date | null;
  lastInteractionAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadStrategyState {
  id: string;
  leadId: string;
  currentObjective: string;
  currentStrategy: string;
  updatedAt: Date;
}

export interface LeadMemory {
  id: string;
  leadId: string;
  fact: string;
  confidence: number;
  embedding: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  leadId: string;
  sender: 'LEAD' | 'SDR' | 'SYSTEM' | string;
  content: string;
  createdAt: Date;
}

export interface KnowledgeSource {
  id: string;
  tenantId: string;
  title: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  content: string;
  embedding: number[] | null;
  createdAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  plan: string;
  role: string;
  maxTenants: number;
  maxAgentsPerTenant: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface HumanCorrection {
  id: string;
  tenantId: string;
  leadId: string | null;
  errorContext: string;
  originalResponse: string;
  correctedResponse: string;
  feedbackText: string;
  embedding: number[] | null;
  createdAt: Date;
}



export interface TrainingSession {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  content: string;
  processed: boolean;
  createdAt: Date;
}

export interface AgentReflection {
  id: string;
  tenantId: string;
  leadId: string;
  summary: string;
  insights: string;
  createdAt: Date;
}

export interface Flow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  trigger: string;
  triggerValue: string | null;
  nodes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowExecution {
  id: string;
  flowId: string;
  leadId: string;
  currentNodeId: string;
  status: string;
  variables: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalyticsEvent {
  id: string;
  tenantId: string;
  leadId: string | null;
  eventType: string;
  objective: string | null;
  strategy: string | null;
  metadata: string | null;
  createdAt: Date;
}

export interface SystemSetting {
  id: string;
  aiProvider: string; // 'GEMINI' | 'OPENAI'
  openaiApiKey: string | null;
  openaiModel: string;
  geminiApiKey: string | null;
  geminiModel: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AITrace {
  id: string;
  tenantId: string;
  leadId?: string | null;
  phone: string;
  inputMessage: string;
  memoriesFound: string[];
  knowledgeChunks: string[];
  currentObjective: string;
  nextObjective: string;
  objectiveReason: string;
  currentStrategy: string;
  nextStrategy: string;
  strategyReason: string;
  leadStatusBefore: string;
  leadStatusAfter: string;
  fewShotUsed?: string | null;
  generatedPrompt?: string | null;
  finalResponse: string;
  createdAt: Date;
}

/**
 * An In-Memory Database for testing/dev environment fallback
 */
class MemoryDatabase {
  public users: User[] = [];
  public tenants: Tenant[] = [];
  public sdrConfigs: SDRConfig[] = [];
  public leads: Lead[] = [];
  public strategyStates: LeadStrategyState[] = [];
  public memories: LeadMemory[] = [];
  public messages: Message[] = [];
  public knowledgeSources: KnowledgeSource[] = [];
  public knowledgeChunks: KnowledgeChunk[] = [];
  public humanCorrections: HumanCorrection[] = [];
  public analyticsEvents: AnalyticsEvent[] = [];
  public mediaAssets: MediaAsset[] = [];
  public flows: Flow[] = [];
  public flowExecutions: FlowExecution[] = [];
  public trainingSessions: TrainingSession[] = [];
  public agentReflections: AgentReflection[] = [];
  public aiTraces: AITrace[] = [];
  public outboundCampaigns: OutboundCampaign[] = [];
  public systemSettings: SystemSetting = {
    id: 'global',
    aiProvider: process.env.AI_PROVIDER || 'GEMINI',
    openaiApiKey: process.env.OPENAI_API_KEY || null,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    geminiApiKey: process.env.GEMINI_API_KEY || null,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  constructor() {
    this.seed();
  }

  private seed() {
    const tenantId = 'default-tenant-uuid';
    this.tenants.push({
      id: tenantId,
      name: 'Empresa Principal',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

export class Repository {
  private static instance: Repository;
  private memoryDb: MemoryDatabase;

  private constructor() {
    this.memoryDb = new MemoryDatabase();
  }

  public static getInstance(): Repository {
    if (!Repository.instance) {
      Repository.instance = new Repository();
    }
    return Repository.instance;
  }

  private useMemory(): boolean {
    return !dbService.getIsConnected();
  }

  // --- TENANT ---
  public async getTenant(id: string): Promise<Tenant | null> {
    if (this.useMemory()) {
      return this.memoryDb.tenants.find((t) => t.id === id) || null;
    }
    return dbService.prisma.tenant.findUnique({ where: { id } });
  }

  public async getFirstTenant(): Promise<Tenant> {
    if (this.useMemory()) {
      return this.memoryDb.tenants[0];
    }
    let tenant = await dbService.prisma.tenant.findFirst();
    if (!tenant) {
      tenant = await dbService.prisma.tenant.create({
        data: { id: 'default-tenant-uuid', name: 'Empresa Principal' },
      });
    }
    return tenant;
  }

  public async userHasAccessToTenant(userId: string, tenantId: string): Promise<boolean> {
    if (!userId || !tenantId) return false;
    if (this.useMemory()) {
      const user = this.memoryDb.users.find(u => u.id === userId);
      if (user && user.role === 'ADMIN') return true;
      const tenant = this.memoryDb.tenants.find(t => t.id === tenantId);
      if (!tenant) return false;
      return !tenant.ownerId || tenant.ownerId === userId;
    }
    const user = await this.getUserById(userId);
    if (user && user.role === 'ADMIN') return true;
    const tenant = await dbService.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return false;
    return !tenant.ownerId || tenant.ownerId === userId;
  }

  // --- SDR CONFIG ---
  public async getSDRConfig(idOrTenantId: string): Promise<SDRConfig | null> {
    if (this.useMemory()) {
      return this.memoryDb.sdrConfigs.find((s) => s.id === idOrTenantId || s.tenantId === idOrTenantId) || null;
    }
    const byId = await dbService.prisma.sDRConfig.findUnique({ where: { id: idOrTenantId } });
    if (byId) return byId;
    return dbService.prisma.sDRConfig.findFirst({ where: { tenantId: idOrTenantId } });
  }

  public async getSDRConfigByTenant(tenantId: string): Promise<SDRConfig | null> {
    if (this.useMemory()) {
      return this.memoryDb.sdrConfigs.find((s) => s.tenantId === tenantId) || null;
    }
    return dbService.prisma.sDRConfig.findFirst({ where: { tenantId } });
  }

  public async getSDRConfigByInstance(instanceName: string): Promise<SDRConfig | null> {
    if (this.useMemory()) {
      return this.memoryDb.sdrConfigs.find((s) => s.instanceName === instanceName) || null;
    }
    return dbService.prisma.sDRConfig.findUnique({ where: { instanceName } });
  }

  public async createTenant(name: string, id?: string): Promise<Tenant> {
    if (this.useMemory()) {
      const newTenant: Tenant = {
        id: id || Math.random().toString(36).substring(2, 11),
        name,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.memoryDb.tenants.push(newTenant);
      return newTenant;
    }
    return dbService.prisma.tenant.create({
      data: { id, name },
    });
  }

  public async upsertSDRConfig(data: {
    tenantId: string;
    name: string;
    personaName: string;
    personaRole: string;
    personality: string;
    baseInstructions: string;
    instanceName?: string;
    maxWords?: number;
    splitMessages?: boolean;
    maxBubbles?: number;
    qualificationFlow?: string;
    postQualificationAction?: string;
    webhookUrl?: string;
    spreadsheetEnabled?: boolean;
    businessHoursStart?: string;
    businessHoursEnd?: string;
    businessDays?: string;
    followUpEnabled?: boolean;
    followUpDelayHours?: number;
    followUpMaxAttempts?: number;
    followUpMode?: string;
    followUpSequence?: string | null;
    followUpActionAfterLimit?: string;
    filterEnabled?: boolean;
    triggerType?: string;
    triggerKeywords?: string;
    triggerCondition?: string;
    funnelObjectives?: string | null;
    salesStrategies?: string | null;
    qualificationCriteria?: string | null;
    disqualificationCriteria?: string | null;
    stopConditions?: string | null;
    sdrMode?: string;
  }): Promise<SDRConfig> {
    if (this.useMemory()) {
      const existingIndex = this.memoryDb.sdrConfigs.findIndex(s => s.tenantId === data.tenantId);
      const sdr: SDRConfig = {
        id: existingIndex >= 0 ? this.memoryDb.sdrConfigs[existingIndex].id : Math.random().toString(36).substring(2, 11),
        tenantId: data.tenantId,
        name: data.name,
        personaName: data.personaName,
        personaRole: data.personaRole,
        personality: data.personality,
        baseInstructions: data.baseInstructions,
        instanceName: data.instanceName || null,
        maxWords: data.maxWords ?? 40,
        splitMessages: data.splitMessages ?? true,
        maxBubbles: data.maxBubbles ?? 3,
        qualificationFlow: data.qualificationFlow ?? 'Perguntar nome, email, intenção de compra e orçamento.',
        postQualificationAction: data.postQualificationAction ?? 'Notificar equipe de vendas e salvar no CRM.',
        webhookUrl: data.webhookUrl ?? '',
        spreadsheetEnabled: data.spreadsheetEnabled ?? false,
        businessHoursStart: data.businessHoursStart ?? '08:00',
        businessHoursEnd: data.businessHoursEnd ?? '18:00',
        businessDays: data.businessDays ?? '1,2,3,4,5',
        followUpEnabled: data.followUpEnabled ?? true,
        followUpDelayHours: data.followUpDelayHours ?? 2,
        followUpMaxAttempts: data.followUpMaxAttempts ?? 3,
        followUpMode: data.followUpMode ?? 'AI_CONTEXTUAL',
        followUpSequence: data.followUpSequence ?? null,
        followUpActionAfterLimit: data.followUpActionAfterLimit ?? 'PAUSE_FOLLOWUP',
        filterEnabled: data.filterEnabled ?? false,
        triggerType: data.triggerType ?? 'ALL',
        triggerKeywords: data.triggerKeywords ?? '',
        triggerCondition: data.triggerCondition ?? '',
        funnelObjectives: data.funnelObjectives ?? null,
        salesStrategies: data.salesStrategies ?? null,
        qualificationCriteria: data.qualificationCriteria ?? null,
        disqualificationCriteria: data.disqualificationCriteria ?? null,
        stopConditions: data.stopConditions ?? null,
        sdrMode: data.sdrMode ?? 'ADVANCED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (existingIndex >= 0) {
        this.memoryDb.sdrConfigs[existingIndex] = sdr;
      } else {
        this.memoryDb.sdrConfigs.push(sdr);
      }
      return sdr;
    }
    
    const existing = await dbService.prisma.sDRConfig.findFirst({
      where: { tenantId: data.tenantId }
    });

    if (existing) {
      return dbService.prisma.sDRConfig.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          personaName: data.personaName,
          personaRole: data.personaRole,
          personality: data.personality,
          baseInstructions: data.baseInstructions,
          instanceName: data.instanceName,
          maxWords: data.maxWords ?? 40,
          splitMessages: data.splitMessages ?? true,
          maxBubbles: data.maxBubbles ?? 3,
          qualificationFlow: data.qualificationFlow,
          postQualificationAction: data.postQualificationAction,
          webhookUrl: data.webhookUrl,
          spreadsheetEnabled: data.spreadsheetEnabled,
          businessHoursStart: data.businessHoursStart ?? existing.businessHoursStart,
          businessHoursEnd: data.businessHoursEnd ?? existing.businessHoursEnd,
          businessDays: data.businessDays ?? existing.businessDays,
          followUpEnabled: data.followUpEnabled ?? existing.followUpEnabled,
          followUpDelayHours: data.followUpDelayHours ?? existing.followUpDelayHours,
          followUpMaxAttempts: data.followUpMaxAttempts ?? existing.followUpMaxAttempts,
          followUpMode: data.followUpMode ?? existing.followUpMode,
          followUpSequence: data.followUpSequence !== undefined ? data.followUpSequence : existing.followUpSequence,
          followUpActionAfterLimit: data.followUpActionAfterLimit ?? existing.followUpActionAfterLimit,
          filterEnabled: data.filterEnabled ?? existing.filterEnabled,
          triggerType: data.triggerType ?? existing.triggerType,
          triggerKeywords: data.triggerKeywords ?? existing.triggerKeywords,
          triggerCondition: data.triggerCondition ?? existing.triggerCondition,
          funnelObjectives: data.funnelObjectives !== undefined ? data.funnelObjectives : (existing as any).funnelObjectives,
          salesStrategies: data.salesStrategies !== undefined ? data.salesStrategies : (existing as any).salesStrategies,
          qualificationCriteria: data.qualificationCriteria !== undefined ? data.qualificationCriteria : (existing as any).qualificationCriteria,
          disqualificationCriteria: data.disqualificationCriteria !== undefined ? data.disqualificationCriteria : (existing as any).disqualificationCriteria,
          stopConditions: data.stopConditions !== undefined ? data.stopConditions : (existing as any).stopConditions,
          sdrMode: data.sdrMode !== undefined ? data.sdrMode : (existing as any).sdrMode,
        }
      });
    }

    return dbService.prisma.sDRConfig.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        personaName: data.personaName,
        personaRole: data.personaRole,
        personality: data.personality,
        baseInstructions: data.baseInstructions,
        instanceName: data.instanceName,
        maxWords: data.maxWords ?? 40,
        splitMessages: data.splitMessages ?? true,
        maxBubbles: data.maxBubbles ?? 3,
        qualificationFlow: data.qualificationFlow,
        postQualificationAction: data.postQualificationAction,
        webhookUrl: data.webhookUrl,
        spreadsheetEnabled: data.spreadsheetEnabled,
        businessHoursStart: data.businessHoursStart ?? '08:00',
        businessHoursEnd: data.businessHoursEnd ?? '18:00',
        businessDays: data.businessDays ?? '1,2,3,4,5',
        followUpEnabled: data.followUpEnabled ?? true,
        followUpDelayHours: data.followUpDelayHours ?? 2,
        followUpMaxAttempts: data.followUpMaxAttempts ?? 3,
        followUpMode: data.followUpMode ?? 'AI_CONTEXTUAL',
        followUpSequence: data.followUpSequence ?? null,
        followUpActionAfterLimit: data.followUpActionAfterLimit ?? 'PAUSE_FOLLOWUP',
        filterEnabled: data.filterEnabled ?? false,
        triggerType: data.triggerType ?? 'ALL',
        triggerKeywords: data.triggerKeywords ?? '',
        triggerCondition: data.triggerCondition ?? '',
        funnelObjectives: data.funnelObjectives ?? null,
        salesStrategies: data.salesStrategies ?? null,
        qualificationCriteria: data.qualificationCriteria ?? null,
        disqualificationCriteria: data.disqualificationCriteria ?? null,
        stopConditions: data.stopConditions ?? null,
        sdrMode: data.sdrMode ?? 'ADVANCED',
      }
    });
  }

  public async updateBotConfig(tenantId: string, data: {
    businessHoursStart?: string;
    businessHoursEnd?: string;
    businessDays?: string;
    followUpEnabled?: boolean;
    spreadsheetEnabled?: boolean;
  }): Promise<any> {
    if (this.useMemory()) {
      const config = this.memoryDb.sdrConfigs.find(s => s.tenantId === tenantId);
      if (config) {
        Object.assign(config, data, { updatedAt: new Date() });
      }
      return config || null;
    }
    const config = await dbService.prisma.sDRConfig.findFirst({ where: { tenantId } });
    if (config) {
      return dbService.prisma.sDRConfig.update({
        where: { id: config.id },
        data,
      });
    }
    return null;
  }

  public async updateSDRMode(tenantId: string, sdrMode: string): Promise<any> {
    if (this.useMemory()) {
      let config = this.memoryDb.sdrConfigs.find(s => s.tenantId === tenantId);
      if (config) {
        config.sdrMode = sdrMode;
        config.updatedAt = new Date();
        return config;
      } else {
        const newCfg: SDRConfig = {
          id: Math.random().toString(36).substring(2, 11),
          tenantId,
          name: 'Agente Comercial IA',
          personaName: 'Ana',
          personaRole: 'Consultora de Vendas',
          personality: 'Humana, empática e focada em entender as necessidades do lead.',
          baseInstructions: 'Atenda e qualifique leads de forma profissional.',
          instanceName: `tenant-${tenantId}`,
          maxWords: 40,
          splitMessages: true,
          maxBubbles: 3,
          qualificationFlow: '1. Descobrir interesse\n2. Alinhar orçamento e prazo\n3. Obter dados de contato',
          postQualificationAction: 'Transferir para um consultor especialista',
          webhookUrl: '',
          spreadsheetEnabled: false,
          businessHoursStart: '08:00',
          businessHoursEnd: '18:00',
          businessDays: '1,2,3,4,5',
          followUpEnabled: true,
          filterEnabled: false,
          triggerType: 'ALL',
          triggerKeywords: '',
          triggerCondition: '',
          funnelObjectives: null,
          salesStrategies: null,
          sdrMode,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.memoryDb.sdrConfigs.push(newCfg);
        return newCfg;
      }
    }

    const existing = await dbService.prisma.sDRConfig.findFirst({ where: { tenantId } });
    if (existing) {
      return dbService.prisma.sDRConfig.update({
        where: { id: existing.id },
        data: { sdrMode }
      });
    }

    return dbService.prisma.sDRConfig.create({
      data: {
        tenantId,
        name: 'Agente Comercial IA',
        personaName: 'Ana',
        personaRole: 'Consultora de Vendas',
        personality: 'Humana, empática e focada em entender as necessidades do lead.',
        baseInstructions: 'Atenda e qualifique leads de forma profissional.',
        instanceName: `tenant-${tenantId}`,
        maxWords: 40,
        splitMessages: true,
        maxBubbles: 3,
        qualificationFlow: '1. Descobrir interesse\n2. Alinhar orçamento e prazo\n3. Obter dados de contato',
        postQualificationAction: 'Transferir para um consultor especialista',
        webhookUrl: '',
        spreadsheetEnabled: false,
        businessHoursStart: '08:00',
        businessHoursEnd: '18:00',
        businessDays: '1,2,3,4,5',
        followUpEnabled: true,
        filterEnabled: false,
        triggerType: 'ALL',
        triggerKeywords: '',
        triggerCondition: '',
        funnelObjectives: null,
        salesStrategies: null,
        sdrMode,
      }
    });
  }

  // --- LEAD ---
  public async getLeadByPhone(tenantId: string, phone: string): Promise<Lead | null> {
    if (this.useMemory()) {
      return this.memoryDb.leads.find((l) => l.tenantId === tenantId && l.phone === phone) || null;
    }
    return dbService.prisma.lead.findUnique({
      where: {
        tenantId_phone: { tenantId, phone },
      },
    });
  }

  public async createLead(data: {
    tenantId: string;
    sdrConfigId?: string;
    phone: string;
    name?: string;
    email?: string;
  }): Promise<Lead> {
    if (this.useMemory()) {
      const newLead: Lead = {
        id: Math.random().toString(36).substring(2, 11),
        tenantId: data.tenantId,
        sdrConfigId: data.sdrConfigId || null,
        phone: data.phone,
        name: data.name || null,
        email: data.email || null,
        status: 'NEW',
        botPaused: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.memoryDb.leads.push(newLead);
      return newLead;
    }
    try {
      return await dbService.prisma.lead.create({
        data: {
          tenantId: data.tenantId,
          sdrConfigId: data.sdrConfigId,
          phone: data.phone,
          name: data.name,
          email: data.email,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const existing = await dbService.prisma.lead.findUnique({
          where: {
            tenantId_phone: {
              tenantId: data.tenantId,
              phone: data.phone,
            },
          },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  // --- STRATEGY STATE ---
  public async getLeadStrategyState(leadId: string): Promise<LeadStrategyState | null> {
    if (this.useMemory()) {
      return this.memoryDb.strategyStates.find((s) => s.leadId === leadId) || null;
    }
    return dbService.prisma.leadStrategyState.findUnique({ where: { leadId } });
  }

  public async upsertLeadStrategyState(
    leadId: string,
    currentObjective: string,
    currentStrategy: string
  ): Promise<LeadStrategyState> {
    if (this.useMemory()) {
      const existing = this.memoryDb.strategyStates.find((s) => s.leadId === leadId);
      if (existing) {
        existing.currentObjective = currentObjective;
        existing.currentStrategy = currentStrategy;
        existing.updatedAt = new Date();
        return existing;
      } else {
        const newState: LeadStrategyState = {
          id: Math.random().toString(36).substring(2, 11),
          leadId,
          currentObjective,
          currentStrategy,
          updatedAt: new Date(),
        };
        this.memoryDb.strategyStates.push(newState);
        return newState;
      }
    }
    return dbService.prisma.leadStrategyState.upsert({
      where: { leadId },
      update: { currentObjective, currentStrategy },
      create: { leadId, currentObjective, currentStrategy },
    });
  }

  // --- MEMORY ---
  public async getLeadMemories(leadId: string): Promise<LeadMemory[]> {
    if (this.useMemory()) {
      return this.memoryDb.memories.filter((m) => m.leadId === leadId);
    }
    const prismaMemories = await dbService.prisma.leadMemory.findMany({ where: { leadId } });
    return prismaMemories.map(m => ({
      ...m,
      embedding: null
    }));
  }

  public async addLeadMemory(leadId: string, fact: string, confidence: number = 1.0): Promise<LeadMemory> {
    const embedding = await vectorService.generateEmbedding(fact);

    if (this.useMemory()) {
      const newMemory: LeadMemory = {
        id: Math.random().toString(36).substring(2, 11),
        leadId,
        fact,
        confidence,
        embedding,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.memoryDb.memories.push(newMemory);
      return newMemory;
    }

    const created = await dbService.prisma.leadMemory.create({
      data: { leadId, fact, confidence },
    });

    try {
      const vectorStr = `[${embedding.join(',')}]`;
      await dbService.prisma.$executeRawUnsafe(
        `UPDATE "LeadMemory" SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        created.id
      );
    } catch (e) {
      console.warn('[Database] Failed to write pgvector embedding to LeadMemory:', e);
    }

    return {
      ...created,
      embedding,
    };
  }

  // --- MESSAGES ---
  public async getMessages(leadId: string, limit = 20): Promise<Message[]> {
    if (this.useMemory()) {
      return this.memoryDb.messages
        .filter((m) => m.leadId === leadId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .reverse();
    }
    return dbService.prisma.message.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }).then(msgs => msgs.reverse());
  }

  public async createMessage(leadId: string, sender: string, content: string): Promise<Message> {
    if (this.useMemory()) {
      const newMsg: Message = {
        id: Math.random().toString(36).substring(2, 11),
        leadId,
        sender,
        content,
        createdAt: new Date(),
      };
      this.memoryDb.messages.push(newMsg);
      return newMsg;
    }
    return dbService.prisma.message.create({
      data: { leadId, sender, content },
    });
  }

  // --- KNOWLEDGE ---
  public async getKnowledgeChunks(tenantId: string, query: string, limit = 3): Promise<KnowledgeChunk[]> {
    const queryEmbedding = await vectorService.generateEmbedding(query);

    if (this.useMemory()) {
      const sources = this.memoryDb.knowledgeSources.filter((s) => s.tenantId === tenantId);
      const sourceIds = sources.map((s) => s.id);
      const chunks = this.memoryDb.knowledgeChunks.filter((c) => sourceIds.includes(c.sourceId));

      const scoredChunks = chunks.map((chunk) => {
        const sim = chunk.embedding 
          ? vectorService.cosineSimilarity(queryEmbedding, chunk.embedding)
          : 0.0;
        return { chunk, sim };
      });

      scoredChunks.sort((a, b) => b.sim - a.sim);
      console.log(`[Repository] In-memory vector search scored matches:`, scoredChunks.map(s => `${s.sim.toFixed(4)}: "${s.chunk.content.substring(0, 30)}..."`));

      return scoredChunks.slice(0, limit).map((s) => s.chunk);
    }
    
    try {
      const vectorStr = `[${queryEmbedding.join(',')}]`;
      const querySql = `
        SELECT chunk.id, chunk."sourceId", chunk.content, (chunk.embedding <=> $1::vector) as distance
        FROM "KnowledgeChunk" chunk
        JOIN "KnowledgeSource" source ON chunk."sourceId" = source.id
        WHERE source."tenantId" = $2
        ORDER BY distance ASC
        LIMIT $3
      `;
      
      const results = await dbService.prisma.$queryRawUnsafe<any[]>(
        querySql,
        vectorStr,
        tenantId,
        limit
      );

      console.log(`[Repository] PostgreSQL vector search matched ${results.length} chunks.`);

      return results.map(row => ({
        id: row.id,
        sourceId: row.sourceId,
        content: row.content,
        embedding: null,
        createdAt: new Date()
      }));
    } catch (e) {
      console.warn('[Repository] Failed pgvector query, falling back to database text search:', e);
      const sources = await dbService.prisma.knowledgeSource.findMany({ where: { tenantId } });
      const sourceIds = sources.map((s) => s.id);
      return dbService.prisma.knowledgeChunk.findMany({
        where: {
          sourceId: { in: sourceIds },
          content: { contains: query, mode: 'insensitive' }
        },
        take: limit
      }) as unknown as Promise<KnowledgeChunk[]>;
    }
  }

  public async seedKnowledge(tenantId: string, sourceTitle: string, chunks: string[]): Promise<void> {
    if (this.useMemory()) {
      const source: KnowledgeSource = {
        id: Math.random().toString(36).substring(2, 11),
        tenantId,
        title: sourceTitle,
        type: 'PLAYBOOK',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.memoryDb.knowledgeSources.push(source);
      
      for (const text of chunks) {
        const embedding = await vectorService.generateEmbedding(text);
        this.memoryDb.knowledgeChunks.push({
          id: Math.random().toString(36).substring(2, 11),
          sourceId: source.id,
          content: text,
          embedding,
          createdAt: new Date(),
        });
      }
      return;
    }

    let source = await dbService.prisma.knowledgeSource.findFirst({
      where: { tenantId, title: sourceTitle }
    });

    if (!source) {
      source = await dbService.prisma.knowledgeSource.create({
        data: { tenantId, title: sourceTitle, type: 'PLAYBOOK' }
      });

      for (const text of chunks) {
        const created = await dbService.prisma.knowledgeChunk.create({
          data: {
            sourceId: source.id,
            content: text,
          }
        });

        const embedding = await vectorService.generateEmbedding(text);
        const vectorStr = `[${embedding.join(',')}]`;
        try {
          await dbService.prisma.$executeRawUnsafe(
            `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
            vectorStr,
            created.id
          );
        } catch (e) {
          console.warn('[Database] Failed to write pgvector to KnowledgeChunk:', e);
        }
      }
    }
  }

  // --- HUMAN CORRECTION ---
  public async saveHumanCorrection(data: {
    tenantId: string;
    leadId?: string;
    errorContext: string;
    originalResponse: string;
    correctedResponse: string;
    feedbackText: string;
  }): Promise<HumanCorrection> {
    const embedding = await vectorService.generateEmbedding(data.errorContext);

    if (this.useMemory()) {
      const newCorrection: HumanCorrection = {
        id: Math.random().toString(36).substring(2, 11),
        tenantId: data.tenantId,
        leadId: data.leadId || null,
        errorContext: data.errorContext,
        originalResponse: data.originalResponse,
        correctedResponse: data.correctedResponse,
        feedbackText: data.feedbackText,
        embedding,
        createdAt: new Date(),
      };
      this.memoryDb.humanCorrections.push(newCorrection);
      console.log(`[Repository] [In-Memory] Saved human correction. Count: ${this.memoryDb.humanCorrections.length}`);
      return newCorrection;
    }

    const created = await dbService.prisma.humanCorrection.create({
      data: {
        tenantId: data.tenantId,
        leadId: data.leadId,
        errorContext: data.errorContext,
        originalResponse: data.originalResponse,
        correctedResponse: data.correctedResponse,
        feedbackText: data.feedbackText,
      },
    });

    try {
      const vectorStr = `[${embedding.join(',')}]`;
      await dbService.prisma.$executeRawUnsafe(
        `UPDATE "HumanCorrection" SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        created.id
      );
    } catch (e) {
      console.warn('[Database] Failed to write pgvector embedding to HumanCorrection:', e);
    }

    return {
      ...created,
      embedding,
    };
  }

  public async searchSimilarCorrections(
    tenantId: string,
    contextQuery: string,
    limit = 2
  ): Promise<HumanCorrection[]> {
    const queryEmbedding = await vectorService.generateEmbedding(contextQuery);

    if (this.useMemory()) {
      const corrections = this.memoryDb.humanCorrections.filter((c) => c.tenantId === tenantId);
      
      const scored = corrections.map((c) => {
        const sim = c.embedding
          ? vectorService.cosineSimilarity(queryEmbedding, c.embedding)
          : 0.0;
        return { correction: c, sim };
      });

      scored.sort((a, b) => b.sim - a.sim);
      const relevant = scored.filter(s => s.sim >= 0.65);
      console.log(`[Repository] In-memory correction search scored matches (Similarity >= 0.65):`, relevant.map(s => `${s.sim.toFixed(4)}: "${s.correction.errorContext.substring(0, 30)}..."`));

      return relevant.slice(0, limit).map((s) => s.correction);
    }

    try {
      const vectorStr = `[${queryEmbedding.join(',')}]`;
      const querySql = `
        SELECT id, "tenantId", "leadId", "errorContext", "originalResponse", "correctedResponse", "feedbackText", (embedding <=> $1::vector) as distance
        FROM "HumanCorrection"
        WHERE "tenantId" = $2 AND (embedding <=> $1::vector) <= 0.35
        ORDER BY distance ASC
        LIMIT $3
      `;
      
      const results = await dbService.prisma.$queryRawUnsafe<any[]>(
        querySql,
        vectorStr,
        tenantId,
        limit
      );

      return results.map(row => ({
        id: row.id,
        tenantId: row.tenantId,
        leadId: row.leadId,
        errorContext: row.errorContext,
        originalResponse: row.originalResponse,
        correctedResponse: row.correctedResponse,
        feedbackText: row.feedbackText,
        embedding: null,
        createdAt: new Date()
      }));
    } catch (e) {
      console.warn('[Repository] Failed pgvector HumanCorrection query:', e);
      return [];
    }
  }

  // --- ANALYTICS ---
  public async createAnalyticsEvent(data: {
    tenantId: string;
    leadId?: string;
    eventType: string;
    objective?: string;
    strategy?: string;
    metadata?: string;
  }): Promise<AnalyticsEvent> {
    if (this.useMemory()) {
      const newEvent: AnalyticsEvent = {
        id: Math.random().toString(36).substring(2, 11),
        tenantId: data.tenantId,
        leadId: data.leadId || null,
        eventType: data.eventType,
        objective: data.objective || null,
        strategy: data.strategy || null,
        metadata: data.metadata || null,
        createdAt: new Date(),
      };
      this.memoryDb.analyticsEvents.push(newEvent);
      return newEvent;
    }

    return dbService.prisma.analyticsEvent.create({
      data: {
        tenantId: data.tenantId,
        leadId: data.leadId,
        eventType: data.eventType,
        objective: data.objective,
        strategy: data.strategy,
        metadata: data.metadata,
      },
    }) as unknown as Promise<AnalyticsEvent>;
  }

  public async getAnalyticsEvents(tenantId: string): Promise<AnalyticsEvent[]> {
    if (this.useMemory()) {
      return this.memoryDb.analyticsEvents.filter(e => e.tenantId === tenantId);
    }

    return dbService.prisma.analyticsEvent.findMany({
      where: { tenantId }
    }) as unknown as Promise<AnalyticsEvent[]>;
  }

  public async getTenants(): Promise<Tenant[]> {
    if (this.useMemory()) {
      return this.memoryDb.tenants;
    }
    return dbService.prisma.tenant.findMany({
      orderBy: { name: 'asc' }
    });
  }

  public async getTenantsByUser(ownerId: string): Promise<Tenant[]> {
    if (this.useMemory()) {
      let userTenants = this.memoryDb.tenants.filter(t => t.ownerId === ownerId);
      if (userTenants.length === 0 && this.memoryDb.tenants.length > 0) {
        const orphan = this.memoryDb.tenants.find(t => !t.ownerId);
        if (orphan) {
          orphan.ownerId = ownerId;
          userTenants = [orphan];
        }
      }
      return userTenants;
    }

    let tenants = await dbService.prisma.tenant.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' }
    });

    // If user has 0 tenants, assign orphan tenants if any exist
    if (tenants.length === 0) {
      const orphan = await dbService.prisma.tenant.findFirst({
        where: { ownerId: null }
      });
      if (orphan) {
        await dbService.prisma.tenant.update({
          where: { id: orphan.id },
          data: { ownerId }
        });
        const updated = await dbService.prisma.tenant.findUnique({ where: { id: orphan.id } });
        if (updated) tenants = [updated];
      }
    }

    return tenants;
  }

  public async getLeads(tenantId: string, options?: { search?: string; status?: string; tag?: string }): Promise<Lead[]> {
    if (this.useMemory()) {
      let leads = this.memoryDb.leads.filter((l) => l.tenantId === tenantId);
      if (options?.status && options.status !== 'ALL') {
        leads = leads.filter(l => l.status === options.status);
      }
      if (options?.tag && options.tag !== 'ALL') {
        leads = leads.filter(l => l.tags && l.tags.includes(options.tag!));
      }
      if (options?.search) {
        const q = options.search.toLowerCase();
        leads = leads.filter(l => 
          (l.name && l.name.toLowerCase().includes(q)) || 
          l.phone.includes(q) || 
          (l.email && l.email.toLowerCase().includes(q))
        );
      }
      return leads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    const where: any = { tenantId };
    if (options?.status && options.status !== 'ALL') {
      where.status = options.status;
    }
    if (options?.tag && options.tag !== 'ALL') {
      where.tags = { has: options.tag };
    }
    if (options?.search) {
      const q = options.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    return dbService.prisma.lead.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });
  }

  public async getLeadById(leadId: string): Promise<any | null> {
    if (this.useMemory()) {
      const lead = this.memoryDb.leads.find((l) => l.id === leadId);
      if (!lead) return null;
      const messages = this.memoryDb.messages.filter(m => m.leadId === leadId);
      return { ...lead, messages };
    }
    return dbService.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        },
        memories: true,
        strategyState: true
      }
    });
  }

  public async createLeadManual(data: {
    tenantId: string;
    phone: string;
    name?: string;
    email?: string;
    status?: string;
    tags?: string[];
    customFields?: any;
    notes?: string;
  }): Promise<Lead> {
    if (this.useMemory()) {
      const newLead: Lead = {
        id: Math.random().toString(36).substring(2, 11),
        tenantId: data.tenantId,
        phone: data.phone,
        name: data.name || null,
        email: data.email || null,
        status: data.status || 'NEW',
        tags: data.tags || [],
        customFields: data.customFields || {},
        notes: data.notes || null,
        botPaused: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.memoryDb.leads.push(newLead);
      return newLead;
    }

    return dbService.prisma.lead.create({
      data: {
        tenantId: data.tenantId,
        phone: data.phone,
        name: data.name || null,
        email: data.email || null,
        status: data.status || 'NEW',
        tags: data.tags || [],
        customFields: data.customFields || {},
        notes: data.notes || null,
      }
    });
  }

  public async updateLeadFull(leadId: string, data: {
    name?: string;
    phone?: string;
    email?: string;
    status?: string;
    tags?: string[];
    customFields?: any;
    notes?: string;
    botPaused?: boolean;
  }): Promise<Lead> {
    if (this.useMemory()) {
      const lead = this.memoryDb.leads.find(l => l.id === leadId);
      if (!lead) throw new Error(`Lead not found: ${leadId}`);
      Object.assign(lead, data, { updatedAt: new Date() });
      return lead;
    }

    return dbService.prisma.lead.update({
      where: { id: leadId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        ...(data.customFields !== undefined ? { customFields: data.customFields } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.botPaused !== undefined ? { botPaused: data.botPaused } : {}),
      }
    });
  }

  public async deleteLead(leadId: string): Promise<boolean> {
    if (this.useMemory()) {
      const idx = this.memoryDb.leads.findIndex(l => l.id === leadId);
      if (idx >= 0) {
        this.memoryDb.leads.splice(idx, 1);
        this.memoryDb.messages = this.memoryDb.messages.filter(m => m.leadId !== leadId);
        this.memoryDb.memories = this.memoryDb.memories.filter(m => m.leadId !== leadId);
        this.memoryDb.strategyStates = this.memoryDb.strategyStates.filter(s => s.leadId !== leadId);
        this.memoryDb.aiTraces = this.memoryDb.aiTraces.filter(t => t.leadId !== leadId);
        return true;
      }
      return false;
    }

    try {
      // Purge any detached traces, human corrections and related records for full LGPD compliance
      await (dbService.prisma as any).aITrace.deleteMany({ where: { leadId } }).catch(() => {});
      await (dbService.prisma as any).humanCorrection.deleteMany({ where: { leadId } }).catch(() => {});
      await dbService.prisma.lead.delete({
        where: { id: leadId }
      });
      return true;
    } catch (e) {
      console.warn('[Repository] Error deleting lead:', e);
      return false;
    }
  }

  // --- LGPD COMPLIANCE: EXPORT DATA REPORT (Art. 18, II) ---
  public async exportLeadLGPD(leadId: string): Promise<any | null> {
    const lead = await this.getLeadById(leadId);
    if (!lead) return null;

    const messages = await this.getMessages(leadId, 200);
    const memories = await this.getLeadMemories(leadId);
    const strategyState = await this.getLeadStrategyState(leadId);

    return {
      lgpdReport: {
        title: 'Relatório de Dados do Titular (LGPD - Lei 13.709/2018)',
        generatedAt: new Date().toISOString(),
        dataSubject: {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          status: lead.status,
          tags: lead.tags,
          customFields: lead.customFields,
          botPaused: lead.botPaused,
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt,
        },
        commercialStrategy: strategyState ? {
          currentObjective: strategyState.currentObjective,
          currentStrategy: strategyState.currentStrategy,
          updatedAt: strategyState.updatedAt,
        } : null,
        extractedMemories: memories.map(m => ({ fact: m.fact, confidence: m.confidence, date: m.createdAt })),
        conversationTranscripts: messages.map(m => ({
          sender: m.sender,
          content: m.content,
          timestamp: m.createdAt
        })),
        legalNotice: 'Este documento contém todos os dados pessoais e históricos associados a este contato tratados na plataforma SDR Inteligente sob a finalidade de atendimento e qualificação comercial.'
      }
    };
  }

  public async getTenantTags(tenantId: string): Promise<string[]> {
    if (this.useMemory()) {
      const leads = this.memoryDb.leads.filter(l => l.tenantId === tenantId);
      const tagSet = new Set<string>();
      leads.forEach(l => (l.tags || []).forEach(t => tagSet.add(t)));
      return Array.from(tagSet);
    }

    const leads = await dbService.prisma.lead.findMany({
      where: { tenantId },
      select: { tags: true }
    });
    const tagSet = new Set<string>();
    leads.forEach(l => l.tags.forEach(t => tagSet.add(t)));
    return Array.from(tagSet);
  }

  public async getKnowledgeSources(tenantId: string): Promise<any[]> {
    if (this.useMemory()) {
      const sources = this.memoryDb.knowledgeSources.filter((s) => s.tenantId === tenantId);
      return sources.map(source => {
        const chunks = this.memoryDb.knowledgeChunks.filter((c) => c.sourceId === source.id);
        return { ...source, chunks };
      });
    }
    return dbService.prisma.knowledgeSource.findMany({
      where: { tenantId },
      include: { chunks: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  public async updateLeadStatus(leadId: string, status: string): Promise<Lead> {
    if (this.useMemory()) {
      const lead = this.memoryDb.leads.find((l) => l.id === leadId);
      if (lead) {
        lead.status = status;
        lead.updatedAt = new Date();
        return lead;
      }
      throw new Error(`Lead not found: ${leadId}`);
    }
    return dbService.prisma.lead.update({
      where: { id: leadId },
      data: { status },
    });
  }

  public async getMediaAssets(tenantId: string): Promise<MediaAsset[]> {
    if (this.useMemory()) {
      return this.memoryDb.mediaAssets.filter((m) => m.tenantId === tenantId);
    }
    return dbService.prisma.mediaAsset.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });
  }

  public async getMediaAssetById(id: string): Promise<MediaAsset | null> {
    if (this.useMemory()) {
      return this.memoryDb.mediaAssets.find((m) => m.id === id) || null;
    }
    return dbService.prisma.mediaAsset.findUnique({
      where: { id }
    });
  }

  public async createMediaAsset(data: {
    tenantId: string;
    triggerValue: string;
    mediaType: string;
    mediaUrl: string;
    caption?: string;
  }): Promise<MediaAsset> {
    if (this.useMemory()) {
      const newAsset: MediaAsset = {
        id: Math.random().toString(36).substring(2, 11),
        tenantId: data.tenantId,
        triggerValue: data.triggerValue,
        mediaType: data.mediaType,
        mediaUrl: data.mediaUrl,
        caption: data.caption || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.memoryDb.mediaAssets.push(newAsset);
      return newAsset;
    }
    return dbService.prisma.mediaAsset.create({
      data: {
        tenantId: data.tenantId,
        triggerValue: data.triggerValue,
        mediaType: data.mediaType,
        mediaUrl: data.mediaUrl,
        caption: data.caption,
      }
    });
  }

  public async deleteMediaAsset(id: string): Promise<boolean> {
    if (this.useMemory()) {
      const idx = this.memoryDb.mediaAssets.findIndex((m) => m.id === id);
      if (idx >= 0) {
        this.memoryDb.mediaAssets.splice(idx, 1);
        return true;
      }
      return false;
    }
    try {
      await dbService.prisma.mediaAsset.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  // --- USER AUTH ---
  public async createUser(email: string, name: string, passwordHash: string): Promise<User> {
    if (this.useMemory()) {
      const existing = this.memoryDb.users.find(u => u.email === email);
      if (existing) throw new Error('Email already in use');
      const user: User = {
        id: Math.random().toString(36).substring(2, 11),
        email,
        name,
        passwordHash,
        plan: 'free',
        role: 'USER',
        maxTenants: 1,
        maxAgentsPerTenant: 1,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.memoryDb.users.push(user);
      return user;
    }
    return dbService.prisma.user.create({
      data: { email, name, passwordHash }
    });
  }

  public async getUserByEmail(email: string): Promise<User | null> {
    if (this.useMemory()) {
      return this.memoryDb.users.find(u => u.email === email) || null;
    }
    return dbService.prisma.user.findUnique({ where: { email } });
  }

  public async getUserById(id: string): Promise<User | null> {
    if (this.useMemory()) {
      return this.memoryDb.users.find(u => u.id === id) || null;
    }
    return dbService.prisma.user.findUnique({ where: { id } });
  }

  public async createTenantForUser(name: string, ownerId: string): Promise<Tenant> {
    if (this.useMemory()) {
      const tenant: Tenant = {
        id: Math.random().toString(36).substring(2, 11),
        name,
        ownerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.memoryDb.tenants.push(tenant);
      return tenant;
    }
    return dbService.prisma.tenant.create({
      data: { name, ownerId }
    });
  }

  public async countTenantsByUser(ownerId: string): Promise<number> {
    if (this.useMemory()) {
      return this.memoryDb.tenants.filter(t => t.ownerId === ownerId).length;
    }
    return dbService.prisma.tenant.count({ where: { ownerId } });
  }

  public async countAgentsByUser(ownerId: string): Promise<number> {
    if (this.useMemory()) {
      const userTenantIds = this.memoryDb.tenants.filter(t => t.ownerId === ownerId).map(t => t.id);
      return this.memoryDb.sdrConfigs.filter(s => userTenantIds.includes(s.tenantId)).length;
    }
    return dbService.prisma.sDRConfig.count({ where: { tenant: { ownerId } } });
  }

  public async getAllUsers(): Promise<any[]> {
    if (this.useMemory()) {
      return this.memoryDb.users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        plan: u.plan,
        role: u.role,
        status: u.status,
        maxTenants: u.maxTenants,
        maxAgentsPerTenant: u.maxAgentsPerTenant,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        tenants: this.memoryDb.tenants
          .filter(t => t.ownerId === u.id)
          .map(t => ({
            id: t.id,
            name: t.name,
            createdAt: t.createdAt,
            _count: {
              sdrConfigs: this.memoryDb.sdrConfigs.filter(s => s.tenantId === t.id).length
            }
          })),
        _count: {
          tenants: this.memoryDb.tenants.filter(t => t.ownerId === u.id).length
        }
      }));
    }
    return dbService.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        role: true,
        status: true,
        maxTenants: true,
        maxAgentsPerTenant: true,
        createdAt: true,
        updatedAt: true,
        tenants: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            _count: {
              select: { sdrConfigs: true }
            }
          }
        },
        _count: {
          select: { tenants: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  public async updateUserAdmin(id: string, data: any): Promise<any> {
    if (this.useMemory()) {
      const user = this.memoryDb.users.find(u => u.id === id);
      if (!user) throw new Error('Usuário não encontrado');
      Object.assign(user, data, { updatedAt: new Date() });
      return user;
    }
    return dbService.prisma.user.update({
      where: { id },
      data,
    });
  }

  public async deleteUser(id: string): Promise<void> {
    if (this.useMemory()) {
      this.memoryDb.users = this.memoryDb.users.filter(u => u.id !== id);
      const userTenantIds = this.memoryDb.tenants.filter(t => t.ownerId === id).map(t => t.id);
      this.memoryDb.tenants = this.memoryDb.tenants.filter(t => t.ownerId !== id);
      this.memoryDb.sdrConfigs = this.memoryDb.sdrConfigs.filter(s => !userTenantIds.includes(s.tenantId));
      return;
    }
    await dbService.prisma.user.delete({ where: { id } });
  }

  public async createUserAdmin(data: {
    email: string;
    name: string;
    passwordHash: string;
    role?: string;
    plan?: string;
    maxTenants?: number;
    maxAgentsPerTenant?: number;
    status?: string;
  }): Promise<User> {
    if (this.useMemory()) {
      const user: User = {
        id: Math.random().toString(36).substring(2, 11),
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        plan: data.plan || 'free',
        role: data.role || 'USER',
        maxTenants: data.maxTenants !== undefined ? data.maxTenants : 1,
        maxAgentsPerTenant: data.maxAgentsPerTenant !== undefined ? data.maxAgentsPerTenant : 1,
        status: data.status || 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.memoryDb.users.push(user);
      return user;
    }
    return dbService.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        role: data.role || 'USER',
        plan: data.plan || 'free',
        maxTenants: data.maxTenants !== undefined ? data.maxTenants : 1,
        maxAgentsPerTenant: data.maxAgentsPerTenant !== undefined ? data.maxAgentsPerTenant : 1,
        status: data.status || 'ACTIVE',
      }
    });
  }

  public async getHumanCorrections(tenantId: string, limit = 50): Promise<HumanCorrection[]> {
    if (this.useMemory()) {
      return this.memoryDb.humanCorrections
        .filter(c => c.tenantId === tenantId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    }
    const results = await dbService.prisma.humanCorrection.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return results.map(r => ({ ...r, embedding: null }));
  }

  public async getLeadMemoriesByLead(leadId: string): Promise<LeadMemory[]> {
    return this.getLeadMemories(leadId);
  }

  public async getKnowledgeStats(tenantId: string): Promise<{ sourceCount: number; chunkCount: number }> {
    if (this.useMemory()) {
      const sources = this.memoryDb.knowledgeSources.filter(s => s.tenantId === tenantId);
      const sourceIds = sources.map(s => s.id);
      const chunks = this.memoryDb.knowledgeChunks.filter(c => sourceIds.includes(c.sourceId));
      return { sourceCount: sources.length, chunkCount: chunks.length };
    }
    const sources = await dbService.prisma.knowledgeSource.findMany({ where: { tenantId } });
    const sourceIds = sources.map(s => s.id);
    const chunkCount = await dbService.prisma.knowledgeChunk.count({
      where: { sourceId: { in: sourceIds } }
    });
    return { sourceCount: sources.length, chunkCount };
  }

  // --- MISSING METHODS ---
  public async getTrainingSessions(tenantId: string): Promise<any[]> {
    if (this.useMemory()) return [];
    return dbService.prisma.trainingSession.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  }

  public async getAgentReflections(tenantId: string): Promise<any[]> {
    if (this.useMemory()) return [];
    return dbService.prisma.agentReflection.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  }

  public async deleteKnowledge(id: string): Promise<void> {
    if (this.useMemory()) {
      this.memoryDb.knowledgeSources = this.memoryDb.knowledgeSources.filter((s) => s.id !== id);
      this.memoryDb.knowledgeChunks = this.memoryDb.knowledgeChunks.filter((c) => c.sourceId !== id);
      return;
    }
    await dbService.prisma.knowledgeSource.delete({ where: { id } });
  }

  public async updateLead(id: string, data: Partial<Lead>): Promise<Lead | null> {
    if (this.useMemory()) {
      const lead = this.memoryDb.leads.find(l => l.id === id);
      if (lead) Object.assign(lead, data, { updatedAt: new Date() });
      return lead || null;
    }
    return dbService.prisma.lead.update({ where: { id }, data: data as any });
  }

  public async getLeadMessages(leadId: string, limit = 50): Promise<Message[]> {
    return this.getMessages(leadId, limit);
  }

  public async getFlows(tenantId: string): Promise<any[]> {
    if (this.useMemory()) {
      return this.memoryDb.flows.filter(f => f.tenantId === tenantId);
    }
    return dbService.prisma.flow.findMany({ where: { tenantId } });
  }

  public async getFlowById(id: string): Promise<any | null> {
    if (this.useMemory()) {
      return this.memoryDb.flows.find(f => f.id === id) || null;
    }
    return dbService.prisma.flow.findUnique({ where: { id } });
  }

  public async createFlow(data: any): Promise<any> {
    if (this.useMemory()) {
      const flow = { id: Math.random().toString(36).substring(2, 11), createdAt: new Date(), updatedAt: new Date(), ...data };
      this.memoryDb.flows.push(flow);
      return flow;
    }
    return dbService.prisma.flow.create({ data });
  }

  public async updateFlow(id: string, data: any): Promise<any> {
    if (this.useMemory()) {
      const flow = this.memoryDb.flows.find(f => f.id === id);
      if (flow) Object.assign(flow, data, { updatedAt: new Date() });
      return flow || null;
    }
    return dbService.prisma.flow.update({ where: { id }, data });
  }

  public async deleteFlow(id: string): Promise<void> {
    if (this.useMemory()) {
      this.memoryDb.flows = this.memoryDb.flows.filter(f => f.id !== id);
      return;
    }
    await dbService.prisma.flow.delete({ where: { id } });
  }

  public async createTrainingSession(data: any): Promise<any> {
    if (this.useMemory()) {
      const session = { id: Math.random().toString(36).substring(2, 11), createdAt: new Date(), ...data };
      this.memoryDb.trainingSessions.push(session);
      return session;
    }
    return dbService.prisma.trainingSession.create({ data });
  }

  public async updateTrainingSession(id: string, data: any): Promise<any> {
    if (this.useMemory()) {
      const session = this.memoryDb.trainingSessions.find(s => s.id === id);
      if (session) Object.assign(session, data);
      return session || null;
    }
    return dbService.prisma.trainingSession.update({ where: { id }, data });
  }

  public async createAgentReflection(data: any): Promise<any> {
    if (this.useMemory()) {
      const reflection = { id: Math.random().toString(36).substring(2, 11), createdAt: new Date(), ...data };
      this.memoryDb.agentReflections.push(reflection);
      return reflection;
    }
    return dbService.prisma.agentReflection.create({ data });
  }

  // --- FLOW EXECUTION METHODS ---
  public async getFlowExecution(leadId: string): Promise<any | null> {
    if (this.useMemory()) return null;
    return dbService.prisma.flowExecution.findFirst({
      where: { leadId, status: { in: ['RUNNING', 'PAUSED'] } },
      orderBy: { createdAt: 'desc' }
    });
  }

  public async createFlowExecution(data: any): Promise<any> {
    if (this.useMemory()) return null;
    return dbService.prisma.flowExecution.create({ data });
  }

  public async updateFlowExecution(id: string, data: any): Promise<any> {
    if (this.useMemory()) return null;
    return dbService.prisma.flowExecution.update({ where: { id }, data });
  }

  // --- AI DECISION TRACE METHODS ---
  public async saveAITrace(data: {
    tenantId: string;
    leadId?: string | null;
    phone: string;
    inputMessage: string;
    memoriesFound?: string[];
    knowledgeChunks?: string[];
    currentObjective: string;
    nextObjective: string;
    objectiveReason: string;
    currentStrategy: string;
    nextStrategy: string;
    strategyReason: string;
    leadStatusBefore?: string;
    leadStatusAfter?: string;
    fewShotUsed?: string | null;
    generatedPrompt?: string | null;
    finalResponse: string;
  }): Promise<AITrace> {
    const traceRecord: AITrace = {
      id: Math.random().toString(36).substring(2, 11),
      tenantId: data.tenantId,
      leadId: data.leadId || null,
      phone: data.phone,
      inputMessage: data.inputMessage,
      memoriesFound: data.memoriesFound || [],
      knowledgeChunks: data.knowledgeChunks || [],
      currentObjective: data.currentObjective,
      nextObjective: data.nextObjective,
      objectiveReason: data.objectiveReason,
      currentStrategy: data.currentStrategy,
      nextStrategy: data.nextStrategy,
      strategyReason: data.strategyReason,
      leadStatusBefore: data.leadStatusBefore || 'NEW',
      leadStatusAfter: data.leadStatusAfter || 'NEW',
      fewShotUsed: data.fewShotUsed || null,
      generatedPrompt: data.generatedPrompt || null,
      finalResponse: data.finalResponse,
      createdAt: new Date(),
    };

    if (this.useMemory()) {
      this.memoryDb.aiTraces.unshift(traceRecord);
      if (this.memoryDb.aiTraces.length > 100) this.memoryDb.aiTraces.pop();
      return traceRecord;
    }

    try {
      return await (dbService.prisma as any).aITrace.create({
        data: {
          tenantId: data.tenantId,
          leadId: data.leadId || null,
          phone: data.phone,
          inputMessage: data.inputMessage,
          memoriesFound: data.memoriesFound || [],
          knowledgeChunks: data.knowledgeChunks || [],
          currentObjective: data.currentObjective,
          nextObjective: data.nextObjective,
          objectiveReason: data.objectiveReason,
          currentStrategy: data.currentStrategy,
          nextStrategy: data.nextStrategy,
          strategyReason: data.strategyReason,
          leadStatusBefore: data.leadStatusBefore || 'NEW',
          leadStatusAfter: data.leadStatusAfter || 'NEW',
          fewShotUsed: data.fewShotUsed || null,
          generatedPrompt: data.generatedPrompt || null,
          finalResponse: data.finalResponse,
        }
      });
    } catch (err) {
      console.warn('[Repository] Error saving AITrace to database, saving in memory buffer:', err);
      this.memoryDb.aiTraces.unshift(traceRecord);
      return traceRecord;
    }
  }

  public async getAITraces(tenantId: string, limit = 50): Promise<AITrace[]> {
    if (this.useMemory()) {
      return this.memoryDb.aiTraces.filter(t => t.tenantId === tenantId).slice(0, limit);
    }
    try {
      const traces = await (dbService.prisma as any).aITrace.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit
      });
      return traces;
    } catch (err) {
      console.warn('[Repository] Error reading AITraces from database, falling back to memory buffer:', err);
      return this.memoryDb.aiTraces.filter(t => t.tenantId === tenantId).slice(0, limit);
    }
  }

  public async getSystemSettings(): Promise<SystemSetting> {
    if (this.useMemory()) {
      return this.memoryDb.systemSettings;
    }
    try {
      let settings = await (dbService.prisma as any).systemSetting.findUnique({
        where: { id: 'global' }
      });
      if (!settings) {
        settings = await (dbService.prisma as any).systemSetting.create({
          data: {
            id: 'global',
            aiProvider: process.env.AI_PROVIDER || 'GEMINI',
            openaiApiKey: process.env.OPENAI_API_KEY || null,
            openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            geminiApiKey: process.env.GEMINI_API_KEY || null,
            geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
          }
        });
      }
      return settings;
    } catch (err) {
      console.warn('[Repository] Error reading SystemSetting, falling back to memory/env:', err);
      return this.memoryDb.systemSettings;
    }
  }

  public async updateSystemSettings(data: Partial<SystemSetting>): Promise<SystemSetting> {
    if (this.useMemory()) {
      this.memoryDb.systemSettings = {
        ...this.memoryDb.systemSettings,
        ...data,
        updatedAt: new Date()
      };
      return this.memoryDb.systemSettings;
    }
    try {
      const updated = await (dbService.prisma as any).systemSetting.upsert({
        where: { id: 'global' },
        create: {
          id: 'global',
          aiProvider: data.aiProvider || 'GEMINI',
          openaiApiKey: data.openaiApiKey !== undefined ? data.openaiApiKey : null,
          openaiModel: data.openaiModel || 'gpt-4o-mini',
          geminiApiKey: data.geminiApiKey !== undefined ? data.geminiApiKey : null,
          geminiModel: data.geminiModel || 'gemini-2.5-flash',
        },
        update: {
          ...(data.aiProvider !== undefined ? { aiProvider: data.aiProvider } : {}),
          ...(data.openaiApiKey !== undefined ? { openaiApiKey: data.openaiApiKey } : {}),
          ...(data.openaiModel !== undefined ? { openaiModel: data.openaiModel } : {}),
          ...(data.geminiApiKey !== undefined ? { geminiApiKey: data.geminiApiKey } : {}),
          ...(data.geminiModel !== undefined ? { geminiModel: data.geminiModel } : {}),
        }
      });
      return updated;
    } catch (err) {
      console.warn('[Repository] Error updating SystemSetting, updating in memory:', err);
      this.memoryDb.systemSettings = {
        ...this.memoryDb.systemSettings,
        ...data,
        updatedAt: new Date()
      };
      return this.memoryDb.systemSettings;
    }
  }

  public async updateUserPassword(userId: string, newPasswordHash: string): Promise<boolean> {
    if (this.useMemory()) {
      const user = this.memoryDb.users.find(u => u.id === userId);
      if (user) {
        user.passwordHash = newPasswordHash;
        user.updatedAt = new Date();
        return true;
      }
      return false;
    }
    try {
      await dbService.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash, updatedAt: new Date() }
      });
      return true;
    } catch (err) {
      console.error('[Repository] Error updating user password:', err);
      return false;
    }
  }

  public async updateFollowUpConfig(tenantId: string, data: {
    followUpEnabled?: boolean;
    followUpDelayHours?: number;
    followUpMaxAttempts?: number;
    followUpMode?: string;
    followUpSequence?: string | null;
    followUpActionAfterLimit?: string;
    businessHoursStart?: string;
    businessHoursEnd?: string;
    businessDays?: string;
  }): Promise<SDRConfig | null> {
    if (this.useMemory()) {
      let config = this.memoryDb.sdrConfigs.find(s => s.tenantId === tenantId);
      if (config) {
        Object.assign(config, data, { updatedAt: new Date() });
        return config;
      }
      return null;
    }
    const config = await dbService.prisma.sDRConfig.findFirst({ where: { tenantId } });
    if (config) {
      return dbService.prisma.sDRConfig.update({
        where: { id: config.id },
        data,
      });
    }
    return null;
  }

  public async createOutboundCampaign(data: {
    tenantId: string;
    phone: string;
    name?: string | null;
    message: string;
    status?: string;
    source?: string;
    errorMessage?: string | null;
  }): Promise<OutboundCampaign> {
    const record: OutboundCampaign = {
      id: Math.random().toString(36).substring(2, 11),
      tenantId: data.tenantId,
      phone: data.phone,
      name: data.name || null,
      message: data.message,
      status: data.status || 'SENT',
      source: data.source || 'MANUAL',
      errorMessage: data.errorMessage || null,
      createdAt: new Date(),
    };

    if (this.useMemory()) {
      this.memoryDb.outboundCampaigns.unshift(record);
      return record;
    }

    try {
      const created = await (dbService.prisma as any).outboundCampaign.create({
        data: {
          tenantId: data.tenantId,
          phone: data.phone,
          name: data.name || null,
          message: data.message,
          status: data.status || 'SENT',
          source: data.source || 'MANUAL',
          errorMessage: data.errorMessage || null,
        }
      });
      return created;
    } catch (err) {
      console.warn('[Repository] Error creating OutboundCampaign in DB, saving in memory:', err);
      this.memoryDb.outboundCampaigns.unshift(record);
      return record;
    }
  }

  public async getOutboundCampaigns(tenantId: string, limit = 100): Promise<OutboundCampaign[]> {
    if (this.useMemory()) {
      return this.memoryDb.outboundCampaigns.filter(c => c.tenantId === tenantId).slice(0, limit);
    }
    try {
      const list = await (dbService.prisma as any).outboundCampaign.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return list;
    } catch (err) {
      console.warn('[Repository] Error fetching OutboundCampaigns from DB, fallback to memory:', err);
      return this.memoryDb.outboundCampaigns.filter(c => c.tenantId === tenantId).slice(0, limit);
    }
  }

  public async getEligibleFollowUpLeads(tenantId: string, delayHours: number, maxAttempts: number): Promise<Lead[]> {
    const cutoffDate = new Date(Date.now() - delayHours * 60 * 60 * 1000);

    if (this.useMemory()) {
      return this.memoryDb.leads.filter(l => {
        if (l.tenantId !== tenantId) return false;
        if (l.botPaused) return false;
        if (['QUALIFIED', 'DISQUALIFIED', 'HANDOFF', 'UNRESPONSIVE'].includes(l.status)) return false;
        const attempts = l.followUpCount || 0;
        if (attempts >= maxAttempts) return false;
        
        if (delayHours > 0) {
          const lastActivity = l.lastInteractionAt || l.updatedAt || l.createdAt;
          return new Date(lastActivity).getTime() <= cutoffDate.getTime();
        }
        return true;
      });
    }

    try {
      const where: any = {
        tenantId,
        botPaused: false,
        status: {
          notIn: ['QUALIFIED', 'DISQUALIFIED', 'HANDOFF', 'UNRESPONSIVE']
        },
        followUpCount: {
          lt: maxAttempts
        }
      };

      if (delayHours > 0) {
        where.updatedAt = { lte: cutoffDate };
      }

      const leads = await dbService.prisma.lead.findMany({
        where,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });
      return leads as any[];
    } catch (err) {
      console.warn('[Repository] Error fetching eligible followup leads from DB:', err);
      return [];
    }
  }

  public async incrementLeadFollowUp(leadId: string): Promise<void> {
    const now = new Date();
    if (this.useMemory()) {
      const lead = this.memoryDb.leads.find(l => l.id === leadId);
      if (lead) {
        lead.followUpCount = (lead.followUpCount || 0) + 1;
        lead.lastFollowUpAt = now;
        lead.updatedAt = now;
      }
      return;
    }
    try {
      await dbService.prisma.lead.update({
        where: { id: leadId },
        data: {
          followUpCount: { increment: 1 },
          lastFollowUpAt: now,
          updatedAt: now,
        }
      });
    } catch (err) {
      console.warn(`[Repository] Error incrementing followUp for lead ${leadId}:`, err);
    }
  }

  public async resetLeadFollowUp(leadId: string): Promise<void> {
    const now = new Date();
    if (this.useMemory()) {
      const lead = this.memoryDb.leads.find(l => l.id === leadId);
      if (lead) {
        lead.followUpCount = 0;
        lead.lastInteractionAt = now;
        lead.updatedAt = now;
      }
      return;
    }
    try {
      await dbService.prisma.lead.update({
        where: { id: leadId },
        data: {
          followUpCount: 0,
          lastInteractionAt: now,
          updatedAt: now,
        }
      });
    } catch (err) {
      console.warn(`[Repository] Error resetting followUp for lead ${leadId}:`, err);
    }
  }

}

export const repo = Repository.getInstance();

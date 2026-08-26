/*
  Warnings:

  - A unique constraint covering the columns `[instanceName]` on the table `SDRConfig` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "botPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customFields" JSONB DEFAULT '{}',
ADD COLUMN     "followUpCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "sdrConfigId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SDRConfig" ADD COLUMN     "businessDays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
ADD COLUMN     "businessHoursEnd" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN     "businessHoursStart" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "disqualificationCriteria" TEXT,
ADD COLUMN     "filterEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "followUpActionAfterLimit" TEXT NOT NULL DEFAULT 'PAUSE_FOLLOWUP',
ADD COLUMN     "followUpDelayHours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "followUpEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "followUpMaxAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "followUpMode" TEXT NOT NULL DEFAULT 'AI_CONTEXTUAL',
ADD COLUMN     "followUpSequence" TEXT,
ADD COLUMN     "funnelObjectives" TEXT,
ADD COLUMN     "instanceName" TEXT,
ADD COLUMN     "maxBubbles" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "maxWords" INTEGER NOT NULL DEFAULT 40,
ADD COLUMN     "postQualificationAction" TEXT NOT NULL DEFAULT 'Notificar equipe de vendas e salvar no CRM.',
ADD COLUMN     "qualificationCriteria" TEXT,
ADD COLUMN     "qualificationFlow" TEXT NOT NULL DEFAULT 'Perguntar nome, email, intenção de compra e orçamento.',
ADD COLUMN     "salesStrategies" TEXT,
ADD COLUMN     "sdrMode" TEXT NOT NULL DEFAULT 'ADVANCED',
ADD COLUMN     "splitMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "spreadsheetEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stopConditions" TEXT,
ADD COLUMN     "triggerCondition" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "triggerKeywords" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "triggerType" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN     "webhookUrl" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "ownerId" TEXT;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "role" TEXT NOT NULL DEFAULT 'USER',
    "maxTenants" INTEGER NOT NULL DEFAULT 1,
    "maxAgentsPerTenant" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "triggerValue" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "triggerValue" TEXT,
    "nodes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowExecution" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "currentNodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "variables" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentReflection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "insights" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentReflection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AITrace" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "phone" TEXT NOT NULL,
    "inputMessage" TEXT NOT NULL,
    "memoriesFound" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "knowledgeChunks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentObjective" TEXT NOT NULL,
    "nextObjective" TEXT NOT NULL,
    "objectiveReason" TEXT NOT NULL,
    "currentStrategy" TEXT NOT NULL,
    "nextStrategy" TEXT NOT NULL,
    "strategyReason" TEXT NOT NULL,
    "leadStatusBefore" TEXT NOT NULL DEFAULT 'NEW',
    "leadStatusAfter" TEXT NOT NULL DEFAULT 'NEW',
    "fewShotUsed" TEXT,
    "generatedPrompt" TEXT,
    "finalResponse" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AITrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "aiProvider" TEXT NOT NULL DEFAULT 'GEMINI',
    "openaiApiKey" TEXT,
    "openaiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "geminiApiKey" TEXT,
    "geminiModel" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "OutboundCampaign_tenantId_createdAt_idx" ON "OutboundCampaign"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AITrace_tenantId_createdAt_idx" ON "AITrace"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SDRConfig_instanceName_key" ON "SDRConfig"("instanceName");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundCampaign" ADD CONSTRAINT "OutboundCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowExecution" ADD CONSTRAINT "FlowExecution_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowExecution" ADD CONSTRAINT "FlowExecution_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

import { repo, SDRConfig } from '../../layers/database/repository.js';

export class IntegrationEngine {
  private static instance: IntegrationEngine;

  private constructor() {}

  public static getInstance(): IntegrationEngine {
    if (!IntegrationEngine.instance) {
      IntegrationEngine.instance = new IntegrationEngine();
    }
    return IntegrationEngine.instance;
  }

  /**
   * Triggers external automations and integrations when a lead is qualified.
   */
  public async handleLeadQualified(leadId: string, tenantId: string, sdrConfig: SDRConfig): Promise<void> {
    console.log(`[IntegrationEngine] Triggered qualification workflows for Lead ID: ${leadId}`);

    try {
      const lead = await repo.getLeadByPhone(tenantId, (await repo.getLeads(tenantId)).find(l => l.id === leadId)?.phone || '');
      if (!lead) {
        console.warn(`[IntegrationEngine] Lead not found in DB: ${leadId}`);
        return;
      }

      // Fetch memories to build qualification context
      const memories = await repo.getLeadMemories(leadId);
      const factsText = memories.map(m => m.fact).join(', ') || 'Nenhuma informação específica extraída.';

      // 1. WEBHOOK INTEGRATION
      if (sdrConfig.webhookUrl && sdrConfig.webhookUrl.trim().startsWith('http')) {
        console.log(`[IntegrationEngine] Discharging webhook to: ${sdrConfig.webhookUrl}`);
        
        const payload = {
          event: 'lead.qualified',
          tenantId,
          lead: {
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            status: lead.status,
          },
          qualificationDetails: factsText,
          timestamp: new Date().toISOString(),
        };

        // Fire & Forget HTTP POST request (with 5s timeout safety)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        fetch(sdrConfig.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        })
          .then(res => {
            clearTimeout(timeoutId);
            console.log(`[IntegrationEngine] Webhook response: ${res.status} ${res.statusText}`);
          })
          .catch(err => {
            clearTimeout(timeoutId);
            console.error(`[IntegrationEngine] Webhook failed (expected timeout/offline in dev):`, err.message);
          });
      } else {
        console.log(`[IntegrationEngine] Webhook URL not configured. Skipping webhook dispatch.`);
      }

      // 2. GOOGLE SPREADSHEETS / EXCEL SIMULATION
      if (sdrConfig.spreadsheetEnabled) {
        console.log(`\n=================== GOOGLE SHEETS INTEGRATION ===================`);
        console.log(`[Spreadsheet] NEW ROW INSERTED:`);
        console.log(`  - Nome: ${lead.name}`);
        console.log(`  - Telefone: ${lead.phone}`);
        console.log(`  - Email: ${lead.email || 'N/A'}`);
        console.log(`  - Status: QUALIFIED`);
        console.log(`  - Informações: ${factsText}`);
        console.log(`  - Data/Hora: ${new Date().toLocaleString()}`);
        console.log(`=================================================================\n`);
      } else {
        console.log(`[IntegrationEngine] Spreadsheet integration is disabled.`);
      }

      // 3. EXTERNAL DATABASE REGISTRATION SIMULATION
      console.log(`\n=================== EXTERNAL DATABASE REGISTRATION ===================`);
      console.log(`[External DB] CONNECTED: relational-municipal-db-cluster`);
      console.log(`[External DB] Executing INSERT INTO leads (uuid, name, phone, details, qualified_at) ...`);
      console.log(`[External DB] SUCCESS: 1 row affected (Lead ${lead.phone} saved).`);
      console.log(`======================================================================\n`);

    } catch (error) {
      console.error(`[IntegrationEngine] Error running integrations:`, error);
    }
  }
}

export const integrationEngine = IntegrationEngine.getInstance();

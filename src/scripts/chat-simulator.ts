import * as readline from 'readline';
import { dbService } from '../layers/database/db.js';
import { repo } from '../layers/database/repository.js';
import { conversationEngine } from '../engines/conversation/ConversationEngine.js';
import { aiOrchestrator } from '../core/orchestrator/AIOrchestrator.js';
import { humanizer } from '../layers/humanization/Humanizer.js';
import { learningEngine } from '../engines/learning/LearningEngine.js';
import { eventBus } from '../core/event-bus/EventBus.js';
import { EVENT_TYPES, ResponseReadyPayload } from '../core/event-bus/events.js';

// Register all listeners
const _engines = [conversationEngine, aiOrchestrator, humanizer];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function run() {
  console.clear();
  console.log('================================================================');
  console.log('🤖 SIMULADOR DE CHAT V2 - SDR COM APRENDIZADO CONTÍNUO 🤖');
  console.log('================================================================');
  console.log('Inicializando serviços e checando conexões...');

  // 1. Initialize Database
  await dbService.connect();
  const tenant = await repo.getFirstTenant();
  const sdrConfig = await repo.getSDRConfigByTenant(tenant.id);

  console.log(`[Config] Tenant: "${tenant.name}"`);
  console.log(`[Config] SDR Persona: "${sdrConfig?.personaName}" (${sdrConfig?.personaRole})`);
  console.log(`[Config] Fallback Mode AI: ${process.env.GEMINI_API_KEY ? 'OFF (Usando Gemini Real)' : 'ON (Usando Respostas Mapeadas)'}`);
  console.log('================================================================');
  console.log('💡 DICA DE SUPERVISÃO: Se o SDR responder algo indesejado, digite:');
  console.log('   /correct <feedback> (para corrigir e ensinar a conduta correta)');
  console.log('================================================================');

  // 2. Seed default playbook knowledge
  await repo.seedKnowledge(tenant.id, 'Playbook Comercial Imobiliária Prime', [
    'O condomínio Vila Nova possui apartamentos de 2 e 3 dormitórios com suíte e varanda gourmet integrada.',
    'A área de lazer do condomínio conta com piscina adulto com raia, piscina infantil, brinquedoteca, salão de festas decorado, academia completa, quadra poliesportiva e portaria presencial 24h.',
    'O preço das unidades de 2 dormitórios começa em R$ 450.000,00 e o fluxo de pagamento é composto de 10% de entrada, mensais de R$ 2.500,00 durante as obras, e o restante via financiamento bancário.',
    'As visitas ao decorado ocorrem de segunda a domingo, das 9h às 18h. O endereço é Avenida Paulista, 1000, São Paulo.',
    'O prazo de entrega da obra está previsto para Dezembro de 2027.'
  ]);

  const phone = '5511999999999';
  const leadName = 'Carlos Silva';

  // Keep track of the last exchange for correction context
  let lastLeadMessage = '';
  let lastSdrResponse = '';
  let activeLeadId = '';

  // Get or create lead to fetch active ID
  let lead = await repo.getLeadByPhone(tenant.id, phone);
  if (!lead && sdrConfig) {
    lead = await repo.createLead({
      tenantId: tenant.id,
      sdrConfigId: sdrConfig.id,
      phone,
      name: leadName,
    });
  }
  activeLeadId = lead?.id || '';

  // 3. Listen to EventBus for visual trace
  eventBus.subscribe('*', (event) => {
    console.log(`\n\x1b[90m[EVENT] ${event.type} -> Disparado para Tenant: ${event.tenantId}\x1b[0m`);
  });

  // Listen to final formatted response ready
  eventBus.subscribe<ResponseReadyPayload>(EVENT_TYPES.RESPONSE_READY, async (event) => {
    const payload = event.payload;
    lastSdrResponse = payload.formattedContent;
    
    // Fetch updated lead state (memories, objective, strategy) to show in the output block
    const updatedLead = await repo.getLeadByPhone(tenant.id, phone);
    let stateText = '';
    let memoriesText = '';
    if (updatedLead) {
      const state = await repo.getLeadStrategyState(updatedLead.id);
      if (state) {
        stateText = `\n   \x1b[36mObjetivo Atual:\x1b[0m "${state.currentObjective}"\n   \x1b[36mEstratégia Atual:\x1b[0m "${state.currentStrategy}"`;
      }
      const memories = await repo.getLeadMemories(updatedLead.id);
      if (memories.length > 0) {
        memoriesText = `\n   \x1b[33mMemórias (Fatos extraídos):\x1b[0m\n` + memories.map(m => `     - ${m.fact}`).join('\n');
      }
    }

    console.log(`\n\x1b[32m🤖 SDR (${sdrConfig?.personaName}):\x1b[0m ${payload.formattedContent}`);
    console.log(`\x1b[90m--------------------------------------------------------------${stateText}${memoriesText}\n--------------------------------------------------------------\x1b[0m`);
    
    // Prompt next message
    promptMessage();
  });

  // Start chat loop
  console.log(`\nEscreva sua mensagem abaixo para iniciar a conversa com o SDR.`);
  promptMessage();

  function promptMessage() {
    rl.question('\n\x1b[1mVocê (Lead / Coach):\x1b[0m ', async (answer) => {
      const input = answer.trim();

      if (input.toLowerCase() === 'sair') {
        console.log('Encerrando simulador...');
        rl.close();
        await dbService.disconnect();
        process.exit(0);
      }
      
      if (input.length === 0) {
        promptMessage();
        return;
      }

      // Check if command is a correction
      if (input.startsWith('/correct ')) {
        const feedbackText = input.substring(9).trim();
        
        if (!lastLeadMessage || !lastSdrResponse) {
          console.log('\x1b[31m[Erro] Não há histórico recente de mensagens nesta sessão para aplicar uma correção comercial.\x1b[0m');
          promptMessage();
          return;
        }

        console.log(`\n\x1b[33m📝 REGISTRANDO CORREÇÃO DO SUPERVISOR:\x1b[0m`);
        console.log(`- Contexto (Última pergunta do Lead): "${lastLeadMessage}"`);
        console.log(`- Resposta Gerada (Errada): "${lastSdrResponse}"`);
        console.log(`- Feedback do Supervisor: "${feedbackText}"`);

        rl.question('\n\x1b[33mDigite a RESPOSTA CORRETA esperada:\x1b[0m ', async (correctedResponse) => {
          if (correctedResponse.trim().length === 0) {
            console.log('\x1b[31m[Erro] Resposta correta não pode ser vazia. Cancelando correção.\x1b[0m');
            promptMessage();
            return;
          }

          // Register correction in LearningEngine
          await learningEngine.learnFromCorrection({
            tenantId: tenant.id,
            leadId: activeLeadId,
            errorContext: lastLeadMessage,
            originalResponse: lastSdrResponse,
            correctedResponse: correctedResponse.trim(),
            feedbackText,
          });

          console.log('\n\x1b[32m✔ [LearningEngine] Correção registrada! O SDR aprendeu com este feedback e o aplicará no futuro.\x1b[0m');
          
          promptMessage();
        });
        return;
      }

      // Normal message path
      lastLeadMessage = input;
      conversationEngine.handleInboundMessage(tenant.id, phone, input, leadName);
    });
  }
}

run().catch(console.error);

import { dbService } from '../layers/database/db.js';
import { repo } from '../layers/database/repository.js';
import { eventBus } from '../core/event-bus/EventBus.js';
import { EVENT_TYPES, ResponseReadyPayload } from '../core/event-bus/events.js';
import { conversationEngine } from '../engines/conversation/ConversationEngine.js';
import { aiOrchestrator } from '../core/orchestrator/AIOrchestrator.js';
import { humanizer } from '../layers/humanization/Humanizer.js';
import { outboundConnector } from '../core/whatsapp/OutboundConnector.js';
import { analyticsEngine } from '../engines/analytics/AnalyticsEngine.js';

// Ensure all engines and services are loaded to register their event listeners
const _engines = [conversationEngine, aiOrchestrator, humanizer, outboundConnector, analyticsEngine];

// Setup basic delays
async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔄 Iniciando teste integrado de Multi-Tenancy...');

  // 1. Conectar ao banco
  await dbService.connect();

  const tenantImovelId = 'tenant-imoveis-uuid';
  const tenantCarroId = 'tenant-carros-uuid';

  // Limpar dados anteriores de teste
  try {
    if (dbService.getIsConnected()) {
      await dbService.prisma.tenant.deleteMany({
        where: { id: { in: [tenantImovelId, tenantCarroId] } }
      });
      console.log('🧹 Dados antigos de teste limpos do banco PostgreSQL.');
    }
  } catch (e) {
    console.log('ℹ️ Sem dados anteriores para limpar.');
  }

  // 2. Criar Tenant A (Imobiliária)
  console.log('\n🏢 Criando Tenant A: Imobiliária...');
  const tenantImovel = await repo.createTenant('Imobiliária Premium', tenantImovelId);
  
  console.log('🤖 Configurando SDR para Tenant A...');
  await repo.upsertSDRConfig({
    tenantId: tenantImovel.id,
    name: 'Lucas - Corretor Prime',
    personaName: 'Lucas',
    personaRole: 'Consultor Imobiliário',
    personality: 'Formal, atencioso, focado em explicar detalhes sobre o condomínio Vila Nova.',
    baseInstructions: 'Você vende apartamentos do condomínio Vila Nova. Tire dúvidas sobre preço (R$ 450.000) e marque visitas.',
    instanceName: 'instance-imovel',
    qualificationFlow: 'Perguntar o nome do lead e o interesse básico.',
    postQualificationAction: 'Agradecer o interesse e finalizar o contato.',
    webhookUrl: 'https://httpbin.org/post', // Servidor de eco público real para webhooks
    spreadsheetEnabled: true,
  });

  console.log('📖 Cadastrando Playbook de Imóveis para Tenant A...');
  await repo.seedKnowledge(tenantImovel.id, 'Playbook Vila Nova', [
    'O condomínio Vila Nova tem apartamentos modernos de 2 dormitórios com varanda gourmet.',
    'O valor de partida é R$ 450.000,00 com entrada parcelada.',
    'A entrega das chaves está prevista para Dezembro de 2027.',
    'A área de lazer inclui piscina, churrasqueira, salão de festas e academia.'
  ]);

  // 3. Criar Tenant B (Concessionária de Carros)
  console.log('\n🚗 Criando Tenant B: Concessionária Speed Motors...');
  const tenantCarro = await repo.createTenant('Speed Motors', tenantCarroId);

  console.log('🤖 Configurando SDR para Tenant B...');
  await repo.upsertSDRConfig({
    tenantId: tenantCarro.id,
    name: 'Ana - Especialista Speed',
    personaName: 'Ana',
    personaRole: 'Consultora de Vendas de Automóveis',
    personality: 'Energética, entusiasta de motores, ágil e focada em fechamento de vendas.',
    baseInstructions: 'Você vende a nova SUV Ranger 2026. Fale sobre a potência do motor e ofereça planos de financiamento com taxa zero.',
    instanceName: 'instance-carro'
  });

  console.log('🎬 Cadastrando Mídia de Vídeo para Tenant B...');
  await repo.createMediaAsset({
    tenantId: tenantCarro.id,
    triggerValue: 'ranger_video',
    mediaType: 'video',
    mediaUrl: 'https://d157m13w3o5eey.cloudfront.net/ranger-review-2026.mp4',
    caption: 'Confira a nova SUV Ranger 2026 acelerando na pista de testes!'
  });

  console.log('📖 Cadastrando Playbook de Automóveis para Tenant B...');
  await repo.seedKnowledge(tenantCarro.id, 'Playbook SUV Ranger', [
    'A nova SUV Ranger 2026 possui motor Turbo Diesel V6 de alta performance.',
    'O preço promocional de lançamento é R$ 280.000,00.',
    'Oferecemos planos de financiamento em até 24 vezes com taxa zero de juros.',
    'Temos unidades a pronta entrega nas cores preta, prata e azul metálico.'
  ]);

  // 4. Capturar respostas de saída no EventBus
  const capturedResponses: { tenantId: string; phone: string; content: string }[] = [];
  eventBus.subscribe<ResponseReadyPayload>(EVENT_TYPES.RESPONSE_READY, async (event) => {
    capturedResponses.push({
      tenantId: event.tenantId,
      phone: event.payload.phone,
      content: event.payload.formattedContent
    });
    console.log(`\n📥 [EventBus CAPTURED] Resposta enviada para o Tenant [${event.tenantId}]:`);
    console.log(`   💬 "${event.payload.formattedContent.replace(/\n/g, ' ')}"`);
  });

  // 5. Simular conversas simultâneas em canais diferentes (rodando em paralelo)
  console.log('\n💬 Simulando entrada de lead no canal de Imóveis (Tenant A)...');
  conversationEngine.handleInboundMessage(
    tenantImovel.id,
    '5511999991111',
    'Olá! Qual o valor do apartamento e o prazo de entrega das chaves?',
    'Rodrigo Imóveis'
  );

  console.log('\n💬 Simulando entrada de lead no canal de Carros (Tenant B)...');
  conversationEngine.handleInboundMessage(
    tenantCarro.id,
    '5511999992222',
    'Olá, queria saber mais sobre a Ranger. Quanto custa e tem taxa zero?',
    'Carlos Auto'
  );

  // Aguarda dinamicamente o processamento das duas respostas com timeout de 60 segundos
  console.log('\n⏳ Aguardando processamento das respostas dos SDRs (limite de 60 segundos)...');
  let seconds = 0;
  const timeout = 60;
  while (capturedResponses.length < 2 && seconds < timeout) {
    await delay(1000);
    seconds++;
  }

  console.log(`\n⏱️ Tempo total decorrido: ${seconds} segundos.`);

  // 6. Validar os resultados e o isolamento semântico
  console.log('\n📊 Validando Resultados de Resposta...');
  console.log('---------------------------------------------------------');
  
  const imovelResponse = capturedResponses.find(r => r.tenantId === tenantImovelId);
  const carroResponse = capturedResponses.find(r => r.tenantId === tenantCarroId);

  let passed = true;

  if (imovelResponse) {
    const text = imovelResponse.content.toLowerCase();
    const hasImovelKeywords = text.includes('450') || text.includes('vila nova') || text.includes('2027') || text.includes('apartamento') || text.includes('imóvel') || text.includes('entrega');
    const hasCarKeywords = text.includes('ranger') || text.includes('diesel') || text.includes('v6') || text.includes('280');

    console.log(`Tenant A (Lucas): ${hasImovelKeywords ? '✅ Respondeu sobre Imóveis' : '❌ Falhou em responder sobre Imóveis'}`);
    console.log(`Tenant A (Lucas) Isolamento: ${!hasCarKeywords ? '✅ Não vazou dados de Carros' : '❌ Vazou dados de Carros!'}`);
    
    if (!hasImovelKeywords || hasCarKeywords) passed = false;
  } else {
    console.log('❌ Nenhuma resposta capturada para o Tenant A (Imóveis)');
    passed = false;
  }

  if (carroResponse) {
    const text = carroResponse.content.toLowerCase();
    const hasCarKeywords = text.includes('280') || text.includes('ranger') || text.includes('diesel') || text.includes('taxa');
    const hasImovelKeywords = text.includes('450') || text.includes('vila nova') || text.includes('2027');

    console.log(`Tenant B (Ana): ${hasCarKeywords ? '✅ Respondeu sobre Carros' : '❌ Falhou em responder sobre Carros'}`);
    console.log(`Tenant B (Ana) Isolamento: ${!hasImovelKeywords ? '✅ Não vazou dados de Imóveis' : '❌ Vazou dados de Imóveis!'}`);
    
    if (!hasCarKeywords || hasImovelKeywords) passed = false;
  } else {
    console.log('❌ Nenhuma resposta capturada para o Tenant B (Carros)');
    passed = false;
  }

  // 7. Validar isolamento analítico
  console.log('\n📊 Validando Isolamento no Analytics...');
  const analyticsA = await analyticsEngine.getDashboard(tenantImovelId);
  const analyticsB = await analyticsEngine.getDashboard(tenantCarroId);

  console.log(`Tenant A Analytics: ${analyticsA.overview.totalInteractions > 0 ? '✅ Eventos registrados' : '❌ Sem eventos'}`);
  console.log(`Tenant B Analytics: ${analyticsB.overview.totalInteractions > 0 ? '✅ Eventos registrados' : '❌ Sem eventos'}`);

  if (analyticsA.overview.totalInteractions === 0 || analyticsB.overview.totalInteractions === 0) {
    passed = false;
  }

  console.log('---------------------------------------------------------');
  if (passed) {
    console.log('🎉 SUCESSO: A camada de Multi-Tenancy está 100% isolada e funcional!');
  } else {
    console.error('❌ ERRO: Falha na validação do isolamento Multi-Tenant.');
  }

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ Erro fatal no script de teste:', err);
  process.exit(1);
});

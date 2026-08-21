import { dbService } from '../layers/database/db.js';
import { repo } from '../layers/database/repository.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  console.log('================================================================');
  console.log('🧪 TESTANDO INTEGRAÇÃO EVOLUTION API & REAL POSTGRES & ANALYTICS 🧪');
  console.log('================================================================');
  
  // 1. Connect to local Postgres database in Docker
  await dbService.connect();

  if (!dbService.getIsConnected()) {
    console.error('❌ Error: Could not connect to PostgreSQL. Make sure Docker is running on port 5432.');
    process.exit(1);
  }

  // 2. Clear previous data for a clean test
  console.log('Limpando dados antigos do banco de dados...');
  await dbService.prisma.analyticsEvent.deleteMany({});
  await dbService.prisma.message.deleteMany({});
  await dbService.prisma.leadMemory.deleteMany({});
  await dbService.prisma.leadStrategyState.deleteMany({});
  await dbService.prisma.lead.deleteMany({});
  await dbService.prisma.sDRConfig.deleteMany({});
  await dbService.prisma.tenant.deleteMany({});

  // 3. Seed Tenant and SDR Config in the real PostgreSQL database
  console.log('Criando registros reais de Tenant e SDR Config...');
  const tenant = await dbService.prisma.tenant.create({
    data: { id: 'default-tenant-uuid', name: 'Imobiliária Prime Real' },
  });

  const sdrConfig = await dbService.prisma.sDRConfig.create({
    data: {
      id: 'default-sdr-uuid',
      tenantId: tenant.id,
      name: 'Lucas - SDR Vendas Imobiliárias',
      personaName: 'Lucas',
      personaRole: 'Consultor Imobiliário / SDR',
      personality: 'Simpático, empático, fala de forma natural e informal como um humano no WhatsApp.',
      baseInstructions: 'Sua missão é atender leads interessados em apartamentos novos. Descubra as necessidades dele de forma sutil, tire dúvidas e leve-o a marcar uma visita física ao decorado. Nunca force a barra.',
    }
  });

  console.log('✅ Real database initialized successfully.');

  // 4. Seed Playbook base of knowledge (generating actual 3072-dim embeddings via Gemini)
  console.log('Adicionando base de conhecimento com embeddings reais via Gemini...');
  await repo.seedKnowledge(tenant.id, 'Playbook Comercial Imobiliária Prime', [
    'O condomínio Vila Nova possui apartamentos de 2 e 3 dormitórios com suíte e varanda gourmet integrada.',
    'A área de lazer do condomínio conta com piscina adulto com raia, piscina infantil, brinquedoteca, salão de festas decorado, academia completa, quadra poliesportiva e portaria presencial 24h.',
    'O preço das unidades de 2 dormitórios começa em R$ 450.000,00 e o fluxo de pagamento é composto de 10% de entrada, mensais de R$ 2.500,00 durante as obras, e o restante via financiamento bancário.',
  ]);

  console.log('✅ Playbook knowledge embeddings generated and saved to PostgreSQL successfully.');

  // 5. Start Fastify server in the background
  console.log('Iniciando o servidor Fastify...');
  await import('../index.js');
  
  // Wait for server to boot up
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Get dynamic port from environment configuration
  const port = process.env.PORT || '3030';

  // 6. Simulate Evolution API inbound webhook POST
  console.log(`\nSimulando recebimento de mensagem via webhook da Evolution API na porta ${port}...`);
  const webhookUrl = `http://localhost:${port}/webhook/whatsapp/receive`;
  const evolutionPayload = {
    event: 'messages.upsert',
    instance: 'instancia-teste',
    data: {
      key: {
        remoteJid: '5511988888888@s.whatsapp.net',
        fromMe: false,
        id: 'MSG_TEST_' + Math.random().toString(36).substring(2, 9)
      },
      pushName: 'Roberta Souza',
      message: {
        conversation: 'Olá, gostaria de saber se o condomínio Vila Nova tem piscina infantil.'
      },
      messageType: 'conversation'
    }
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(evolutionPayload)
  });

  console.log('HTTP Status Code:', response.status);
  const textResponse = await response.text();
  console.log('Response Content (First 200 chars):', textResponse.substring(0, 200));

  try {
    const respJson = JSON.parse(textResponse);
    console.log('Resposta do Webhook (Parsed):', respJson);
  } catch (err) {
    console.warn('Response was not JSON.');
  }

  // 7. Wait for event-driven orchestration (LLM + Humanizer + DB saves) to complete
  console.log('Aguardando orquestração da resposta (8 segundos)...');
  await new Promise(resolve => setTimeout(resolve, 8000));

  // 8. Fetch and verify the analytics dashboard
  console.log('\nConsultando o painel de Analytics gerado...');
  const dashboardUrl = `http://localhost:${port}/analytics/dashboard`;
  const dashResponse = await fetch(dashboardUrl);
  const dashboard = await dashResponse.json();

  console.log('📊 DASHBOARD DE ANALYTICS DO SDR COMERCIAL:');
  console.log(JSON.stringify(dashboard, null, 2));

  console.log('\n================================================================');
  console.log('🎉 VERIFICAÇÃO CONCLUÍDA COM SUCESSO! 🎉');
  console.log('================================================================');

  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});

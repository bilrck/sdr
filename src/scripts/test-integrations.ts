import { repo } from '../layers/database/repository.js';
import { dbService } from '../layers/database/db.js';
import { integrationEngine } from '../engines/integration/IntegrationEngine.js';
import { outboundConnector } from '../core/whatsapp/OutboundConnector.js';

async function main() {
  console.log('🧪 Iniciando Teste de Integrações Externas e Mídias...');

  await dbService.connect();

  const testTenantId = 'integration-test-tenant';
  const testLeadId = 'integration-test-lead';

  // 1. Limpar dados anteriores
  try {
    if (dbService.getIsConnected()) {
      await dbService.prisma.tenant.deleteMany({
        where: { id: testTenantId }
      });
      console.log('🧹 Dados de teste anteriores limpos.');
    }
  } catch {}

  // 2. Criar Tenant e SDRConfig
  console.log('\n🏢 Criando Tenant de Teste...');
  const tenant = await repo.createTenant('Clínica Municipal Teste', testTenantId);

  console.log('🤖 Configurando SDR com Webhook e Planilha Ativados...');
  const sdrConfig = await repo.upsertSDRConfig({
    tenantId: tenant.id,
    name: 'Atendente Virtual',
    personaName: 'Ana',
    personaRole: 'Recepcionista',
    personality: 'Prestativa',
    baseInstructions: 'Qualificar leads para a policlínica.',
    instanceName: 'test-instance',
    qualificationFlow: 'Perguntar nome, CPF e sintomas primários.',
    postQualificationAction: 'Agendar triagem clínica na unidade.',
    webhookUrl: 'https://httpbin.org/post', // URL pública de teste
    spreadsheetEnabled: true
  });

  // 3. Criar Lead de Teste
  console.log('👥 Criando Lead de Teste...');
  const lead = await repo.createLead({
    tenantId: tenant.id,
    sdrConfigId: sdrConfig.id,
    phone: '5511988887777',
    name: 'Carlos Alberto',
    email: 'carlos@governo.gov.br'
  });

  // Alterar ID do lead para bater com o fixo de teste se necessário, ou usar o gerado
  const leadId = lead.id;

  // Adicionar algumas memórias de qualificação
  console.log('💾 Adicionando memórias de qualificação extraídas...');
  await repo.addLeadMemory(leadId, 'Sente fortes dores de cabeça constantes há 3 dias', 0.95);
  await repo.addLeadMemory(leadId, 'CPF: 123.456.789-00', 0.99);
  await repo.addLeadMemory(leadId, 'Busca atendimento clínico geral na Policlínica Sul', 0.90);

  // 4. Testar Disparo do IntegrationEngine
  console.log('\n🚀 Forçando Qualificação do Lead e acionando IntegrationEngine...');
  // Atualiza status para QUALIFIED
  await repo.updateLeadStatus(leadId, 'QUALIFIED');
  
  // Executa o handler de integração diretamente
  await integrationEngine.handleLeadQualified(leadId, tenant.id, sdrConfig);

  // 5. Testar OutboundConnector com tag de mídia
  console.log('\n🎬 Testando processamento de tag de mídia [SEND_MEDIA] no OutboundConnector...');
  
  // Cadastrar mídia
  await repo.createMediaAsset({
    tenantId: tenant.id,
    triggerValue: 'mapa_policlinica',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1527689368864-3a821dbccc34',
    caption: 'Mapa de localização da Policlínica Central Sul.'
  });

  // Simular envio de mensagem contendo tag de mídia
  const payload = {
    leadId,
    phone: lead.phone,
    formattedContent: 'Olá Carlos! Confirmamos o seu agendamento de triagem. Para facilitar, segue o mapa do local:\n\n[SEND_MEDIA: mapa_policlinica]\n\nQualquer dúvida é só nos chamar!'
  };

  // Forçamos temporariamente as variáveis de API a nulo para rodar o conector em modo MOCK e exibir os prints
  const originalUrl = process.env.EVOLUTION_API_URL;
  delete process.env.EVOLUTION_API_URL;

  console.log('📥 Disparando mensagem de resposta com tag...');
  await outboundConnector.sendMessage(tenant.id, payload);

  // Restaurar URL
  process.env.EVOLUTION_API_URL = originalUrl;

  console.log('\n🎉 TESTE DE INTEGRAÇÃO CONCLUÍDO COM SUCESSO!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Erro no script de teste:', err);
  process.exit(1);
});

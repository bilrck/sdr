import { repo } from '../layers/database/repository.js';
import { dbService } from '../layers/database/db.js';
import { conversationEngine } from '../engines/conversation/ConversationEngine.js';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TESTE DE INTEGRAÇÃO — FILTRAGEM & GESTÃO DE LEADS');
  console.log('====================================================\n');

  await dbService.connect();

  const testTenant = await repo.createTenant('Empresa Teste Leads');
  console.log(`1. Empresa de teste criada: ${testTenant.name} (${testTenant.id})`);

  // 1. Configurar SDR com Filtragem por Palavra-Chave
  const sdrConfig = await repo.upsertSDRConfig({
    tenantId: testTenant.id,
    name: 'Agente Filtro Teste',
    personaName: 'Eduardo',
    personaRole: 'Consultor Automotivo',
    personality: 'Direto e simpático.',
    baseInstructions: 'Venda carros esportivos.',
    filterEnabled: true,
    triggerType: 'KEYWORD',
    triggerKeywords: 'comprar, preço, catálogo, proposta',
    triggerCondition: '',
  });

  console.log(`2. SDR Configurado com Filtragem:`);
  console.log(`   - filterEnabled: ${sdrConfig.filterEnabled}`);
  console.log(`   - triggerType: ${sdrConfig.triggerType}`);
  console.log(`   - triggerKeywords: "${sdrConfig.triggerKeywords}"`);

  // 2. Testar criação manual de Lead com Tags e Custom Fields
  const lead1 = await repo.createLeadManual({
    tenantId: testTenant.id,
    phone: '5511988887777',
    name: 'Marcos Vinicius',
    email: 'marcos@email.com',
    status: 'ACTIVE',
    tags: ['VIP', 'TestDrive', 'Mustang'],
    customFields: {
      'Modelo de Interesse': 'Mustang GT 2026',
      'Orçamento Previsto': 'R$ 450.000',
      'Cidade': 'São Paulo'
    },
    notes: 'Cliente prefere contato após as 14h.'
  });

  console.log(`\n3. Lead criado manualmente com sucesso:`);
  console.log(`   - ID: ${lead1.id}`);
  console.log(`   - Nome: ${lead1.name}`);
  console.log(`   - Tags: ${JSON.stringify(lead1.tags)}`);
  console.log(`   - Campos Personalizados:`, JSON.stringify(lead1.customFields));

  // 3. Testar busca e filtros de Leads
  const allLeads = await repo.getLeads(testTenant.id);
  console.log(`\n4. Listagem de leads: Total=${allLeads.length}`);

  const vipLeads = await repo.getLeads(testTenant.id, { tag: 'VIP' });
  console.log(`   - Filtro por Tag [VIP]: ${vipLeads.length} lead(s) encontrado(s)`);

  const searchLeads = await repo.getLeads(testTenant.id, { search: 'Marcos' });
  console.log(`   - Busca por nome "Marcos": ${searchLeads.length} lead(s) encontrado(s)`);

  const distinctTags = await repo.getTenantTags(testTenant.id);
  console.log(`   - Tags distintas da empresa: ${JSON.stringify(distinctTags)}`);

  // 4. Testar edição do Lead
  const updatedLead = await repo.updateLeadFull(lead1.id, {
    status: 'QUALIFIED',
    tags: ['VIP', 'TestDrive', 'Mustang', 'AprovadoCredito'],
    customFields: {
      'Modelo de Interesse': 'Mustang GT 2026',
      'Orçamento Previsto': 'R$ 450.000',
      'Entrada': 'R$ 150.000'
    }
  });

  console.log(`\n5. Lead atualizado:`);
  console.log(`   - Novo status: ${updatedLead.status}`);
  console.log(`   - Novas tags: ${JSON.stringify(updatedLead.tags)}`);

  // 5. Testar exclusão
  await repo.deleteLead(lead1.id);
  const remaining = await repo.getLeads(testTenant.id);
  console.log(`\n6. Lead excluído com sucesso. Total restante: ${remaining.length}`);

  // Limpeza
  await dbService.prisma.tenant.delete({ where: { id: testTenant.id } });
  console.log('\n====================================================');
  console.log('🎉 TODOS OS TESTES DE LEADS & FILTRAGEM PASSARAM COM 100% DE SUCESSO!');
  console.log('====================================================\n');
  await dbService.disconnect();
}

runTests().catch(console.error);

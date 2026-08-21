import 'dotenv/config';
import { dbService } from '../layers/database/db.js';
import bcryptjs from 'bcryptjs';

async function resetDatabase() {
  console.log('[ResetDB] Connecting to database...');
  await dbService.connect();

  const prisma = dbService.prisma;

  console.log('[ResetDB] Seeding clean initial state...');

  // Create initial clean Admin User
  const passwordHash = await bcryptjs.hash('admin123', 10);
  const adminUser = await prisma.user.create({
    data: {
      name: 'Administrador',
      email: 'admin@sdr.com',
      passwordHash,
      role: 'ADMIN',
      plan: 'enterprise',
      maxTenants: 10,
      maxAgentsPerTenant: 5,
      status: 'ACTIVE',
    },
  });

  // Create initial default Tenant
  const initialTenant = await prisma.tenant.create({
    data: {
      name: 'Empresa Principal',
      ownerId: adminUser.id,
    },
  });

  // Create clean initial SDR Config for tenant
  await prisma.sDRConfig.create({
    data: {
      tenantId: initialTenant.id,
      name: 'Agente Comercial IA',
      personaName: 'Ana',
      personaRole: 'Consultora de Vendas',
      personality: 'Humana, atenciosa e focada em entender as necessidades do cliente.',
      baseInstructions: 'Apresente os produtos e serviços da empresa com clareza, tire dúvidas e conduza o cliente para o próximo passo comercial.',
      instanceName: `tenant-${initialTenant.id}`,
      maxWords: 40,
      splitMessages: true,
      maxBubbles: 3,
      qualificationFlow: '1. Descobrir qual o interesse ou problema principal\n2. Entender o orçamento ou prazo estimado\n3. Obter nome e melhor horário para contato',
      postQualificationAction: 'Transferir para um consultor humano e salvar no CRM.',
      sdrMode: 'ADVANCED',
      funnelObjectives: '1. Acolher o lead com simpatia, descobrir seu nome e interesse principal\n2. Entender a necessidade, objetivo ou problema que o lead deseja resolver\n3. Descobrir orçamento disponível, capacidade de investimento ou preferências\n4. Apresentar os diferenciais da solução e remover eventuais objeções\n5. Convidar para o próximo passo comercial (visita, demonstração, proposta ou ligação)\n6. Finalizar o contato com cortesia e enviar informações complementares',
      salesStrategies: 'Rapport inicial (empatia, quebrar o gelo, acolhimento cordial)\nExploração sutil de dores (compreender necessidades e desafios do lead)\nProposição de valor (apresentar benefícios e diferenciais da solução)\nEducação do Lead (esclarecer dúvidas técnicas, planos, condições e prazos)\nContorno de Objeções (endereçar inseguranças, comparar opções e dar segurança)\nUrgência e Oportunidade (destacar condições por tempo limitado ou disponibilidade)\nChamada para Ação / CTA (propor o próximo passo: agendamento, ligação ou proposta)',
    }
  });

  console.log(`[ResetDB] Database successfully reset!`);
  console.log(`[ResetDB] Admin Email: admin@sdr.com (Password: admin123)`);
  console.log(`[ResetDB] Initial Tenant: "${initialTenant.name}" (${initialTenant.id})`);

  await dbService.disconnect();
}

resetDatabase().catch((err) => {
  console.error('[ResetDB] Error resetting database:', err);
  process.exit(1);
});

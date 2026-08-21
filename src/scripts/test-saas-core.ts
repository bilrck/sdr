import { repo } from '../layers/database/repository.js';
import { authService } from '../core/auth/AuthService.js';

async function runTests() {
  console.log('====================================================');
  console.log('🚀 TESTE DE INTEGRAÇÃO SAAS CORE — FASES 1 A 4');
  console.log('====================================================\n');

  // 1. Test Password Hash & JWT
  console.log('1. Testando AuthService...');
  const passwordHash = await authService.hashPassword('admin123456');
  const valid = await authService.comparePassword('admin123456', passwordHash);
  if (!valid) throw new Error('Falha no hash/compare de senha');
  
  const token = authService.generateToken('test-user-id', 'admin@saas.com', 'Admin Master');
  const decoded = authService.verifyToken(token);
  if (!decoded || decoded.email !== 'admin@saas.com') throw new Error('Falha no JWT verifyToken');
  console.log('   ✅ AuthService (hash, compare, generateToken, verifyToken) 100% OK!');

  // 2. Test User Creation & Workspace
  console.log('\n2. Testando criação de usuário e workspace isolado...');
  const adminUser = await repo.createUserAdmin({
    email: 'admin@saas.com',
    name: 'Admin Master',
    passwordHash,
    role: 'ADMIN',
    plan: 'enterprise',
    maxTenants: 5,
    maxAgentsPerTenant: 3,
    status: 'ACTIVE'
  });
  console.log(`   ✅ Usuário Admin criado com sucesso: ${adminUser.name} (${adminUser.role})`);

  const primaryTenant = await repo.createTenantForUser('Empresa Alpha Tech', adminUser.id);
  console.log(`   ✅ Workspace isolado criado: ${primaryTenant.name} (ID: ${primaryTenant.id})`);

  // 3. Test Limits and Counts
  console.log('\n3. Testando contagem e limites...');
  const tenantsCount = await repo.countTenantsByUser(adminUser.id);
  const agentsCount = await repo.countAgentsByUser(adminUser.id);
  console.log(`   📊 Workspaces utilizados: ${tenantsCount}/${adminUser.maxTenants}`);
  console.log(`   📊 Agentes SDR utilizados: ${agentsCount}/${adminUser.maxAgentsPerTenant}`);
  if (tenantsCount !== 1) throw new Error(`Esperado 1 tenant, recebido ${tenantsCount}`);

  // 4. Test SDR Config Isolation (No "Lucas" hardcoded)
  console.log('\n4. Verificando isolamento de Agente SDR (sem contaminação)...');
  const initialSDR = await repo.getSDRConfigByTenant(primaryTenant.id);
  if (initialSDR !== null) {
    throw new Error('ERRO: SDR Config deveria ser null para nova empresa, mas retornou dados hardcoded!');
  }
  console.log('   ✅ Nova empresa inicia SEM SDR config hardcoded (Estado limpo garantido!)');

  // Configure first agent
  const createdSDR = await repo.upsertSDRConfig({
    tenantId: primaryTenant.id,
    name: 'Ana - Consultora Veículos',
    personaName: 'Ana',
    personaRole: 'Especialista Comercial Ford',
    personality: 'Simpática e objetiva',
    baseInstructions: 'Venda de SUV Ranger 2026',
    maxWords: 40,
    splitMessages: true,
    maxBubbles: 3,
    qualificationFlow: 'Interesse, cor e entrada',
    postQualificationAction: 'Agendar test-drive',
    webhookUrl: '',
    spreadsheetEnabled: false,
  });
  console.log(`   ✅ Agente SDR customizado criado com sucesso: "${createdSDR.name}" (${createdSDR.personaName})`);

  const agentsCountAfter = await repo.countAgentsByUser(adminUser.id);
  if (agentsCountAfter !== 1) throw new Error(`Esperado 1 agente, recebido ${agentsCountAfter}`);
  console.log(`   📊 Agentes SDR atualizados: ${agentsCountAfter}/${adminUser.maxAgentsPerTenant}`);

  // 5. Test Admin User Management
  console.log('\n5. Testando Painel Administrativo...');
  const clientUser = await repo.createUserAdmin({
    email: 'cliente@loja.com',
    name: 'Carlos Cliente',
    passwordHash,
    role: 'USER',
    plan: 'free',
    maxTenants: 1,
    maxAgentsPerTenant: 1,
    status: 'ACTIVE'
  });
  console.log(`   ✅ Cliente criado: ${clientUser.name} (Role: ${clientUser.role}, Status: ${clientUser.status})`);

  // List all users
  const allUsers = await repo.getAllUsers();
  console.log(`   📋 Total de usuários no sistema: ${allUsers.length}`);
  if (allUsers.length < 2) throw new Error('Esperado pelo menos 2 usuários na lista');

  // Update user inline
  const updatedUser = await repo.updateUserAdmin(clientUser.id, {
    plan: 'pro',
    maxTenants: 3,
    maxAgentsPerTenant: 2,
    status: 'SUSPENDED'
  });
  console.log(`   ✅ Usuário atualizado pelo Admin: Plano=${updatedUser.plan}, MaxTenants=${updatedUser.maxTenants}, Status=${updatedUser.status}`);
  if (updatedUser.plan !== 'pro' || updatedUser.status !== 'SUSPENDED') {
    throw new Error('Falha ao atualizar dados do usuário pelo Admin');
  }

  // Delete user
  await repo.deleteUser(clientUser.id);
  const allUsersAfterDelete = await repo.getAllUsers();
  console.log(`   ✅ Usuário excluído pelo Admin. Total restante: ${allUsersAfterDelete.length}`);

  console.log('\n====================================================');
  console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('❌ ERRO NO TESTE:', err);
  process.exit(1);
});

/* ============================================================
   SDR Inteligente — SaaS Frontend v2.0
   Auth + SPA Router + All Existing Features
   ============================================================ */

'use strict';

// ─── CORE DOM & STRING UTILITIES ──────────────────────────────
function id(str) { return document.getElementById(str); }
function el(str) { return document.getElementById(str); }
function setText(elId, val) {
  const elem = id(elId);
  if (elem) elem.textContent = val != null ? val : '';
}
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
const escHtml = escapeHtml;

function escAttr(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

// ─── THEME SWITCHER (Light, Dark, System) ─────────────────────
function initAppTheme() {
  const savedTheme = localStorage.getItem('sdr_theme') || 'dark';
  setAppTheme(savedTheme, false);
}

function setAppTheme(theme, save = true) {
  if (save) localStorage.setItem('sdr_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);

  const icon = id('theme-icon');
  const label = id('theme-label');
  if (icon && label) {
    if (theme === 'light') {
      icon.className = 'fa-solid fa-sun';
      icon.style.color = '#f59e0b';
      label.textContent = 'Claro';
    } else if (theme === 'system') {
      icon.className = 'fa-solid fa-desktop';
      icon.style.color = '#38bdf8';
      label.textContent = 'Sistema';
    } else {
      icon.className = 'fa-solid fa-moon';
      icon.style.color = '#818cf8';
      label.textContent = 'Escuro';
    }
  }

  const dropdown = id('theme-dropdown');
  if (dropdown) dropdown.style.display = 'none';
}

function toggleThemeDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = id('theme-dropdown');
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
  }
}

document.addEventListener('click', () => {
  const dropdown = id('theme-dropdown');
  if (dropdown) dropdown.style.display = 'none';
});

// ─── SVG Gradient for Score Ring ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAppTheme();
  const svg = document.querySelector('.score-svg');
  if (svg) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#6366f1"/>
        <stop offset="100%" stop-color="#a855f7"/>
      </linearGradient>`;
    svg.prepend(defs);
  }
});

// ============================================================
//   STATE
// ============================================================
const state = {
  user: null,       // { id, email, name, plan }
  tenantId: null,   // currently selected tenant
  currentPage: 'home',
  leads: [],
  selectedLeadId: null,
  chatRefreshInterval: null,
  correctionContext: { leadId: null, context: '', original: '' },
};

// ============================================================
//   API CLIENT (with auth headers)
// ============================================================
const api = {
  getHeaders() {
    const token = localStorage.getItem('sdr_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  },

  async get(url) {
    const res = await fetch(url, { headers: this.getHeaders(), cache: "no-store" });
    if (res.status === 401) { logout(); return null; }
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `HTTP ${res.status}`); }
    return res.json();
  },

  async post(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    if (res.status === 401) { logout(); return null; }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  },

  async put(url, data) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    if (res.status === 401) { logout(); return null; }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  },

  async del(url) {
    const res = await fetch(url, { method: 'DELETE', headers: this.getHeaders() });
    if (res.status === 401) { logout(); return null; }
    return res.json();
  }
};

// ============================================================
//   AUTH MODULE
// ============================================================
function showPanel(panel) {
  const loginPanel = document.getElementById('login-panel');
  const registerPanel = document.getElementById('register-panel');
  if (panel === 'register') {
    loginPanel.style.display = 'none';
    registerPanel.style.display = 'block';
  } else {
    loginPanel.style.display = 'block';
    registerPanel.style.display = 'none';
  }
}

function setAuthError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function togglePassword(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
  } else {
    inp.type = 'password';
    btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
  }
}

async function doLogin(email, password) {
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Entrando...';
  setAuthError('login-error', '');
  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
    localStorage.setItem('sdr_token', data.token);
    localStorage.setItem('sdr_user', JSON.stringify(data.user));
    state.user = data.user;
    showApp();
  } catch (err) {
    setAuthError('login-error', err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Entrar</span><i class="fa-solid fa-arrow-right"></i>';
  }
}

async function doRegister(name, email, password) {
  const btn = document.getElementById('register-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Criando conta...';
  setAuthError('register-error', '');
  try {
    const res = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
    localStorage.setItem('sdr_token', data.token);
    localStorage.setItem('sdr_user', JSON.stringify(data.user));
    state.user = data.user;
    showApp();
  } catch (err) {
    setAuthError('register-error', err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Criar conta</span><i class="fa-solid fa-arrow-right"></i>';
  }
}

function logout() {
  localStorage.removeItem('sdr_token');
  localStorage.removeItem('sdr_user');
  localStorage.removeItem('sdr_tenant');
  state.user = null;
  state.tenantId = null;

  if (state.chatRefreshInterval) clearInterval(state.chatRefreshInterval);
  
  const app = document.getElementById('app');
  if (app) app.style.display = 'none';
  
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.style.display = 'grid';
  
  showPanel('login');
  showToast('Sessão encerrada com sucesso.', 'info');
}

async function exportLeadLGPD(leadId) {
  if (!leadId) leadId = state.currentEditingLeadId;
  if (!leadId || !state.tenantId) return;

  try {
    const report = await api.get(`/tenants/${state.tenantId}/leads/${leadId}/export-lgpd`);
    if (!report) {
      showToast('Erro ao gerar relatório LGPD', 'error');
      return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `relatorio-lgpd-lead-${leadId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast('Relatório de Dados do Titular (LGPD) exportado com sucesso!', 'success');
  } catch (err) {
    showToast('Erro ao exportar dados LGPD: ' + err.message, 'error');
  }
}

async function checkAuth() {
  const token = localStorage.getItem('sdr_token');
  if (!token) return false;
  // Try cached user first for faster UX
  const cached = localStorage.getItem('sdr_user');
  if (cached) {
    try { state.user = JSON.parse(cached); } catch {}
  }
  try {
    const user = await fetch('/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!user.ok) { logout(); return false; }
    state.user = await user.json();
    localStorage.setItem('sdr_user', JSON.stringify(state.user));
    return true;
  } catch {
    // Allow offline access with cached user
    return !!state.user;
  }
}

// ============================================================
//   SHOW / HIDE APP vs AUTH
// ============================================================
function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  populateSidebarUser();
  initDashboard();
}

function populateSidebarUser() {
  if (!state.user) return;
  const initial = (state.user.name || 'U')[0].toUpperCase();
  const el = id => document.getElementById(id);
  if (el('sidebar-user-name'))  el('sidebar-user-name').textContent  = state.user.name;
  if (el('sidebar-user-email')) el('sidebar-user-email').textContent = state.user.email;
  if (el('sidebar-avatar'))     el('sidebar-avatar').textContent     = initial;
  if (el('home-user-name'))     el('home-user-name').textContent     = state.user.name.split(' ')[0];
  // Settings
  if (el('settings-user-name'))  el('settings-user-name').textContent  = state.user.name;
  if (el('settings-user-email')) el('settings-user-email').textContent = state.user.email;
  if (el('settings-avatar'))     el('settings-avatar').textContent     = initial;
  if (el('settings-user-plan'))  el('settings-user-plan').textContent  = (state.user.plan || 'Free').charAt(0).toUpperCase() + (state.user.plan || 'free').slice(1);

  // Admin button visibility
  const navAdmin = el('nav-admin');
  if (navAdmin) {
    navAdmin.style.display = state.user.role === 'ADMIN' ? 'flex' : 'none';
  }
}

// ============================================================
//   ROUTER
// ============================================================
const PAGE_TITLES = {
  home:          'Início',
  agent:         'Meu Agente',
  followup:      'Follow-up Inteligente',
  flows:         'Fluxos',
  training:      'Treinamento',
  'ai-logic':    'Lógica & Raciocínio da IA',
  outbound:      'Disparos para Novos Leads',
  leads:         'Gestão de Leads & Contatos',
  conversations: 'Conversas',
  media:         'Mídias',
  analytics:     'Analytics',
  settings:      'Configurações',
  admin:         'Painel Admin Global',
};

function navigate(page) {
  if (!PAGE_TITLES[page]) page = 'home';
  state.currentPage = page;

  // Update URL
  history.pushState({}, '', `#${page}`);

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  // Show/hide pages
  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === `page-${page}`);
  });

  // Update topbar title
  if (id('topbar-title')) id('topbar-title').textContent = PAGE_TITLES[page];

  // Load page data
  loadPageData(page);
}

async function loadPageData(page) {
  if (page === 'admin') {
    await loadAdminPage();
    return;
  }
  if (page === 'settings') {
    await loadSettingsPage();
    return;
  }
  if (!state.tenantId) return;
  switch (page) {
    case 'home':          await loadHomePage(); break;
    case 'agent':         await loadAgentPage(); break;
    case 'followup':      await loadFollowUpPage(); break;
    case 'flows':         await loadFlowsPage(); break;
    case 'training':      await loadTrainingPage(); break;
    case 'ai-logic':      await loadAILogicPage(); break;
    case 'outbound':      await loadOutboundPage(); break;
    case 'leads':         await loadLeadsPage(); break;
    case 'conversations': await loadConversationsPage(); break;
    case 'media':         await loadMediaPage(); break;
    case 'analytics':     await loadAnalyticsPage(); break;
  }
}

// ============================================================
//   DASHBOARD INIT
// ============================================================
async function initDashboard() {
  await loadTenants();
  const hash = location.hash.replace('#', '');
  navigate(hash || 'home');
  // Periodic background check of WhatsApp status
  checkWhatsappStatus();
  setInterval(() => {
    if (state.tenantId) checkWhatsappStatus();
  }, 25000);
}

// ============================================================
//   TENANT MANAGEMENT & SWITCHING
// ============================================================
async function loadTenants() {
  try {
    const tenants = await api.get('/tenants');
    if (!tenants || !tenants.length) return;

    const sel = id('tenant-select');
    if (!sel) return;
    sel.innerHTML = '';
    tenants.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });
    // Restore last selected tenant or select the first available
    const saved = localStorage.getItem('sdr_tenant');
    if (saved && tenants.find(t => t.id === saved)) {
      sel.value = saved;
    } else {
      sel.value = tenants[0].id;
    }

    state.tenantId = sel.value;
    localStorage.setItem('sdr_tenant', state.tenantId);

    // Bind change listener cleanly
    sel.onchange = (e) => switchTenant(e.target.value);
    checkWhatsappStatus();
  } catch (err) {
    console.error('[Tenants] Load error:', err);
  }
}

async function switchTenant(newTenantId) {
  if (!newTenantId || newTenantId === state.tenantId) return;
  state.tenantId = newTenantId;
  localStorage.setItem('sdr_tenant', state.tenantId);
  showToast('Empresa ativa alternada!', 'info');
  checkWhatsappStatus();
  await loadPageData(state.currentPage);
}

function openNewTenantModal() {
  id('modal-tenant').style.display = 'flex';
}

// ============================================================
//   HOME PAGE
// ============================================================
async function loadHomePage() {
  try {
    const [analytics, sdrConfig, kStats] = await Promise.all([
      api.get(`/tenants/${state.tenantId}/analytics`),
      api.get(`/tenants/${state.tenantId}/sdr`),
      api.get(`/tenants/${state.tenantId}/knowledge-stats`).catch(() => ({ sourceCount: 0, chunkCount: 0 })),
    ]);

    if (analytics) {
      setText('home-total-leads',   analytics.totalLeads ?? 0);
      setText('home-qualified',     analytics.qualifiedLeads ?? 0);
      setText('home-interactions',  analytics.totalInteractions ?? 0);
    }

    setText('home-trainings', kStats.sourceCount ?? 0);

    if (sdrConfig) {
      setText('home-sdr-name',        sdrConfig.personaName || sdrConfig.name);
      setText('home-sdr-role',        sdrConfig.personaRole || 'SDR');
      setText('home-sdr-words',       sdrConfig.maxWords || 40);
      setText('home-sdr-bubbles',     sdrConfig.maxBubbles || 3);
    } else {
      setText('home-sdr-name',        'Nenhum Agente Configurado');
      setText('home-sdr-role',        'Clique para configurar seu SDR →');
    }

    // Maturity score calculation
    const sources = kStats.sourceCount || 0;
    const score = Math.min(100, Math.round(sources * 20 + (analytics?.totalInteractions || 0) * 2));
    const fill = id('home-maturity-fill');
    if (fill) fill.style.width = `${score}%`;
    setText('home-maturity-label', `${score}% maturidade`);

  } catch (err) {
    console.error('[Home] Load error:', err);
  }
}

// ============================================================
//   AGENT PAGE
// ============================================================
async function loadAgentPage() {
  if (!state.tenantId) return;

  const emptyState = id('agent-empty-state');
  const formContainer = id('agent-form-container');

  try {
    const cfg = await api.get(`/tenants/${state.tenantId}/sdr`);

    if (!cfg) {
      // Empty state mode: show onboarding wizard
      if (emptyState) emptyState.style.display = 'block';
      if (formContainer) formContainer.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (formContainer) formContainer.style.display = 'block';

    const setVal = (elId, val) => { const el = id(elId); if (el && val != null) el.value = val; };
    setVal('sdr-name',                    cfg.name || '');
    setVal('sdr-instance',                cfg.instanceName || `tenant-${state.tenantId}`);
    setVal('sdr-persona-name',            cfg.personaName || '');
    setVal('sdr-persona-role',            cfg.personaRole || '');
    setVal('sdr-personality',             cfg.personality || '');
    setVal('sdr-base-instructions',       cfg.baseInstructions || '');
    setVal('sdr-max-words',               cfg.maxWords || 40);
    setVal('sdr-max-bubbles',             String(cfg.maxBubbles || 3));
    setVal('sdr-split-messages',          cfg.splitMessages ? 'true' : 'false');
    setVal('sdr-qualification-flow',      cfg.qualificationFlow || '');
    setVal('sdr-post-qualification-action', cfg.postQualificationAction || '');
    setVal('sdr-webhook-url',             cfg.webhookUrl || '');
    setVal('sdr-spreadsheet-enabled',     cfg.spreadsheetEnabled ? 'true' : 'false');
    setVal('sdr-filter-enabled',          cfg.filterEnabled ? 'true' : 'false');
    setVal('sdr-trigger-type',            cfg.triggerType || 'ALL');
    setVal('sdr-trigger-keywords',        cfg.triggerKeywords || '');
    setVal('sdr-trigger-condition',       cfg.triggerCondition || '');
    setVal('sdr-funnel-objectives',       cfg.funnelObjectives || '');
    setVal('sdr-sales-strategies',        cfg.salesStrategies || '');
    setVal('sdr-when-qualified',          cfg.qualificationCriteria || '');
    setVal('sdr-when-disqualified',       cfg.disqualificationCriteria || '');
    setVal('sdr-stop-conditions',         cfg.stopConditions || '');
    toggleFilterFields(cfg.filterEnabled ? 'true' : 'false');
    setSDRMode(cfg.sdrMode || 'ADVANCED', false);
  } catch (err) {
    console.error('[Agent] Load error:', err);
  }
}

function setSDRMode(mode, syncBackend = false) {
  const isSimple = mode === 'SIMPLE';

  // Agent form radios & cards
  const agentAdv = id('sdr-mode-advanced');
  const agentSim = id('sdr-mode-simple');
  if (agentAdv) agentAdv.checked = !isSimple;
  if (agentSim) agentSim.checked = isSimple;

  const cardAdv = id('agent-mode-card-advanced');
  const cardSim = id('agent-mode-card-simple');
  if (cardAdv) cardAdv.classList.toggle('active', !isSimple);
  if (cardSim) cardSim.classList.toggle('active', isSimple);

  // Settings form radios & cards
  const setAdv = id('settings-sdr-mode-advanced');
  const setSim = id('settings-sdr-mode-simple');
  if (setAdv) setAdv.checked = !isSimple;
  if (setSim) setSim.checked = isSimple;

  const setCardAdv = id('settings-mode-card-advanced');
  const setCardSim = id('settings-mode-card-simple');
  if (setCardAdv) setCardAdv.classList.toggle('active', !isSimple);
  if (setCardSim) setCardSim.classList.toggle('active', isSimple);

  // Show/Hide Funnel Section & Simple Mode Banner
  const funnelSec = id('section-funnel-cognitive');
  const simpleBanner = id('simple-mode-banner');
  if (funnelSec) funnelSec.style.display = isSimple ? 'none' : 'block';
  if (simpleBanner) simpleBanner.style.display = isSimple ? 'block' : 'none';

  if (syncBackend && state.tenantId) {
    api.post(`/tenants/${state.tenantId}/sdr-mode`, {
      sdrMode: mode
    }).then(() => {
      showToast(`Modo do SDR alterado para: ${isSimple ? 'SIMPLES (Qualificação Direta)' : 'AVANÇADO (Funil Completo)'}`, 'success');
    }).catch((err) => {
      showToast('Erro ao atualizar modo do SDR: ' + (err.message || ''), 'error');
    });
  }
}

const NICHE_COGNITIVE_TEMPLATES = {
  automotive: {
    objectives: `1. Acolher o lead com entusiasmo e descobrir modelo/categoria de veículo de interesse (SUV, sedan, picape, etc.)\n2. Descobrir se possui veículo usado para dar na troca (ano, modelo e quilometragem)\n3. Alinhar capacidade de entrada, valor pretendido de parcela ou forma de pagamento\n4. Convidar e agendar test-drive presencial na concessionária com um consultor\n5. Finalizar agradecendo e passando os dados de contato do showroom`,
    strategies: `Rapport inicial (entusiasta automotivo, cordial, quebrar o gelo)\nExploração de necessidades (uso para família, trabalho, viagens ou dia a dia)\nProposição de valor dos modelos (destacar tecnologia, motor, segurança e opcionais)\nEducação sobre taxas e financiamento (explicar planos, bônus na troca e facilidades)\nContorno de Objeções sobre preço ou desvalorização do usado\nUrgência em condições de fábrica ou estoque limitado\nChamada para Ação / CTA (agendar horário para test-drive presencial)`,
    whenQualified: `Lead escolheu modelo de interesse, informou dados do usado (se tiver), alinhou faixa de entrada/parcela e aceitou agendar test-drive presencial ou receber contato direto do consultor de vendas.`,
    whenDisqualified: `Lead sem interesse em compra, sem condições financeiras mínimas, menor de idade ou fora do estado/região de entrega da concessionária.`,
    stopConditions: `Lead pediu para falar com gerente/humano, compareceu à concessionária, comprou o veículo ou solicitou cancelamento do recebimento de mensagens.`
  },
  realestate: {
    objectives: `1. Acolher o lead e descobrir o perfil do imóvel desejado (bairro, tipo de planta, quartos e lazer)\n2. Descobrir se a aquisição é para moradia própria ou investimento\n3. Alinhar a faixa de investimento / orçamento e capacidade de financiamento\n4. Apresentar opções do catálogo e agendar visita ao imóvel ou decorado\n5. Finalizar enviando plantas e informações complementares`,
    strategies: `Rapport consultivo (empático, atencioso e acolhedor)\nExploração de estilo de vida e dores do imóvel atual\nApresentação de valor (localização, lazer completo, potencial de valorização)\nEducação sobre fluxo de obras e financiamento bancário\nContorno de Objeções (prazo de entrega, condomínio, taxas)\nGatilho de oportunidade em tabela de lançamento\nChamada para Ação / CTA (agendar visita presencial)`,
    whenQualified: `Lead definiu perfil do imóvel, confirmou faixa de orçamento/investimento compatível com as opções disponíveis e aceitou agendar visita presencial/ao decorado ou receber proposta formal.`,
    whenDisqualified: `Lead buscando apenas aluguel quando o foco é venda, orçamento incompatível com a tabela de preços, ou que declare expressamente não ter interesse.`,
    stopConditions: `Lead pediu atendimento humano exclusivo de um corretor, já fechou negócio com outro profissional, ou solicitou não ser mais contatado.`
  },
  saas: {
    objectives: `1. Acolher o lead e descobrir o cargo/empresa e principal gargalo operacional que deseja resolver\n2. Entender o tamanho do time e ferramentas utilizadas atualmente\n3. Qualificar o orçamento e autoridade de decisão na contratação\n4. Agendar demonstração ao vivo da plataforma com um especialista\n5. Enviar resumo da proposta e links úteis`,
    strategies: `Abordagem consultiva e focada em ROI (Retorno sobre Investimento)\nDiagnóstico de processos e perda de tempo da equipe\nDemonstração de autoridade e cases de sucesso do mesmo segmento\nEducação técnica sobre integrações e facilidade de implantação\nContorno de Objeções sobre tempo de setup ou segurança de dados\nChamada para Ação / CTA (marcar call de 20 minutos no Google Meet)`,
    whenQualified: `Lead possui perfil de ICP (tamanho de equipe e segmento compatíveis, decisor ou influenciador), tem orçamento disponível e aceitou agendar demonstração de 20 minutos com especialista.`,
    whenDisqualified: `Lead sem fit (ex: usuário individual buscando ferramenta 100% grátis), estudante fazendo pesquisa acadêmica, ou sem autoridade/intenção de contratação.`,
    stopConditions: `Lead solicitou suporte técnico de cliente existente, pediu contato direto do CEO/diretoria, ou informou expressamente que não é o momento para contratação.`
  },
  clinic: {
    objectives: `1. Acolher com extrema empatia e descobrir o procedimento ou queixa principal que o paciente deseja tratar\n2. Entender se já realizou tratamentos semelhantes ou tem data limite desejada\n3. Explicar como funciona a primeira consulta de avaliação personalizada\n4. Agendar dia e horário para a avaliação na clínica\n5. Enviar localização e instruções de preparo para o atendimento`,
    strategies: `Acolhimento humanizado, acolhedor e sigiloso\nEscuta ativa e validação dos sentimentos e desejos do paciente\nApresentação de diferenciais da clínica (profissionais, tecnologia, conforto)\nEducação sobre o procedimento e formas facilitadas de pagamento\nContorno de medos ou inseguranças sobre o pós-procedimento\nChamada para Ação / CTA (reservar horário na agenda)`,
    whenQualified: `Paciente tem interesse concreto no procedimento, compreende como funciona a consulta de avaliação personalizada e concordou em escolher dia/horário para comparecer à clínica.`,
    whenDisqualified: `Paciente buscando especialidades ou procedimentos não realizados pela clínica, menor de idade desacompanhado, ou sem intenção de realizar avaliação.`,
    stopConditions: `Paciente relatando emergência médica grave (orientar pronto-socorro), solicitando reagendamento com recepcionista humana, ou pedindo encerramento de mensagens.`
  },
  consulting: {
    objectives: `1. Acolher o lead e compreender o desafio atual do seu negócio ou carreira\n2. Identificar a urgência e metas desejadas para os próximos 6 meses\n3. Alinhar o escopo de atuação e expectativa de investimento\n4. Agendar sessão estratégica de diagnóstico com o consultor\n5. Finalizar o contato com materiais de introdução`,
    strategies: `Postura de autoridade e escuta atenta\nPerguntas estratégicas para quantificar o custo do problema não resolvido\nApresentação de metodologia e etapas de entrega da consultoria\nContorno de dúvidas sobre prazo e dedicação necessária\nChamada para Ação / CTA (agendar diagnóstico sem compromisso)`,
    whenQualified: `Cliente tem desafio estratégico claro compatível com os serviços, orçamento para contratação de consultoria e aceitou agendar sessão de diagnóstico estratégico.`,
    whenDisqualified: `Lead buscando assessoria gratuita, sem faturamento mínimo ou fora do segmento atendido pela consultoria.`,
    stopConditions: `Lead solicitou reunião com sócio/diretor específico, ou pediu encerramento definitivo do contato.`
  },
  universal: {
    objectives: `1. Acolher o lead com simpatia, descobrir seu nome e interesse principal\n2. Entender a necessidade, objetivo ou problema que o lead deseja resolver\n3. Descobrir orçamento disponível, capacidade de investimento ou preferências\n4. Apresentar os diferenciais da solução e remover eventuais objeções\n5. Convidar para o próximo passo comercial (visita, demonstração, proposta ou ligação)\n6. Finalizar o contato com cortesia e enviar informações complementares`,
    strategies: `Rapport inicial (empatia, quebrar o gelo, acolhimento cordial)\nExploração sutil de dores (compreender necessidades e desafios do lead)\nProposição de valor (apresentar benefícios e diferenciais da solução)\nEducação do Lead (esclarecer dúvidas técnicas, planos, condições e prazos)\nContorno de Objeções (endereçar inseguranças, comparar opções e dar segurança)\nUrgência e Oportunidade (destacar condições por tempo limitado ou disponibilidade)\nChamada para Ação / CTA (propor o próximo passo: agendamento, ligação ou proposta)`,
    whenQualified: `Lead esclareceu dúvidas, demonstrou intenção real de compra, atendeu aos requisitos básicos de qualificação e concordou com o próximo passo comercial (reunião, proposta ou visita).`,
    whenDisqualified: `Lead sem interesse, sem orçamento mínimo, perfil incompatível, concorrente ou que declare expressamente recusa de contato.`,
    stopConditions: `Lead pediu explicitamente para falar com atendente humano, demonstrou irritação severa, solicitou suporte pós-venda ou solicitou exclusão do contato.`
  }
};

function applyNicheCognitiveTemplate(nicheKey) {
  const template = NICHE_COGNITIVE_TEMPLATES[nicheKey];
  if (!template) return;

  const objInput = id('sdr-funnel-objectives');
  const stratInput = id('sdr-sales-strategies');
  const qualInput = id('sdr-when-qualified');
  const disqInput = id('sdr-when-disqualified');
  const stopInput = id('sdr-stop-conditions');

  if (objInput) objInput.value = template.objectives;
  if (stratInput) stratInput.value = template.strategies;
  if (qualInput && template.whenQualified) qualInput.value = template.whenQualified;
  if (disqInput && template.whenDisqualified) disqInput.value = template.whenDisqualified;
  if (stopInput && template.stopConditions) stopInput.value = template.stopConditions;

  showToast(`Modelo de funil "${nicheKey.toUpperCase()}" aplicado com sucesso! Lembre-se de Salvar.`, 'success');
}

function toggleFilterFields(val) {
  const isEnabled = val === 'true';
  const groupTriggerType = id('group-trigger-type');
  if (groupTriggerType) groupTriggerType.style.display = isEnabled ? 'block' : 'none';
  if (!isEnabled) {
    if (id('group-trigger-keywords')) id('group-trigger-keywords').style.display = 'none';
    if (id('group-trigger-condition')) id('group-trigger-condition').style.display = 'none';
  } else {
    updateTriggerFieldsView(id('sdr-trigger-type')?.value || 'ALL');
  }
}

function updateTriggerFieldsView(triggerType) {
  const isFilterEnabled = id('sdr-filter-enabled')?.value === 'true';
  if (!isFilterEnabled) return;
  const kwGroup = id('group-trigger-keywords');
  const condGroup = id('group-trigger-condition');
  if (kwGroup) kwGroup.style.display = triggerType === 'KEYWORD' ? 'block' : 'none';
  if (condGroup) condGroup.style.display = triggerType === 'TAG_MATCH' ? 'block' : 'none';
}

function showAgentForm() {
  const emptyState = id('agent-empty-state');
  const formContainer = id('agent-form-container');
  if (emptyState) emptyState.style.display = 'none';
  if (formContainer) formContainer.style.display = 'block';

  // Seed helpful default template for the user to customize
  const setVal = (elId, val) => { const el = id(elId); if (el && !el.value) el.value = val; };
  setVal('sdr-name', 'Agente Comercial IA');
  setVal('sdr-instance', `tenant-${state.tenantId}`);
  setVal('sdr-persona-name', 'Ana');
  setVal('sdr-persona-role', 'Especialista de Vendas e Atendimento');
  setVal('sdr-personality', 'Humana, empática, simpática e focada em entender as necessidades do cliente. Usa parágrafos curtos no WhatsApp e linguagem natural.');
  setVal('sdr-base-instructions', 'Apresente os produtos e serviços da empresa com clareza, tire dúvidas com base no playbook e conduza o cliente para o próximo passo comercial.');
  setVal('sdr-max-words', '40');
  setVal('sdr-max-bubbles', '3');
  setVal('sdr-split-messages', 'true');
  setVal('sdr-qualification-flow', '1. Descobrir qual o interesse ou problema principal\n2. Entender o orçamento ou prazo estimado\n3. Obter nome e melhor horário para contato');
  setVal('sdr-post-qualification-action', 'Transferir para um especialista humano ou agendar uma demonstração');
  setVal('sdr-filter-enabled', 'false');
  setVal('sdr-trigger-type', 'ALL');
  setVal('sdr-funnel-objectives', NICHE_COGNITIVE_TEMPLATES.universal.objectives);
  setVal('sdr-sales-strategies', NICHE_COGNITIVE_TEMPLATES.universal.strategies);
  setVal('sdr-when-qualified', NICHE_COGNITIVE_TEMPLATES.universal.whenQualified);
  setVal('sdr-when-disqualified', NICHE_COGNITIVE_TEMPLATES.universal.whenDisqualified);
  setVal('sdr-stop-conditions', NICHE_COGNITIVE_TEMPLATES.universal.stopConditions);
  toggleFilterFields('false');
}

async function saveAgentConfig(e) {
  e.preventDefault();
  const getVal = elId => { const el = id(elId); return el ? el.value : ''; };

  const payload = {
    name:                   getVal('sdr-name'),
    personaName:            getVal('sdr-persona-name'),
    personaRole:            getVal('sdr-persona-role'),
    personality:            getVal('sdr-personality'),
    baseInstructions:       getVal('sdr-base-instructions'),
    instanceName:           getVal('sdr-instance'),
    maxWords:               parseInt(getVal('sdr-max-words')) || 40,
    splitMessages:          getVal('sdr-split-messages') === 'true',
    maxBubbles:             parseInt(getVal('sdr-max-bubbles')) || 3,
    qualificationFlow:      getVal('sdr-qualification-flow'),
    postQualificationAction: getVal('sdr-post-qualification-action'),
    webhookUrl:             getVal('sdr-webhook-url'),
    spreadsheetEnabled:     getVal('sdr-spreadsheet-enabled') === 'true',
    filterEnabled:          getVal('sdr-filter-enabled') === 'true',
    triggerType:            getVal('sdr-trigger-type') || 'ALL',
    triggerKeywords:        getVal('sdr-trigger-keywords'),
    triggerCondition:       getVal('sdr-trigger-condition'),
    funnelObjectives:       getVal('sdr-funnel-objectives'),
    salesStrategies:        getVal('sdr-sales-strategies'),
    qualificationCriteria:   getVal('sdr-when-qualified'),
    disqualificationCriteria: getVal('sdr-when-disqualified'),
    stopConditions:          getVal('sdr-stop-conditions'),
    sdrMode:                document.querySelector('input[name="sdr-mode"]:checked')?.value || 'ADVANCED',
  };

  const btn = document.querySelector('#sdr-config-form .btn-accent');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';

  try {
    await api.post(`/tenants/${state.tenantId}/sdr`, payload);
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvo com sucesso!';
    btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    showToast('Agente SDR configurado com sucesso!', 'success');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
      btn.disabled = false;
    }, 2500);
  } catch (err) {
    btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Erro ao salvar';
    btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    showToast(err.message || 'Erro ao salvar configuração do agente', 'error');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
      btn.disabled = false;
    }, 3000);
    console.error('[Agent] Save error:', err);
  }
}

// ============================================================
//   TRAINING PAGE
// ============================================================

// Hooks para forms de treinamento
document.addEventListener('DOMContentLoaded', () => {
  const tForm = document.getElementById('training-auto-form');
  if (tForm) {
    tForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('training-auto-title').value;
      const text = document.getElementById('training-auto-content').value;
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      btn.innerHTML = 'Enviando...';
      
      await api.post('/tenants/' + state.tenantId + '/training-sessions', {
        title: title,
        content: text,
        type: 'text'
      });
      
      e.target.reset();
      showToast('Enviado para a IA analisar!', 'success');
      btn.disabled = false;
      btn.innerHTML = '<span>Processar com IA</span><i class="fa-solid fa-wand-magic-sparkles"></i>';
      loadTrainingSessions();
    });
  }
});

async function loadTrainingPage() {
  loadTrainingSessions();
  loadReflections();
  const activeInnerTab = document.querySelector('.inner-tab.active');
  const tabId = activeInnerTab ? activeInnerTab.dataset.innerTab : 'tab-playbooks';
  if (tabId === 'tab-playbooks') await loadKnowledge();
  else if (tabId === 'tab-corrections') await loadCorrections();
  else if (tabId === 'tab-brain') await loadBrainStats();
}

async function loadKnowledge() {
  try {
    const sources = await api.get(`/tenants/${state.tenantId}/knowledge`);
    const listEl = id('knowledge-list');
    if (!listEl) return;
    if (!sources || sources.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-book-skull"></i><p>Nenhum playbook cadastrado.</p></div>';
      return;
    }
    listEl.innerHTML = sources.map(s => `
      <div class="knowledge-item">
        <div class="knowledge-item-header">
          <h4><i class="fa-solid fa-book-open"></i> ${escHtml(s.title)}</h4>
           <button class="btn-danger-outline" style="padding:2px 8px; font-size:11px;" onclick="deleteKnowledge('${s.id}')"><i class="fa-solid fa-trash"></i> Excluir</button>
          <span class="version-badge">${s.chunks ? s.chunks.length : 0} chunks</span>
        </div>
        ${(s.chunks || []).slice(0, 3).map(c => `
          <div class="knowledge-chunk-text">${escHtml(c.content || c.chunk || '')}</div>
        `).join('')}
        ${s.chunks && s.chunks.length > 3 ? `<div class="knowledge-chunk-text" style="color:var(--text-3)">+ ${s.chunks.length - 3} mais itens...</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error('[Knowledge] Load error:', err);
  }
}

async function addKnowledge(e) {
  e.preventDefault();
  const title  = (id('knowledge-title')?.value || '').trim();
  const rawChunks = (id('knowledge-chunks')?.value || '').trim();
  const chunks = rawChunks.split('\n').map(l => l.trim()).filter(l => l.length > 3);

  if (!title || chunks.length === 0) {
    alert('Preencha o título e ao menos um fato.');
    return;
  }

  const btn = document.querySelector('#knowledge-form .btn-accent');
  const origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Treinando...';

  try {
    await api.post(`/tenants/${state.tenantId}/knowledge`, { title, chunks });
    id('knowledge-form').reset();
    await loadKnowledge();
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Treinado com sucesso!';
    btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    setTimeout(() => {
      btn.innerHTML = origHTML;
      btn.style.background = '';
      btn.disabled = false;
    }, 2500);
  } catch (err) {
    btn.innerHTML = origHTML;
    btn.disabled = false;
    alert('Erro ao treinar: ' + err.message);
  }
}

async function loadCorrections() {
  try {
    const corrections = await api.get(`/tenants/${state.tenantId}/corrections`);
    const listEl = id('corrections-list');
    if (!listEl) return;
    if (!corrections || corrections.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-pen-to-square"></i><p>Nenhuma correção ainda. Clique nos balões azuis do SDR em Conversas para corrigir.</p></div>';
      return;
    }
    listEl.innerHTML = corrections.map(c => `
      <div class="correction-item">
        <div class="correction-item-header">
          <span class="correction-feedback"><i class="fa-solid fa-quote-left"></i> ${escHtml(c.feedbackText)}</span>
          <span class="correction-time">${formatDate(c.createdAt)}</span>
        </div>
        <div class="correction-error"><strong>❌ Original:</strong> ${escHtml(c.originalResponse)}</div>
        <div class="correction-fix"><strong>✅ Corrigido:</strong> ${escHtml(c.correctedResponse)}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('[Corrections] Load error:', err);
  }
}

async function loadBrainStats() {
  try {
    const [kStats, corrections, leads] = await Promise.all([
      api.get(`/tenants/${state.tenantId}/knowledge-stats`).catch(() => ({ sourceCount: 0, chunkCount: 0 })),
      api.get(`/tenants/${state.tenantId}/corrections?limit=500`).catch(() => []),
      api.get(`/tenants/${state.tenantId}/leads`).catch(() => []),
    ]);

    const corrCount  = corrections.length;
    const chunkCount = kStats?.chunkCount ?? 0;
    const srcCount   = kStats?.sourceCount ?? 0;
    const leadCount  = leads.length;
    const score = Math.min(100, Math.round(
      (chunkCount * 2) + (corrCount * 5) + (leadCount * 1.5)
    ));

    // Update ring
    const arc = id('brain-score-arc');
    if (arc) {
      const circumference = 326.73;
      const dashoffset = circumference - (score / 100) * circumference;
      setTimeout(() => { arc.style.strokeDashoffset = dashoffset; }, 100);
    }

    setText('brain-score-num', score);
    setText('brain-source-count', `${srcCount} documentos`);
    setText('brain-chunk-count', `${chunkCount} chunks`);
    setText('brain-correction-count', corrCount);
    setText('brain-lead-count', leadCount);

    const lblEl = id('brain-score-label');
    if (lblEl) {
      if (score < 20) lblEl.textContent = '🌱 Iniciante — Adicione playbooks para começar';
      else if (score < 40) lblEl.textContent = '📚 Aprendiz — Continue treinando!';
      else if (score < 60) lblEl.textContent = '⚡ Intermediário — Bom progresso!';
      else if (score < 80) lblEl.textContent = '🔥 Avançado — SDR bem treinado!';
      else lblEl.textContent = '🏆 Expert — SDR no nível máximo!';
    }

    // Memory count (approximate from leads analytics)
    const analytics = await api.get(`/tenants/${state.tenantId}/analytics`).catch(() => null);
    const memoryCount = analytics?.totalInteractions ? Math.round(analytics.totalInteractions * 0.4) : 0;
    setText('brain-memory-count', memoryCount);

  } catch (err) {
    console.error('[Brain] Load error:', err);
  }
}

// ============================================================
//   CONVERSATIONS PAGE
// ============================================================
async function loadConversationsPage() {
  await loadLeads();
}

async function loadLeads() {
  if (!state.tenantId) await loadTenants();
  if (!state.tenantId) return;

  try {
    const res = await api.get(`/tenants/${state.tenantId}/leads`);
    state.leads = Array.isArray(res) ? res : [];
    renderLeads(state.leads);
    const badge = id('nav-active-badge');
    if (badge) {
      const active = state.leads.filter(l => l && (l.status === 'ACTIVE' || l.status === 'NEW')).length;
      badge.textContent = active;
      badge.style.display = active > 0 ? 'inline-flex' : 'none';
    }
    setText('leads-total-count', state.leads.length);
  } catch (err) {
    console.error('[Leads] Load error:', err);
  }
}

function renderLeads(leads) {
  const listEl = id('lead-list');
  if (!listEl) return;
  if (!leads || leads.length === 0) {
    listEl.innerHTML = '<li class="lead-empty">Nenhum lead encontrado para esta empresa.</li>';
    return;
  }
  listEl.innerHTML = leads.map(lead => {
    const initial = (lead.name || lead.phone || '?')[0].toUpperCase();
    const statusClass = `status-${(lead.status || 'new').toLowerCase()}`;
    const isActive = lead.id === state.selectedLeadId;
    return `
      <li class="lead-item${isActive ? ' active' : ''}" onclick="selectLead('${lead.id}')">
        <div class="lead-item-avatar">${initial}</div>
        <div class="lead-item-info">
          <div class="lead-item-name">${escHtml(lead.name || 'Sem nome')}</div>
          <div class="lead-item-phone">${escHtml(lead.phone)}</div>
        </div>
        <div class="lead-status-dot ${statusClass}" title="${lead.status || 'NEW'}"></div>
      </li>`;
  }).join('');
}

async function selectLead(leadId) {
  state.selectedLeadId = leadId;
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  // Update active state in list
  document.querySelectorAll('.lead-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('onclick')?.includes(leadId));
  });

  // Update chat header
  const initial = (lead.name || lead.phone || '?')[0].toUpperCase();
  setText('chat-lead-name', lead.name || 'Sem nome');
  setText('chat-lead-phone', lead.phone);
  const avatarEl = id('chat-avatar');
  if (avatarEl) avatarEl.textContent = initial;

  // Update badges
  const badgeContainer = id('chat-lead-badge-container');
  if (badgeContainer) {
    badgeContainer.innerHTML = `
      <span class="badge objective"><i class="fa-solid fa-bullseye"></i> ${escHtml(lead.currentObjective || 'Descobrir interesse')}</span>
      <span class="badge strategy"><i class="fa-solid fa-chess"></i> ${escHtml(lead.currentStrategy || 'Rapport')}</span>`;
  }

  // Load messages
  await loadMessages(leadId);
}

async function loadMessages(leadId) {
  const chatEl = id('chat-messages');
  if (!chatEl) return;

  chatEl.innerHTML = '<div class="chat-empty"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:28px;"></i></div>';

  try {
    const messages = await api.get(`/leads/${leadId}/messages`);
    state.currentLeadMessages = messages || [];
    state.currentLeadId = leadId;

    if (!messages || messages.length === 0) {
      chatEl.innerHTML = '<div class="chat-empty"><i class="fa-regular fa-comments"></i><p>Nenhuma mensagem ainda.</p></div>';
      return;
    }

    chatEl.innerHTML = messages.map((msg, index) => {
      const isSDR = msg.sender === 'SDR' || msg.sender === 'sdr';
      const time = formatTime(msg.createdAt || msg.timestamp);
      return `
        <div class="chat-bubble ${isSDR ? 'sdr' : 'lead'}"
             ${isSDR ? `onclick="openCorrectionModalByIndex(${index})" title="Clique para corrigir e ensinar a IA"` : ''}>
          ${escHtml(msg.content)}
          <span class="chat-bubble-time">${time}</span>
        </div>`;
    }).join('');
    chatEl.scrollTop = chatEl.scrollHeight;
  } catch (err) {
    console.error('[Messages] Load error:', err);
    chatEl.innerHTML = '<div class="chat-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>Erro ao carregar mensagens.</p></div>';
  }
}

function openCorrectionModalByIndex(index) {
  const messages = state.currentLeadMessages || [];
  const msg = messages[index];
  if (!msg) return;
  const leadId = state.currentLeadId || state.selectedLeadId;
  const prevMsg = getPreviousLeadMsg(messages, msg);
  openCorrectionModal(leadId, msg.content, prevMsg);
}

function getPreviousLeadMsg(messages, sdrMsg) {
  const idx = messages.indexOf(sdrMsg);
  for (let i = idx - 1; i >= 0; i--) {
    if (messages[i].sender === 'LEAD' || messages[i].sender === 'lead') {
      return (messages[i].content || '').slice(0, 200);
    }
  }
  return 'Lead enviou uma mensagem';
}

// ============================================================
//   MEDIA PAGE
// ============================================================
state.mediaInputMode = 'upload';
state.selectedMediaFile = null;

function switchMediaMode(mode) {
  state.mediaInputMode = mode;
  const btnUpload = id('tab-btn-upload');
  const btnUrl = id('tab-btn-url');
  const containerUpload = id('media-mode-upload-container');
  const containerUrl = id('media-mode-url-container');
  const submitText = id('media-submit-text');

  if (mode === 'upload') {
    if (btnUpload) btnUpload.classList.add('active');
    if (btnUrl) btnUrl.classList.remove('active');
    if (containerUpload) containerUpload.style.display = 'block';
    if (containerUrl) containerUrl.style.display = 'none';
    if (submitText) submitText.textContent = 'Fazer Upload & Cadastrar';
  } else {
    if (btnUpload) btnUpload.classList.remove('active');
    if (btnUrl) btnUrl.classList.add('active');
    if (containerUpload) containerUpload.style.display = 'none';
    if (containerUrl) containerUrl.style.display = 'block';
    if (submitText) submitText.textContent = 'Salvar Mídia por URL';
  }
}

function handleMediaDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = id('media-dropzone');
  if (dz) dz.classList.add('dragover');
}

function handleMediaDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = id('media-dropzone');
  if (dz) dz.classList.remove('dragover');
}

function handleMediaDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = id('media-dropzone');
  if (dz) dz.classList.remove('dragover');

  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    processSelectedMediaFile(file);
  }
}

function handleMediaFileSelect(e) {
  if (e.target && e.target.files && e.target.files.length > 0) {
    const file = e.target.files[0];
    processSelectedMediaFile(file);
  }
}

function processSelectedMediaFile(file) {
  if (!file) return;
  state.selectedMediaFile = file;

  // Detect extension and MIME
  const name = file.name || 'arquivo';
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot !== -1 ? name.substring(lastDot).toLowerCase() : '';
  const baseName = lastDot !== -1 ? name.substring(0, lastDot) : name;

  // Auto-fill trigger value if empty
  const triggerInput = id('media-trigger-value');
  if (triggerInput && (!triggerInput.value || triggerInput.dataset.autofilled === 'true')) {
    triggerInput.value = baseName.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 40);
    triggerInput.dataset.autofilled = 'true';
  }

  // Auto-detect mediaType select
  const typeSelect = id('media-type');
  if (typeSelect) {
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext) || file.type.startsWith('image/')) {
      typeSelect.value = 'image';
    } else if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext) || file.type.startsWith('video/')) {
      typeSelect.value = 'video';
    } else if (['.mp3', '.ogg', '.wav', '.m4a', '.aac'].includes(ext) || file.type.startsWith('audio/')) {
      typeSelect.value = 'audio';
    } else {
      typeSelect.value = 'document';
    }
  }

  // Format file size
  const sizeFormatted = file.size > 1024 * 1024
    ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(file.size / 1024)} KB`;

  setText('mfp-name', name);
  setText('mfp-size', sizeFormatted);

  // Thumbnail preview
  const thumbContainer = id('mfp-thumbnail-container');
  if (thumbContainer) {
    thumbContainer.innerHTML = '';
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      thumbContainer.appendChild(img);
    } else if (file.type.startsWith('video/') || ['.mp4', '.mov'].includes(ext)) {
      thumbContainer.innerHTML = '<i class="fa-solid fa-video" style="color:var(--accent);"></i>';
    } else if (file.type.startsWith('audio/') || ['.mp3', '.ogg'].includes(ext)) {
      thumbContainer.innerHTML = '<i class="fa-solid fa-music" style="color:var(--success);"></i>';
    } else {
      thumbContainer.innerHTML = '<i class="fa-solid fa-file-pdf" style="color:var(--danger);"></i>';
    }
  }

  // Show preview, hide dropzone
  const dz = id('media-dropzone');
  const previewBox = id('media-file-preview-box');
  if (dz) dz.style.display = 'none';
  if (previewBox) previewBox.style.display = 'flex';
}

function clearSelectedMediaFile() {
  state.selectedMediaFile = null;
  const fileInput = id('media-file-input');
  if (fileInput) fileInput.value = '';

  const dz = id('media-dropzone');
  const previewBox = id('media-file-preview-box');
  if (dz) dz.style.display = 'block';
  if (previewBox) previewBox.style.display = 'none';
}

async function handleMediaFormSubmit(e) {
  e.preventDefault();
  if (!state.tenantId) {
    showToast('Nenhuma empresa selecionada.', 'error');
    return;
  }

  const triggerValue = (id('media-trigger-value')?.value || '').trim();
  const mediaType = id('media-type')?.value || 'image';
  const caption = (id('media-caption')?.value || '').trim();

  if (!triggerValue) {
    showToast('Informe a tag de disparo da mídia.', 'warning');
    return;
  }

  const submitBtn = id('media-submit-btn');
  const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';
  }

  try {
    if (state.mediaInputMode === 'upload') {
      if (!state.selectedMediaFile) {
        showToast('Selecione ou arraste um arquivo para fazer upload.', 'warning');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalBtnHtml; }
        return;
      }

      const formData = new FormData();
      formData.append('file', state.selectedMediaFile);
      formData.append('triggerValue', triggerValue);
      formData.append('mediaType', mediaType);
      if (caption) formData.append('caption', caption);

      const token = localStorage.getItem('sdr_token');
      const res = await fetch(`/tenants/${state.tenantId}/media/upload`, {
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Erro HTTP ${res.status}`);
      }

      showToast('Arquivo enviado e mídia cadastrada com sucesso!', 'success');
    } else {
      // URL Mode
      const mediaUrl = (id('media-url')?.value || '').trim();
      if (!mediaUrl) {
        showToast('Insira a URL pública da mídia.', 'warning');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalBtnHtml; }
        return;
      }

      await api.post(`/tenants/${state.tenantId}/media`, {
        triggerValue,
        mediaType,
        mediaUrl,
        caption: caption || null
      });

      showToast('Mídia cadastrada com sucesso via URL!', 'success');
    }

    // Reset Form
    id('media-form')?.reset();
    clearSelectedMediaFile();
    const triggerInput = id('media-trigger-value');
    if (triggerInput) delete triggerInput.dataset.autofilled;

    await loadMediaPage();
  } catch (err) {
    console.error('[Media] Save error:', err);
    showToast(`Erro ao cadastrar mídia: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  }
}

async function loadMediaPage() {
  if (!state.tenantId) await loadTenants();
  if (!state.tenantId) return;

  try {
    const assets = await api.get(`/tenants/${state.tenantId}/media`);
    const listEl = id('media-list');
    const badgeEl = id('media-count-badge');
    const mediaArray = Array.isArray(assets) ? assets : [];

    if (badgeEl) badgeEl.textContent = mediaArray.length;

    if (!listEl) return;
    if (mediaArray.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-photo-film"></i><p>Nenhuma mídia cadastrada ainda.</p></div>';
      return;
    }

    const typeIcons = {
      image: 'fa-image',
      video: 'fa-video',
      audio: 'fa-music',
      document: 'fa-file-pdf'
    };

    listEl.innerHTML = mediaArray.map(a => {
      const isImg = a.mediaType === 'image';
      const icon = typeIcons[a.mediaType] || 'fa-photo-film';
      const fullUrl = a.mediaUrl;
      const tagSnippet = `[SEND_MEDIA: ${a.triggerValue}]`;

      const previewHtml = isImg
        ? `<img src="${escAttr(fullUrl)}" alt="${escAttr(a.triggerValue)}" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-image\\'></i>'">`
        : `<i class="fa-solid ${icon}"></i>`;

      return `
        <div class="media-asset-card">
          <div class="mac-header">
            <div class="mac-title">
              <i class="fa-solid ${icon}"></i>
              <span>${escHtml(a.triggerValue)}</span>
            </div>
            <span class="mac-type">${escHtml(a.mediaType || 'mídia')}</span>
          </div>

          <div class="mac-body">
            <div class="mac-preview">
              ${previewHtml}
            </div>
            <div class="mac-content">
              <div class="mac-tag-pill" title="Clique para copiar a tag de envio da IA" onclick="copyMediaTag('${escAttr(tagSnippet)}')">
                <i class="fa-solid fa-copy"></i> ${escHtml(tagSnippet)}
              </div>
              <div class="mac-url">
                <a href="${escAttr(fullUrl)}" target="_blank" rel="noopener" title="Abrir arquivo">
                  <i class="fa-solid fa-arrow-up-right-from-square"></i> ${escHtml(fullUrl)}
                </a>
              </div>
            </div>
            <div class="mac-actions">
              <button class="btn-delete-media" onclick="deleteMedia('${a.id}', '${escAttr(a.triggerValue)}')" title="Excluir Mídia">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>

          ${a.caption ? `<div class="mac-caption"><i class="fa-solid fa-quote-left" style="font-size:10px; opacity:0.5;"></i> ${escHtml(a.caption)}</div>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('[Media] Load error:', err);
  }
}

function copyMediaTag(tagText) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(tagText);
    showToast(`Tag copiada: ${tagText}`, 'success');
  } else {
    prompt('Copie a tag de mídia:', tagText);
  }
}

async function deleteMedia(assetId, triggerName) {
  if (!confirm(`Deseja realmente remover a mídia "${triggerName || ''}"?`)) return;
  try {
    await api.del(`/media/${assetId}`);
    showToast('Mídia removida com sucesso!', 'info');
    await loadMediaPage();
  } catch (err) {
    showToast('Erro ao remover: ' + err.message, 'error');
  }
}

// ============================================================
//   ANALYTICS PAGE
// ============================================================
async function loadAnalyticsPage() {
  try {
    const data = await api.get(`/tenants/${state.tenantId}/analytics`);
    if (!data) return;

    setText('metric-interactions', data.totalInteractions ?? '–');
    setText('metric-leads',        data.activeLeads ?? '–');
    setText('metric-ratio',        data.sdrRatio != null ? `${data.sdrRatio}%` : '–');
    setText('metric-words',        data.avgWords ?? '–');

    renderObjectivesChart(data.objectiveFunnel || []);
    // renderPieChart(stats.strategyDistribution);
  } catch (err) {
    console.error('Analytics Error:', err);
  }
}

// ============================================================
//   TREINO AUTO & REFLECTIONS
// ==========================================

async function loadTrainingSessions() {
  const sessions = await api.get('/tenants/' + state.tenantId + '/training-sessions');
  const container = document.getElementById('training-sessions-list');
  if (!container) return;
  container.innerHTML = '';
  if (!sessions || sessions.length === 0) {
    container.innerHTML = '<p class="field-hint">Nenhuma sessão processada ainda.</p>';
    return;
  }
  sessions.forEach(s => {
    const div = document.createElement('div');
    div.className = 'playbook-item';
    div.innerHTML = `
      <div class="pb-info">
        <div class="pb-title">${escHtml(s.title || '')}</div>
        <div class="pb-stats">Status: ${s.processed ? 'Concluído' : 'Processando...'} | Tipo: ${escHtml(s.type || '')}</div>
      </div>
    `;
    container.appendChild(div);
  });
}

async function loadReflections() {
  const refs = await api.get('/tenants/' + state.tenantId + '/reflections');
  const container = document.getElementById('reflections-list');
  if (!container) return;
  container.innerHTML = '';
  if (!refs || refs.length === 0) {
    container.innerHTML = '<p class="field-hint">Nenhuma reflexão automática até o momento. O SDR gera reflexões após interações ricas com os leads.</p>';
    return;
  }
  
  refs.forEach(r => {
    const div = document.createElement('div');
    div.className = 'glass form-card';
    div.style.marginBottom = '12px';
    let insightsHtml = '';
    try {
      const ins = JSON.parse(r.insights);
      if (Array.isArray(ins)) {
        insightsHtml = '<ul style="padding-left:16px; margin-top:8px; font-size:12px; color:var(--text-2);">' + 
                       ins.map(i => '<li>' + escHtml(String(i)) + '</li>').join('') + 
                       '</ul>';
      }
    } catch(e) {}
    
    div.innerHTML = `
      <div style="font-size:11px; color:var(--accent); font-weight:600; margin-bottom:4px;">ID do Lead: ${escHtml((r.leadId || '').substring(0,8))}...</div>
      <p style="font-size:13px; color:var(--text-1);">${escHtml(r.summary || '')}</p>
      ${insightsHtml}
    `;
    container.appendChild(div);
  });
}

// ============================================================
//   FLOW BUILDER
// ============================================================
let editor = null;
let currentFlowId = null;

async function loadFlowsPage() {
  if (!state.tenantId) return;
  const flows = await api.get('/tenants/' + state.tenantId + '/flows');
  renderFlowsList(flows);
  
  // Init drawflow if not initialized
  if (!editor && window.Drawflow) {
    const el = document.getElementById('drawflow');
    editor = new Drawflow(el);
    editor.reroute = true;
    editor.start();
  }
}

function renderFlowsList(flows) {
  const container = id('flows-list');
  container.innerHTML = '';
  
  if (!flows || flows.length === 0) {
    id('flows-empty').style.display = 'flex';
    id('flow-editor-wrap').style.display = 'none';
    return;
  }
  
  flows.forEach(flow => {
    const div = document.createElement('div');
    div.className = 'flow-item' + (currentFlowId === flow.id ? ' active' : '');
    div.innerHTML = `
      <div class="flow-item-name">${escHtml(flow.name || '')}</div>
      <div class="flow-item-status ${flow.isActive ? 'active' : 'inactive'}">${flow.isActive ? 'Ativo' : 'Inativo'}</div>
    `;
    div.onclick = () => openFlow(flow.id);
    container.appendChild(div);
  });
}

async function openFlow(flowId) {
  currentFlowId = flowId;
  const flow = await api.get('/flows/' + flowId);
  if (!flow) return;
  
  id('flows-empty').style.display = 'none';
  id('flow-editor-wrap').style.display = 'flex';
  
  id('flow-name').value = flow.name;
  id('flow-trigger').value = flow.trigger;
  id('flow-trigger-value').value = flow.triggerValue || '';
  id('flow-is-active').checked = flow.isActive;
  
  // load drawflow
  editor.clearModuleSelected();
  try {
    const data = JSON.parse(flow.nodes);
    editor.import(data);
  } catch(e) {
    editor.clear();
  }
  loadFlowsPage(); // refresh list to show active
}

async function createNewFlow() {
  const flow = await api.post('/tenants/' + state.tenantId + '/flows', {
    name: 'Novo Fluxo',
    trigger: 'manual',
    isActive: false,
    nodes: JSON.stringify({ "drawflow": { "Home": { "data": {} } } })
  });
  if (flow) {
    await openFlow(flow.id);
  }
}

async function saveCurrentFlow() {
  if (!currentFlowId) return;
  const btn = event.currentTarget;
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  
  const nodes = JSON.stringify(editor.export());
  const body = {
    name: id('flow-name').value,
    trigger: id('flow-trigger').value,
    triggerValue: id('flow-trigger-value').value,
    isActive: id('flow-is-active').checked,
    nodes: nodes
  };
  
  await api.put('/flows/' + currentFlowId, body);
  showToast('Fluxo salvo com sucesso', 'success');
  
  btn.innerHTML = orig;
  loadFlowsPage();
}

async function deleteCurrentFlow() {
  if (!currentFlowId) return;
  if (!confirm('Excluir este fluxo?')) return;
  await api.del('/flows/' + currentFlowId);
  currentFlowId = null;
  id('flows-empty').style.display = 'flex';
  id('flow-editor-wrap').style.display = 'none';
  loadFlowsPage();
}

// Drag and drop for drawflow
function dragNode(ev) {
  ev.dataTransfer.setData("node", ev.target.getAttribute("data-node"));
}

function allowDropNode(ev) {
  ev.preventDefault();
}

function dropNode(ev) {
  ev.preventDefault();
  const data = ev.dataTransfer.getData("node");
  addNodeToDrawFlow(data, ev.clientX, ev.clientY);
}

function addNodeToDrawFlow(name, pos_x, pos_y) {
  if(editor.editor_mode === 'fixed') return false;
  
  pos_x = pos_x * ( editor.precanvas.clientWidth / (editor.precanvas.clientWidth * editor.zoom)) - (editor.precanvas.getBoundingClientRect().x * ( editor.precanvas.clientWidth / (editor.precanvas.clientWidth * editor.zoom)));
  pos_y = pos_y * ( editor.precanvas.clientHeight / (editor.precanvas.clientHeight * editor.zoom)) - (editor.precanvas.getBoundingClientRect().y * ( editor.precanvas.clientHeight / (editor.precanvas.clientHeight * editor.zoom)));

  switch (name) {
    case 'message':
      editor.addNode('message', 1, 1, pos_x, pos_y, 'message', {text: ''}, 
        `<div class="df-node-box">
          <div class="df-node-box-header"><i class="fa-solid fa-message"></i> Mensagem</div>
          <input type="text" df-text placeholder="Texto da mensagem...">
        </div>`
      );
      break;
    case 'media':
      editor.addNode('media', 1, 1, pos_x, pos_y, 'media', {url: '', type: 'image'}, 
        `<div class="df-node-box">
          <div class="df-node-box-header"><i class="fa-solid fa-photo-film"></i> Mídia</div>
          <select df-type><option value="image">Imagem</option><option value="video">Vídeo</option><option value="audio">Áudio</option><option value="document">Documento</option></select>
          <input type="text" df-url placeholder="URL da mídia">
        </div>`
      );
      break;
    case 'wait_reply':
      editor.addNode('wait_reply', 1, 1, pos_x, pos_y, 'wait_reply', {variable_name: ''}, 
        `<div class="df-node-box">
          <div class="df-node-box-header"><i class="fa-solid fa-clock"></i> Aguardar Resposta</div>
          <input type="text" df-variable_name placeholder="Salvar em variável (opcional)">
        </div>`
      );
      break;
    case 'ai_message':
      editor.addNode('ai_message', 1, 1, pos_x, pos_y, 'ai_message', {prompt: ''}, 
        `<div class="df-node-box">
          <div class="df-node-box-header"><i class="fa-solid fa-robot"></i> Resposta IA</div>
          <input type="text" df-prompt placeholder="Instrução para a IA">
        </div>`
      );
      break;
    case 'human_transfer':
      editor.addNode('human_transfer', 1, 0, pos_x, pos_y, 'human_transfer', {}, 
        `<div class="df-node-box">
          <div class="df-node-box-header"><i class="fa-solid fa-user-headset"></i> Transf. Humano</div>
          <p style="margin:0; font-size:11px; color:#a1a1aa;">Encerra IA e chama equipe.</p>
        </div>`
      );
      break;
  }
}

function renderObjectivesChart(funnel) {
  const container = id('objectives-chart-container');
  if (!container) return;
  if (!funnel.length) {
    container.innerHTML = '<p style="color:var(--text-3); font-size:13px; text-align:center;">Aguardando dados de conversas...</p>';
    return;
  }
  const maxVal = Math.max(...funnel.map(f => f.count), 1);
  const colors = ['#6366f1','#818cf8','#a5b4fc','#c7d2fe','#e0e7ff'];
  container.innerHTML = `
    <svg viewBox="0 0 400 ${funnel.length * 46 + 20}" style="width:100%; font-family:Inter,sans-serif">
      ${funnel.map((f, i) => {
        const barW = Math.max(40, (f.count / maxVal) * 340);
        return `
          <g transform="translate(0, ${i * 46})">
            <text x="0" y="14" font-size="11" fill="#94a3b8">${escHtml(f.objective.slice(0, 36))}</text>
            <rect x="0" y="18" width="${barW}" height="20" fill="${colors[i % colors.length]}" rx="4" opacity="0.85"/>
            <text x="${barW + 8}" y="33" font-size="12" font-weight="700" fill="#f1f5f9">${f.count}</text>
          </g>`;
      }).join('')}
    </svg>`;
}

function renderStrategiesChart(dist) {
  const container = id('strategies-chart-container');
  if (!container) return;
  if (!dist.length) {
    container.innerHTML = '<p style="color:var(--text-3); font-size:13px; text-align:center;">Aguardando dados de conversas...</p>';
    return;
  }
  const colors = ['#6366f1','#a855f7','#3b82f6','#10b981','#f59e0b','#ef4444','#06b6d4'];
  const total = dist.reduce((s, d) => s + d.count, 0) || 1;
  const cx = 90, cy = 90, r = 72;
  let angle = -Math.PI / 2;
  const slices = dist.map((d, i) => {
    const frac = d.count / total;
    const start = angle;
    angle += frac * 2 * Math.PI;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = frac > 0.5 ? 1 : 0;
    return { d: d.strategy, count: d.count, pct: Math.round(frac * 100), color: colors[i % colors.length],
      path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z` };
  });

  container.innerHTML = `
    <div style="display:flex; align-items:center; gap:24px; width:100%">
      <svg viewBox="0 0 180 180" style="width:180px; flex-shrink:0">
        ${slices.map(s => `<path d="${s.path}" fill="${s.color}" opacity="0.9" stroke="var(--surface)" stroke-width="2"/>`).join('')}
      </svg>
      <div style="display:flex; flex-direction:column; gap:8px; flex:1; overflow:hidden">
        ${slices.map(s => `
          <div style="display:flex; align-items:center; gap:8px; font-size:12px;">
            <span style="width:10px; height:10px; border-radius:50%; background:${s.color}; flex-shrink:0;"></span>
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-2)">${escHtml(s.d)}</span>
            <span style="font-weight:700; color:var(--text-1)">${s.pct}%</span>
          </div>`).join('')}
      </div>
    </div>`;
}

// ============================================================
//   SETTINGS PAGE
// ============================================================
async function loadSettingsPage() {
  try {
    const user = await api.get('/auth/me').catch(() => state.user);
    if (user) {
      state.user = user;
      populateSidebarUser();

      if (id('settings-usage-tenants')) {
        id('settings-usage-tenants').textContent = `${user.tenantsUsed || state.tenants?.length || 1} / ${user.maxTenants || 1} workspaces`;
      }
      if (id('settings-usage-agents')) {
        id('settings-usage-agents').textContent = `${user.agentsUsed || 1} / ${user.maxAgentsPerTenant || 1} agentes`;
      }
      if (id('settings-status-badge')) {
        const badge = id('settings-status-badge');
        badge.textContent = user.status || 'ACTIVE';
        badge.className = `admin-badge ${user.status === 'ACTIVE' ? 'active' : 'suspended'}`;
      }
    }

    if (state.tenantId) {
      const cfg = await api.get(`/tenants/${state.tenantId}/sdr`).catch(() => null);
      if (cfg) {
        setSDRMode(cfg.sdrMode || 'ADVANCED', false);
      }
      await checkWhatsappStatus();
    }
  } catch (err) {
    console.error('[Settings] Load error:', err);
  }
}

async function changeUserPassword(e) {
  if (e) e.preventDefault();
  const currentPassword = (id('settings-current-password')?.value || '').trim();
  const newPassword = (id('settings-new-password')?.value || '').trim();
  const confirmPassword = (id('settings-confirm-password')?.value || '').trim();
  const btn = id('btn-submit-change-password');

  if (!currentPassword || !newPassword) {
    showToast('Por favor, preencha a senha atual e a nova senha.', 'warning');
    return;
  }

  if (newPassword.length < 6) {
    showToast('A nova senha deve ter no mínimo 6 caracteres.', 'warning');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('A nova senha e a confirmação não conferem.', 'warning');
    return;
  }

  const origBtnText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...';
  }

  try {
    const res = await api.post('/auth/change-password', {
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (res && res.success) {
      showToast('Senha alterada com sucesso!', 'success');
      id('form-change-password')?.reset();
    } else {
      showToast(res?.error || 'Erro ao alterar senha.', 'error');
    }
  } catch (err) {
    console.error('[ChangePassword] Error:', err);
    showToast(err.message || 'Falha ao atualizar senha. Verifique sua senha atual.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnText;
    }
  }
}

// ============================================================
//   HUMAN CORRECTION MODAL
// ============================================================
function openCorrectionModal(leadId, originalResponse, context) {
  state.correctionContext = { leadId, original: originalResponse, context };
  setText('correction-original-text', originalResponse);
  setText('correction-context-text', context || 'Contexto da conversa');
  id('correction-input').value = '';
  id('correction-feedback').value = '';
  id('modal-correction').style.display = 'flex';
}

async function submitCorrection(e) {
  e.preventDefault();
  const corrected = (id('correction-input')?.value || '').trim();
  const feedback  = (id('correction-feedback')?.value || '').trim();
  if (!corrected || !feedback) return;

  const { leadId, original, context } = state.correctionContext;
  try {
    await api.post('/corrections', {
      tenantId: state.tenantId,
      leadId,
      errorContext: context,
      originalResponse: original,
      correctedResponse: corrected,
      feedbackText: feedback,
    });
    closeModal('modal-correction');
    showToast('✅ Correção salva! O SDR aprenderá com esse feedback.', 'success');
  } catch (err) {
    alert('Erro ao salvar correção: ' + err.message);
  }
}

// ============================================================
//   NEW TENANT MODAL
// ============================================================
async function submitNewTenant(e) {
  e.preventDefault();
  const name = (id('tenant-name-input')?.value || '').trim();
  if (!name) return;
  try {
    await api.post('/tenants', { name });
    closeModal('modal-tenant');
    id('tenant-form').reset();
    await loadTenants();
    showToast('🏢 Empresa criada com sucesso!', 'success');
  } catch (err) {
    alert('Erro ao criar empresa: ' + err.message);
  }
}

// ============================================================
//   LEAD SEARCH
// ============================================================
function filterLeads(query) {
  if (!query) {
    renderLeads(state.leads);
    return;
  }
  const q = query.toLowerCase();
  renderLeads(state.leads.filter(l =>
    (l.name || '').toLowerCase().includes(q) ||
    (l.phone || '').toLowerCase().includes(q)
  ));
}

// ============================================================
//   INNER TABS (Training page)
// ============================================================
function setupInnerTabs() {
  document.querySelectorAll('.inner-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      const tabId = tab.dataset.innerTab;
      document.querySelectorAll('.inner-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.inner-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const content = id(tabId);
      if (content) content.classList.add('active');

      // Load data for the newly activated tab
      if (state.tenantId) {
        if (tabId === 'tab-playbooks')   await loadKnowledge();
        if (tabId === 'tab-corrections') await loadCorrections();
        if (tabId === 'tab-brain')       await loadBrainStats();
      }
    });
  });
}

// ============================================================
//   SIDEBAR TOGGLE
// ============================================================
function setupSidebar() {
  const sidebar = id('sidebar');
  const toggleBtn = id('toggle-sidebar');
  if (!sidebar || !toggleBtn) return;

  // Set title attributes for collapsed tooltips
  document.querySelectorAll('.nav-item').forEach(item => {
    const labelEl = item.querySelector('.nav-label');
    if (labelEl) item.title = labelEl.textContent.trim();
  });

  const collapsed = localStorage.getItem('sidebar_collapsed') === 'true';
  if (collapsed) sidebar.classList.add('collapsed');

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebar_collapsed', sidebar.classList.contains('collapsed'));
  });
}

// ============================================================
//   MODALS
// ============================================================
function closeModal(modalId) {
  const el = id(modalId);
  if (el) el.style.display = 'none';
}

function setupModals() {
  // Correction modal
  id('btn-close-correction')?.addEventListener('click', () => closeModal('modal-correction'));
  id('btn-cancel-correction')?.addEventListener('click', () => closeModal('modal-correction'));
  id('correction-form')?.addEventListener('submit', submitCorrection);

  // Tenant modal
  id('btn-close-tenant')?.addEventListener('click', () => closeModal('modal-tenant'));
  id('btn-cancel-tenant')?.addEventListener('click', () => closeModal('modal-tenant'));
  id('tenant-form')?.addEventListener('submit', submitNewTenant);
  id('btn-new-tenant')?.addEventListener('click', () => { id('modal-tenant').style.display = 'flex'; });

  // Close on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) backdrop.style.display = 'none';
    });
  });
}

// ============================================================
//   TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 28px; right: 28px; z-index: 9999;
    background: ${type === 'success' ? 'var(--success-dim)' : 'var(--danger-dim)'};
    border: 1px solid ${type === 'success' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'};
    color: ${type === 'success' ? 'var(--success)' : 'var(--danger)'};
    padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 500;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    animation: slideInRight 0.3s ease;
    backdrop-filter: blur(12px);
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Add toast animations to page
const toastStyles = document.createElement('style');
toastStyles.textContent = `
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; transform: translateY(10px); }
  }
`;
document.head.appendChild(toastStyles);

// ============================================================
//   UTILITY
// ============================================================
function formatTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function formatDate(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// ============================================================
//   MAIN INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {

  // Setup sidebar
  setupSidebar();

  // Setup sidebar navigation
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  // Setup inner tabs (training)
  setupInnerTabs();

  // Setup modals
  setupModals();

  // Setup forms
  id('sdr-config-form')?.addEventListener('submit', saveAgentConfig);
  id('knowledge-form')?.addEventListener('submit', addKnowledge);
  id('media-form')?.addEventListener('submit', handleMediaFormSubmit);

  // Login form
  id('login-form')?.addEventListener('submit', e => {
    e.preventDefault();
    doLogin(id('login-email').value, id('login-password').value);
  });

  // Register form
  id('register-form')?.addEventListener('submit', e => {
    e.preventDefault();
    doRegister(id('register-name').value, id('register-email').value, id('register-password').value);
  });

  // Logout
  id('btn-logout')?.addEventListener('click', logout);

  // Lead search
  id('lead-search')?.addEventListener('input', e => filterLeads(e.target.value));

  // Browser back/forward
  window.addEventListener('popstate', () => {
    const hash = location.hash.replace('#', '');
    if (hash) navigate(hash);
  });

  // Check auth and show correct screen
  
  const isAuth = await checkAuth();
  if (isAuth) {
    if (state.user && state.user.role === 'ADMIN') {
      const navAdmin = document.getElementById('nav-admin');
      if (navAdmin) navAdmin.style.display = 'flex';
    }
    showApp();

  } else {
    document.getElementById('auth-screen').style.display = 'grid';
  }

  // Pulse refresh for conversations (every 30s)
  setInterval(async () => {
    if (state.currentPage === 'conversations' && state.tenantId) {
      await loadLeads();
      if (state.selectedLeadId) await loadMessages(state.selectedLeadId);
    }
  }, 30000);
});


// ============================================================
//   HUMAN ADVANCED FEATURES
// ==========================================

async function triggerFollowUpCron() {
  if (!state.tenantId) return;
  const btn = event.currentTarget;
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Disparando...';
  btn.disabled = true;
  
  try {
    const res = await api.post('/tenants/' + state.tenantId + '/cron/follow-up');
    if (res && res.success) {
      showToast('Follow-ups enviados: ' + (res.sent ?? res.processed ?? 0), 'success');
    }
  } catch(e) {
    showToast('Erro no CRON', 'error');
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btnPause = document.getElementById('btn-pause-ai');
  if (btnPause) {
    btnPause.addEventListener('click', async () => {
      if (!currentChatLeadId) return;
      const isPaused = btnPause.classList.contains('active-pause');
      const newState = !isPaused; // toggle
      
      btnPause.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        await api.put('/tenants/' + state.tenantId + '/leads/' + currentChatLeadId + '/pause', { paused: newState });
        
        if (newState) {
          btnPause.classList.add('active-pause');
          btnPause.classList.remove('btn-danger-outline');
          btnPause.classList.add('btn-danger');
          btnPause.innerHTML = '<i class="fa-solid fa-play"></i> Retomar IA';
          showToast('IA pausada. Você assumiu o controle.', 'success');
        } else {
          btnPause.classList.remove('active-pause');
          btnPause.classList.remove('btn-danger');
          btnPause.classList.add('btn-danger-outline');
          btnPause.innerHTML = '<i class="fa-solid fa-hand-paper"></i> Pausar IA';
          showToast('IA retomou o controle deste Lead.', 'success');
        }
      } catch (e) {
        showToast('Erro ao pausar IA', 'error');
        btnPause.innerHTML = 'Erro';
      }
    });
  }
});

// ============================================================
//   ADMIN MASTER PAGE
// ============================================================
let allAdminUsers = [];

function toggleAIProviderUI(provider) {
  const isGemini = provider === 'GEMINI';
  const cardGemini = id('card-provider-gemini');
  const cardOpenai = id('card-provider-openai');

  if (cardGemini) cardGemini.classList.toggle('active', isGemini);
  if (cardOpenai) cardOpenai.classList.toggle('active', !isGemini);

  const radioGemini = id('radio-provider-gemini');
  const radioOpenai = id('radio-provider-openai');
  if (radioGemini) radioGemini.checked = isGemini;
  if (radioOpenai) radioOpenai.checked = !isGemini;
}

async function loadAdminAISettings() {
  try {
    const settings = await api.get('/admin/settings');
    if (!settings) return;

    const provider = (settings.aiProvider || 'GEMINI').toUpperCase();
    toggleAIProviderUI(provider);

    // Update active provider stats card
    const activeProviderName = provider === 'OPENAI' ? 'OpenAI (ChatGPT)' : 'Google Gemini';
    const activeModelName = provider === 'OPENAI' ? (settings.openaiModel || 'gpt-4o-mini') : (settings.geminiModel || 'gemini-2.5-flash');
    if (id('admin-stat-active-provider')) id('admin-stat-active-provider').textContent = activeProviderName;
    if (id('admin-stat-provider-model')) id('admin-stat-provider-model').innerHTML = `<i class="fa-solid fa-circle-check"></i> ${activeModelName}`;

    // Gemini inputs
    if (id('admin-gemini-key')) {
      id('admin-gemini-key').placeholder = settings.hasGeminiKey ? `Chave configurada: ${settings.geminiApiKey || '******'}` : 'Insira a API Key do Google AI Studio';
    }
    if (id('admin-gemini-model') && settings.geminiModel) {
      id('admin-gemini-model').value = settings.geminiModel;
    }
    if (id('gemini-status-tag')) {
      const tag = id('gemini-status-tag');
      tag.textContent = settings.hasGeminiKey ? 'Chave Ativa' : 'Sem Chave';
      tag.className = `badge-tag ${settings.hasGeminiKey ? 'tag-pro' : 'tag-free'}`;
    }

    // OpenAI inputs
    if (id('admin-openai-key')) {
      id('admin-openai-key').placeholder = settings.hasOpenaiKey ? `Chave configurada: ${settings.openaiApiKey || '******'}` : 'sk-proj-...';
    }
    if (id('admin-openai-model') && settings.openaiModel) {
      id('admin-openai-model').value = settings.openaiModel;
    }
    if (id('openai-status-tag')) {
      const tag = id('openai-status-tag');
      tag.textContent = settings.hasOpenaiKey ? 'Chave Ativa' : 'Sem Chave';
      tag.className = `badge-tag ${settings.hasOpenaiKey ? 'tag-pro' : 'tag-free'}`;
    }
  } catch (err) {
    console.error('[Admin] Error loading AI settings:', err);
  }
}

async function saveAdminAISettings(e) {
  if (e) e.preventDefault();
  const btn = id('btn-save-ai-settings');
  const origBtnText = btn ? btn.innerHTML : '';

  const provider = id('radio-provider-openai')?.checked ? 'OPENAI' : 'GEMINI';
  const geminiKey = id('admin-gemini-key')?.value.trim();
  const geminiModel = id('admin-gemini-model')?.value;
  const openaiKey = id('admin-openai-key')?.value.trim();
  const openaiModel = id('admin-openai-model')?.value;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
  }

  try {
    const payload = {
      aiProvider: provider,
      geminiModel,
      openaiModel,
    };
    if (geminiKey) payload.geminiApiKey = geminiKey;
    if (openaiKey) payload.openaiApiKey = openaiKey;

    const res = await api.post('/admin/settings', payload);
    if (res && res.success) {
      showToast('Configurações de IA salvas com sucesso!', 'success');
      if (id('admin-gemini-key')) id('admin-gemini-key').value = '';
      if (id('admin-openai-key')) id('admin-openai-key').value = '';
      await loadAdminAISettings();
    } else {
      showToast(res?.error || 'Erro ao salvar configurações de IA.', 'error');
    }
  } catch (err) {
    console.error('[Admin] Save AI settings error:', err);
    showToast('Falha ao salvar configurações de IA.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnText;
    }
  }
}

async function testAdminAIConnection() {
  const btn = id('btn-test-ai-conn');
  const statusEl = id('ai-test-status');
  const provider = id('radio-provider-openai')?.checked ? 'OPENAI' : 'GEMINI';
  const apiKey = provider === 'OPENAI' ? id('admin-openai-key')?.value.trim() : id('admin-gemini-key')?.value.trim();
  const model = provider === 'OPENAI' ? id('admin-openai-model')?.value : id('admin-gemini-model')?.value;

  const origBtnText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testando...';
  }
  if (statusEl) {
    statusEl.innerHTML = `<span style="color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Testando resposta de ${provider}...</span>`;
  }

  try {
    const res = await api.post('/admin/test-ai', {
      provider,
      apiKey: apiKey || undefined,
      model,
    });

    if (res && res.success) {
      showToast(res.message, 'success');
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:var(--success); font-weight:600;"><i class="fa-solid fa-circle-check"></i> ${res.message}</span>`;
      }
    } else {
      showToast(res?.message || 'Falha no teste de conexão.', 'error');
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:var(--danger); font-weight:600;"><i class="fa-solid fa-circle-xmark"></i> ${res?.message || 'Falha no teste.'}</span>`;
      }
    }
  } catch (err) {
    console.error('[Admin] Test AI connection error:', err);
    showToast('Erro ao testar conexão com IA.', 'error');
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--danger); font-weight:600;"><i class="fa-solid fa-circle-xmark"></i> Erro: ${err.message || 'Falha'}</span>`;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnText;
    }
  }
}

async function loadAdminPage() {
  const tbody = id('admin-users-table-body');
  if (!tbody) return;

  try {
    // 1. Load Admin Stats & Global AI Settings
    await loadAdminAISettings();

    const stats = await api.get('/admin/stats');
    if (stats) {
      if (id('admin-stat-users')) id('admin-stat-users').textContent = stats.totalUsers || 0;
      if (id('admin-stat-tenants')) id('admin-stat-tenants').textContent = stats.totalTenants || 0;
      if (id('admin-stat-agents')) id('admin-stat-agents').textContent = stats.totalAgents || 0;
    }

    // 2. Load Users
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:30px;" class="text-muted">
          <i class="fa-solid fa-circle-notch fa-spin"></i> Carregando usuários...
        </td>
      </tr>
    `;

    allAdminUsers = await api.get('/admin/users');
    renderAdminUsers(allAdminUsers || []);
  } catch(e) {
    console.error('Admin load error:', e);
    showToast('Erro ao carregar dados do painel administrativo', 'error');
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:30px; color:var(--danger);">
          <i class="fa-solid fa-triangle-exclamation"></i> Falha ao carregar lista de usuários.
        </td>
      </tr>
    `;
  }
}

function renderAdminUsers(users) {
  const tbody = id('admin-users-table-body');
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:30px;" class="text-muted">
          Nenhum usuário encontrado.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    const isSelf = state.user && state.user.id === u.id;
    const tenantsList = (u.tenants && u.tenants.length > 0)
      ? `<div class="admin-tenant-tags">${u.tenants.map(t => `<span class="admin-tenant-tag"><i class="fa-solid fa-building"></i> ${escHtml(t.name)}</span>`).join('')}</div>`
      : `<span class="text-muted" style="font-size:11px;">Nenhum</span>`;

    tr.innerHTML = `
      <td>
        <div class="admin-user-cell">
          <span class="admin-user-name">${escHtml(u.name)} ${isSelf ? '<span class="admin-badge admin" style="margin-left:4px;">(Você)</span>' : ''}</span>
          <span class="admin-user-email">${escHtml(u.email)}</span>
        </div>
      </td>
      <td>
        <select class="admin-select-sm" id="admin-role-${u.id}">
          <option value="USER" ${u.role === 'USER' ? 'selected' : ''}>USER</option>
          <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
        </select>
      </td>
      <td>
        <select class="admin-select-sm" id="admin-plan-${u.id}">
          <option value="free" ${u.plan === 'free' ? 'selected' : ''}>Free</option>
          <option value="pro" ${u.plan === 'pro' ? 'selected' : ''}>Pro</option>
          <option value="enterprise" ${u.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
        </select>
      </td>
      <td>
        <input type="number" class="admin-input-sm admin-input-number" id="admin-max-tenants-${u.id}" min="1" max="100" value="${u.maxTenants || 1}">
      </td>
      <td>
        <input type="number" class="admin-input-sm admin-input-number" id="admin-max-agents-${u.id}" min="1" max="100" value="${u.maxAgentsPerTenant || 1}">
      </td>
      <td>
        <select class="admin-select-sm" id="admin-status-${u.id}">
          <option value="ACTIVE" ${u.status === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option>
          <option value="SUSPENDED" ${u.status === 'SUSPENDED' ? 'selected' : ''}>SUSPENDED</option>
        </select>
      </td>
      <td>${tenantsList}</td>
      <td>
        <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
          <button class="btn-outline-sm" onclick="saveUserAdminRow('${u.id}')" title="Salvar configurações deste usuário">
            <i class="fa-solid fa-floppy-disk"></i> Salvar
          </button>
          ${!isSelf ? `
            <button class="btn-danger-outline" style="padding:4px 8px; font-size:11px;" onclick="deleteUserAdmin('${u.id}', '${escAttr(u.name)}')" title="Excluir conta e dados associados">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterAdminUsers(query) {
  if (!allAdminUsers) return;
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    renderAdminUsers(allAdminUsers);
    return;
  }
  const filtered = allAdminUsers.filter(u =>
    (u.name && u.name.toLowerCase().includes(q)) ||
    (u.email && u.email.toLowerCase().includes(q))
  );
  renderAdminUsers(filtered);
}

async function saveUserAdminRow(userId) {
  const roleEl = id(`admin-role-${userId}`);
  const planEl = id(`admin-plan-${userId}`);
  const maxTenantsEl = id(`admin-max-tenants-${userId}`);
  const maxAgentsEl = id(`admin-max-agents-${userId}`);
  const statusEl = id(`admin-status-${userId}`);

  if (!roleEl || !planEl || !maxTenantsEl || !maxAgentsEl || !statusEl) return;

  const payload = {
    role: roleEl.value,
    plan: planEl.value,
    maxTenants: Number(maxTenantsEl.value) || 1,
    maxAgentsPerTenant: Number(maxAgentsEl.value) || 1,
    status: statusEl.value,
  };

  try {
    await api.put(`/admin/users/${userId}`, payload);
    showToast('Usuário e limites atualizados com sucesso!', 'success');
    
    // Update local cache
    const cached = allAdminUsers.find(u => u.id === userId);
    if (cached) {
      Object.assign(cached, payload);
    }
  } catch(e) {
    showToast('Erro ao atualizar usuário: ' + (e.message || ''), 'error');
  }
}

function openAdminCreateUserModal() {
  const modal = id('modal-admin-user');
  if (modal) {
    modal.style.display = 'flex';
    id('admin-new-name').value = '';
    id('admin-new-email').value = '';
    id('admin-new-password').value = '';
    id('admin-new-role').value = 'USER';
    id('admin-new-plan').value = 'free';
    id('admin-new-max-tenants').value = '1';
    id('admin-new-max-agents').value = '1';
    id('admin-new-status').value = 'ACTIVE';
    id('admin-new-name').focus();
  }
}

function closeAdminCreateUserModal() {
  const modal = id('modal-admin-user');
  if (modal) modal.style.display = 'none';
}

async function submitAdminCreateUser(e) {
  e.preventDefault();
  const name = id('admin-new-name').value.trim();
  const email = id('admin-new-email').value.trim();
  const password = id('admin-new-password').value;
  const role = id('admin-new-role').value;
  const plan = id('admin-new-plan').value;
  const maxTenants = Number(id('admin-new-max-tenants').value) || 1;
  const maxAgentsPerTenant = Number(id('admin-new-max-agents').value) || 1;
  const status = id('admin-new-status').value;

  if (!name || !email || !password) {
    showToast('Preencha os campos obrigatórios.', 'error');
    return;
  }

  try {
    await api.post('/admin/users', {
      name,
      email,
      password,
      role,
      plan,
      maxTenants,
      maxAgentsPerTenant,
      status,
    });

    showToast(`Usuário "${name}" cadastrado com sucesso!`, 'success');
    closeAdminCreateUserModal();
    await loadAdminPage();
  } catch(err) {
    showToast('Erro ao criar usuário: ' + (err.message || ''), 'error');
  }
}

async function deleteUserAdmin(userId, userName) {
  if (!confirm(`Tem certeza que deseja excluir a conta de "${userName}"?\n\nEssa ação é irreversível e excluirá todas as empresas, agentes, leads e conversas deste usuário.`)) {
    return;
  }

  try {
    await api.del(`/admin/users/${userId}`);
    showToast(`Usuário "${userName}" excluído com sucesso.`, 'success');
    await loadAdminPage();
  } catch(e) {
    showToast('Erro ao excluir usuário: ' + (e.message || ''), 'error');
  }
}


// ============================================================
//   WHATSAPP EVOLUTION API LOGIC (SINGLE INSTANCE PER COMPANY)
// ============================================================
state.whatsapp = {
  connected: false,
  state: 'close',
  instanceName: '',
  phone: null,
  profileName: null,
};

let qrPollInterval = null;

async function checkWhatsappStatus(quiet = true) {
  if (!state.tenantId) return;
  try {
    const res = await api.get(`/tenants/${state.tenantId}/whatsapp/status`);
    if (res) {
      state.whatsapp = {
        connected: !!res.connected,
        state: res.state || (res.connected ? 'open' : 'close'),
        instanceName: res.instanceName || `tenant-${state.tenantId}`,
        phone: res.phone || null,
        profileName: res.profileName || null,
      };
      updateWhatsappUI();
    }
  } catch (err) {
    if (!quiet) console.warn('[WhatsApp] Status check error:', err);
  }
}

function updateWhatsappUI() {
  const isConnected = state.whatsapp?.connected;
  const phone = state.whatsapp?.phone;

  // 1. Topbar WhatsApp Pill
  const pill = id('topbar-wp-pill');
  const dot = id('topbar-wp-dot');
  const label = id('topbar-wp-label');
  if (pill && dot && label) {
    pill.classList.remove('connected', 'disconnected', 'connecting');
    dot.classList.remove('connected', 'disconnected', 'connecting');

    if (isConnected) {
      pill.classList.add('connected');
      dot.classList.add('connected');
      label.textContent = phone ? `WhatsApp (${phone.slice(-4)})` : 'WhatsApp Online';
      pill.setAttribute('title', `WhatsApp Conectado (${state.whatsapp.instanceName}). Clique para gerenciar em Configurações.`);
    } else {
      pill.classList.add('disconnected');
      dot.classList.add('disconnected');
      label.textContent = 'WhatsApp Offline';
      pill.setAttribute('title', 'WhatsApp Desconectado. Clique para escanear o QR Code.');
    }
  }

  // 2. Settings Page WhatsApp Card
  const badge = id('wp-connection-badge');
  const infoBox = id('wp-instance-info');
  const instanceNameEl = id('wp-instance-name');
  const phoneEl = id('wp-phone-number');
  const btnConnect = id('btn-connect-wp');
  const btnDisconnect = id('btn-disconnect-wp');

  if (badge) {
    if (isConnected) {
      badge.className = 'admin-badge active';
      badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> CONECTADO (Online)';
    } else {
      badge.className = 'admin-badge suspended';
      badge.innerHTML = '<i class="fa-solid fa-circle-dot"></i> Desconectado';
    }
  }

  if (infoBox) {
    if (isConnected) {
      infoBox.style.display = 'block';
      if (instanceNameEl) instanceNameEl.textContent = state.whatsapp.instanceName || `tenant-${state.tenantId}`;
      if (phoneEl) phoneEl.textContent = phone ? `• Número: +${phone}` : '• Instância Ativa';
    } else {
      infoBox.style.display = 'none';
    }
  }

  if (btnConnect) {
    if (isConnected) {
      btnConnect.className = 'btn-outline-sm';
      btnConnect.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Trocar / Reconectar';
    } else {
      btnConnect.className = 'btn-accent';
      btnConnect.innerHTML = '<i class="fa-solid fa-qrcode"></i> Conectar WhatsApp';
    }
  }

  if (btnDisconnect) {
    btnDisconnect.style.display = isConnected ? 'inline-flex' : 'none';
  }
}

function handleTopbarWpClick() {
  if (state.whatsapp?.connected) {
    navigate('settings');
  } else {
    openWhatsappModal();
  }
}

function openWhatsappModal() {
  if (!state.tenantId) {
    showToast('Selecione uma empresa antes de conectar o WhatsApp.', 'error');
    return;
  }

  const modal = id('modal-whatsapp');
  if (!modal) return;

  modal.style.display = 'flex';
  id('qr-loader').style.display = 'block';
  id('qr-image').style.display = 'none';
  id('qr-status').innerText = 'Gerando QR Code para esta empresa...';
  id('qr-status').style.color = 'var(--text-muted)';

  // Initial QR fetch
  fetchQrCode();

  // Clear any existing timer
  if (qrPollInterval) clearInterval(qrPollInterval);

  // Poll connection state every 2.5s while modal is open
  qrPollInterval = setInterval(async () => {
    try {
      const res = await api.get(`/tenants/${state.tenantId}/whatsapp/status`);
      if (res && res.connected) {
        // Connected!
        clearInterval(qrPollInterval);
        qrPollInterval = null;

        state.whatsapp = {
          connected: true,
          state: 'open',
          instanceName: res.instanceName || `tenant-${state.tenantId}`,
          phone: res.phone || null,
          profileName: res.profileName || null,
        };

        const statusText = id('qr-status');
        const qrImg = id('qr-image');
        const loader = id('qr-loader');

        if (statusText) {
          statusText.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--success); font-size:24px; display:block; margin-bottom:8px;"></i> WhatsApp Conectado com Sucesso!';
          statusText.style.color = 'var(--success)';
        }
        if (loader) loader.style.display = 'none';
        if (qrImg) qrImg.style.display = 'none';

        updateWhatsappUI();
        showToast('WhatsApp conectado com sucesso! Instância única ativada.', 'success');

        setTimeout(() => {
          closeWhatsappModal();
        }, 1500);
      }
    } catch (e) {
      console.warn('[WhatsApp] Polling check error:', e);
    }
  }, 2500);
}

function closeWhatsappModal() {
  const modal = id('modal-whatsapp');
  if (modal) modal.style.display = 'none';
  if (qrPollInterval) {
    clearInterval(qrPollInterval);
    qrPollInterval = null;
  }
}

async function fetchQrCode() {
  try {
    const res = await api.get(`/tenants/${state.tenantId}/whatsapp/qr`);
    const statusText = id('qr-status');
    const qrImg = id('qr-image');
    const loader = id('qr-loader');

    if (res.status === 'CONNECTED') {
      state.whatsapp.connected = true;
      if (statusText) {
        statusText.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--success); font-size:24px; display:block; margin-bottom:8px;"></i> Aparelho Já Conectado!';
        statusText.style.color = 'var(--success)';
      }
      if (loader) loader.style.display = 'none';
      if (qrImg) qrImg.style.display = 'none';

      updateWhatsappUI();
      if (qrPollInterval) {
        clearInterval(qrPollInterval);
        qrPollInterval = null;
      }
      setTimeout(closeWhatsappModal, 1500);
      return;
    }

    if (res.base64) {
      if (qrImg) {
        qrImg.src = res.base64;
        qrImg.style.display = 'block';
      }
      if (loader) loader.style.display = 'none';
      if (statusText) {
        statusText.innerText = 'Escaneie o QR Code com seu WhatsApp (Apenas 1 aparelho por empresa)';
        statusText.style.color = 'var(--text-muted)';
      }
    }
  } catch (err) {
    console.error('[WhatsApp] QR fetch error:', err);
    const statusText = id('qr-status');
    const loader = id('qr-loader');
    if (statusText) {
      statusText.innerText = 'Erro ao buscar QR Code. Verifique a Evolution API.';
      statusText.style.color = 'var(--danger)';
    }
    if (loader) loader.style.display = 'none';
  }
}

async function disconnectWhatsapp() {
  if (!confirm('Tem certeza que deseja desconectar o WhatsApp desta empresa?\n\nO atendimento automático por este número será pausado até uma nova reconexão.')) {
    return;
  }

  try {
    await api.del(`/tenants/${state.tenantId}/whatsapp/disconnect`);
    state.whatsapp = { connected: false, state: 'close', instanceName: `tenant-${state.tenantId}`, phone: null, profileName: null };
    updateWhatsappUI();
    showToast('Aparelho WhatsApp desconectado com sucesso.', 'info');
  } catch(e) {
    showToast('Erro ao desconectar aparelho: ' + (e.message || ''), 'error');
  }
}


async function deleteKnowledge(id) {
  if (!confirm('Tem certeza que deseja excluir este Playbook? Essa ação não pode ser desfeita.')) return;
  
  try {
    await api.del('/tenants/' + state.tenantId + '/knowledge/' + id);
    showToast('Playbook excluído com sucesso.', 'success');
    loadKnowledge();
    
  } catch (err) {
    showToast('Erro ao excluir playbook.', 'error');
  }
}

// ============================================================
//   LEADS & CONTACTS MANAGEMENT
// ============================================================
state.leadsList = [];
state.leadsFilterStatus = 'ALL';
state.leadsFilterTag = 'ALL';
state.leadsSearchQuery = '';
state.modalTags = [];

async function loadLeadsPage() {
  if (!state.tenantId) {
    await loadTenants();
  }
  if (!state.tenantId) return;

  const tbody = id('leads-table-body');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-20 text-muted"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando lista de leads...</td></tr>';
  }

  try {
    // 1. Fetch leads, all leads for counts, and tags in parallel
    const queryParams = new URLSearchParams();
    if (state.leadsSearchQuery) queryParams.append('search', state.leadsSearchQuery);
    if (state.leadsFilterStatus && state.leadsFilterStatus !== 'ALL') queryParams.append('status', state.leadsFilterStatus);
    if (state.leadsFilterTag && state.leadsFilterTag !== 'ALL') queryParams.append('tag', state.leadsFilterTag);

    const qs = queryParams.toString();
    const leadsUrl = `/tenants/${state.tenantId}/leads${qs ? '?' + qs : ''}`;

    const [leads, allLeads, tags] = await Promise.all([
      api.get(leadsUrl).catch(err => {
        console.warn('[Leads] Filtered leads fetch fallback:', err);
        return [];
      }),
      api.get(`/tenants/${state.tenantId}/leads`).catch(err => {
        console.warn('[Leads] All leads fetch fallback:', err);
        return [];
      }),
      api.get(`/tenants/${state.tenantId}/leads/tags`).catch(() => [])
    ]);

    state.leadsList = Array.isArray(leads) ? leads : [];
    const validAllLeads = Array.isArray(allLeads) ? allLeads : (state.leadsList.length > 0 ? state.leadsList : []);

    // 2. Update status tabs counters
    const counts = { ALL: validAllLeads.length, NEW: 0, ACTIVE: 0, QUALIFIED: 0, DISQUALIFIED: 0, HANDOFF: 0 };
    validAllLeads.forEach(l => {
      if (l && counts[l.status] !== undefined) counts[l.status]++;
    });
    setText('count-status-all', String(counts.ALL));
    setText('count-status-new', String(counts.NEW));
    setText('count-status-active', String(counts.ACTIVE));
    setText('count-status-qualified', String(counts.QUALIFIED));
    setText('count-status-disqualified', String(counts.DISQUALIFIED));
    setText('count-status-handoff', String(counts.HANDOFF));

    // 3. Update stats summary
    const totalCount = state.leadsList.length;
    const qualifiedCount = counts.QUALIFIED;
    const summaryEl = id('leads-count-summary');
    if (summaryEl) {
      summaryEl.innerHTML = `Exibindo <strong>${totalCount}</strong> lead(s) filtrado(s) &bull; Total de <strong>${qualifiedCount}</strong> qualificado(s)`;
    }

    // 4. Update sidebar badge
    const badgeEl = id('nav-leads-badge');
    if (badgeEl) {
      badgeEl.textContent = validAllLeads.length;
      badgeEl.style.display = validAllLeads.length > 0 ? 'inline-block' : 'none';
    }

    // 5. Update tags filter dropdown
    renderLeadsTagFilterOptions(tags || []);

    // 6. Render table
    renderLeadsTable(state.leadsList);
  } catch (err) {
    console.error('[Leads] Error loading leads:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-20 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Erro ao carregar leads da empresa: ${escapeHtml(err.message || 'Falha na requisição')}</td></tr>`;
    }
  }
}

function handleLeadsStatusTab(status) {
  document.querySelectorAll('.status-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.statusTab === status);
  });
  const statusSelect = id('leads-filter-status');
  if (statusSelect) statusSelect.value = status;
  state.leadsFilterStatus = status;
  loadLeadsPage();
}

async function restartLeadAI(leadId) {
  try {
    await api.put(`/tenants/${state.tenantId}/leads/${leadId}`, {
      status: 'ACTIVE',
      botPaused: false
    });
    showToast('Atendimento automático da IA reativado para este lead!', 'success');
    await loadLeadsPage();
  } catch(err) {
    showToast('Erro ao reativar IA: ' + err.message, 'error');
  }
}

function renderLeadsTagFilterOptions(tags) {
  const select = id('leads-filter-tag');
  if (!select) return;

  const currentVal = state.leadsFilterTag || 'ALL';
  select.innerHTML = '<option value="ALL">Todas as Tags</option>';
  tags.forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag;
    opt.textContent = `#${tag}`;
    if (tag === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

function renderLeadsTable(leads) {
  const tbody = id('leads-table-body');
  if (!tbody) return;

  if (!leads || leads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:48px 20px;">
          <div style="font-size:36px; opacity:0.3; margin-bottom:8px;"><i class="fa-solid fa-users-slash"></i></div>
          <p style="color:var(--text-1); font-weight:600; margin-bottom:4px;">Nenhum lead encontrado</p>
          <p class="text-muted" style="font-size:13px; margin-bottom:16px;">Não há leads cadastrados ou correspondentes aos filtros aplicados.</p>
          <button class="btn-sm-accent" onclick="openCreateLeadModal()"><i class="fa-solid fa-plus"></i> Cadastrar Primeiro Lead</button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';

  leads.forEach(lead => {
    const tr = document.createElement('tr');

    // Tags Chips
    const tags = Array.isArray(lead.tags) ? lead.tags : [];
    const tagsHtml = tags.length > 0
      ? `<div class="tag-chips-list">${tags.map(t => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}</div>`
      : '<span class="text-muted" style="font-size:11px;">Sem tags</span>';

    // Custom Fields
    let customFields = {};
    try {
      if (typeof lead.customFields === 'string') customFields = JSON.parse(lead.customFields);
      else if (lead.customFields) customFields = lead.customFields;
    } catch(e) {}

    const fieldKeys = Object.keys(customFields || {});
    let customFieldsHtml = '<span class="text-muted" style="font-size:11px;">–</span>';
    if (fieldKeys.length > 0) {
      customFieldsHtml = `<div class="custom-fields-preview">` +
        fieldKeys.slice(0, 3).map(k => `<span class="field-preview-badge"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(customFields[k]))}</span>`).join('') +
        (fieldKeys.length > 3 ? `<span class="field-preview-badge">+${fieldKeys.length - 3}</span>` : '') +
        `</div>`;
    }

    // Status Badge
    const statusLabels = {
      NEW: 'Novo',
      ACTIVE: 'Em Atendimento',
      QUALIFIED: 'Qualificado (Concluído)',
      DISQUALIFIED: 'Desqualificado',
      HANDOFF: 'Atendimento Humano'
    };
    const statusClass = lead.status || 'NEW';
    const statusLabel = statusLabels[statusClass] || statusClass;

    // Date
    const dateStr = lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '–';

    tr.innerHTML = `
      <td>
        <div class="lead-contact-info">
          <span class="lead-name">${escapeHtml(lead.name || 'Sem nome')}</span>
          <span class="lead-phone"><i class="fa-brands fa-whatsapp" style="color:var(--success);"></i> +${escapeHtml(lead.phone)}</span>
          ${lead.email ? `<span class="lead-email"><i class="fa-solid fa-envelope"></i> ${escapeHtml(lead.email)}</span>` : ''}
        </div>
      </td>
      <td>
        <span class="lead-status-badge ${statusClass}">
          <i class="fa-solid fa-circle" style="font-size:6px;"></i> ${statusLabel}
        </span>
      </td>
      <td>${tagsHtml}</td>
      <td>${customFieldsHtml}</td>
      <td><span class="text-muted" style="font-size:12px;">${dateStr}</span></td>
      <td>
        <div class="actions-cell">
          <button class="action-btn-tbl" title="Abrir Conversa" onclick="openLeadChat('${lead.id}')">
            <i class="fa-solid fa-comments"></i>
          </button>
          ${lead.status === 'QUALIFIED' ? `
            <button class="action-btn-tbl" style="color:var(--accent-light);" title="Reiniciar Atendimento da IA para este Lead" onclick="restartLeadAI('${lead.id}')">
              <i class="fa-solid fa-rotate-left"></i>
            </button>
          ` : ''}
          <button class="action-btn-tbl" title="Editar Lead & Tags" onclick="openEditLeadModal('${lead.id}')">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="action-btn-tbl delete" title="Excluir Lead" onclick="deleteLeadItem('${lead.id}', '${escapeHtml(lead.name || lead.phone)}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

function handleLeadsSearch(val) {
  state.leadsSearchQuery = val;
  clearTimeout(window._leadsSearchTimer);
  window._leadsSearchTimer = setTimeout(() => {
    loadLeadsPage();
  }, 350);
}

function handleLeadsStatusFilter(val) {
  state.leadsFilterStatus = val;
  loadLeadsPage();
}

function handleLeadsTagFilter(val) {
  state.leadsFilterTag = val;
  loadLeadsPage();
}

function openCreateLeadModal() {
  state.currentEditingLeadId = null;
  state.modalTags = [];

  id('modal-lead-title').innerHTML = '<i class="fa-solid fa-user-plus" style="color:var(--accent);"></i> Novo Lead';
  id('lead-edit-id').value = '';
  id('lead-form-name').value = '';
  id('lead-form-phone').value = '';
  id('lead-form-email').value = '';
  id('lead-form-status').value = 'NEW';
  id('lead-form-notes').value = '';
  id('lead-new-tag-input').value = '';

  renderModalTags();
  renderCustomFieldRows({});

  id('modal-lead-details').style.display = 'flex';
}

async function openEditLeadModal(leadId) {
  state.currentEditingLeadId = leadId;
  
  try {
    const lead = await api.get(`/tenants/${state.tenantId}/leads/${leadId}`);
    if (!lead) {
      showToast('Lead não encontrado', 'error');
      return;
    }

    id('modal-lead-title').innerHTML = '<i class="fa-solid fa-user-pen" style="color:var(--accent);"></i> Editar Lead';
    id('lead-edit-id').value = lead.id;
    id('lead-form-name').value = lead.name || '';
    id('lead-form-phone').value = lead.phone || '';
    id('lead-form-email').value = lead.email || '';
    id('lead-form-status').value = lead.status || 'NEW';
    id('lead-form-notes').value = lead.notes || '';
    id('lead-new-tag-input').value = '';

    state.modalTags = Array.isArray(lead.tags) ? [...lead.tags] : [];
    renderModalTags();

    let customFields = {};
    try {
      if (typeof lead.customFields === 'string') customFields = JSON.parse(lead.customFields);
      else if (lead.customFields) customFields = lead.customFields;
    } catch(e) {}
    renderCustomFieldRows(customFields);

    id('modal-lead-details').style.display = 'flex';
  } catch (err) {
    showToast('Erro ao carregar detalhes do lead', 'error');
    console.error(err);
  }
}

function closeLeadModal() {
  id('modal-lead-details').style.display = 'none';
}

function renderModalTags() {
  const container = id('lead-tags-chips');
  if (!container) return;

  container.innerHTML = '';
  state.modalTags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `#${escapeHtml(tag)} <i class="fa-solid fa-xmark tag-remove" onclick="removeTagChip('${escapeHtml(tag)}')"></i>`;
    container.appendChild(chip);
  });
}

function addTagChip(tag) {
  const cleanTag = tag.trim().replace(/^#/, '');
  if (!cleanTag) return;
  if (!state.modalTags.includes(cleanTag)) {
    state.modalTags.push(cleanTag);
    renderModalTags();
  }
}

function removeTagChip(tag) {
  state.modalTags = state.modalTags.filter(t => t !== tag);
  renderModalTags();
}

function handleTagInputKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addCurrentTagInput();
  }
}

function addCurrentTagInput() {
  const input = id('lead-new-tag-input');
  if (!input) return;
  const val = input.value;
  if (val) {
    const parts = val.split(',');
    parts.forEach(p => addTagChip(p));
    input.value = '';
  }
}

function renderCustomFieldRows(fieldsObj) {
  const container = id('custom-fields-container');
  if (!container) return;

  container.innerHTML = '';
  const entries = Object.entries(fieldsObj || {});
  if (entries.length === 0) {
    // Add one empty row by default
    addCustomFieldRow('', '');
  } else {
    entries.forEach(([k, v]) => addCustomFieldRow(k, v));
  }
}

function addCustomFieldRow(key = '', val = '') {
  const container = id('custom-fields-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'custom-field-row';
  row.innerHTML = `
    <input type="text" class="custom-field-key" placeholder="Nome (ex: Orçamento)" value="${escapeHtml(key)}">
    <input type="text" class="custom-field-val" placeholder="Valor (ex: R$ 50.000)" value="${escapeHtml(String(val))}">
    <button type="button" class="btn-remove-field" onclick="removeCustomFieldRow(this)" title="Remover campo">
      <i class="fa-solid fa-trash-can"></i>
    </button>
  `;
  container.appendChild(row);
}

function removeCustomFieldRow(btn) {
  const row = btn.closest('.custom-field-row');
  if (row) row.remove();
}

async function submitLeadDetails(e) {
  e.preventDefault();

  const leadId = id('lead-edit-id').value;
  const name = id('lead-form-name').value.trim();
  const phone = id('lead-form-phone').value.trim();
  const email = id('lead-form-email').value.trim();
  const status = id('lead-form-status').value;
  const notes = id('lead-form-notes').value.trim();

  // Make sure any lingering tag input is added
  addCurrentTagInput();

  // Collect Custom Fields
  const customFields = {};
  const rows = document.querySelectorAll('#custom-fields-container .custom-field-row');
  rows.forEach(row => {
    const k = row.querySelector('.custom-field-key')?.value.trim();
    const v = row.querySelector('.custom-field-val')?.value.trim();
    if (k) {
      customFields[k] = v || '';
    }
  });

  const payload = {
    name: name || undefined,
    phone,
    email: email || undefined,
    status,
    tags: state.modalTags,
    customFields,
    notes: notes || undefined
  };

  const btn = e.target.querySelector('button[type="submit"]');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';

  try {
    if (leadId) {
      await api.put(`/tenants/${state.tenantId}/leads/${leadId}`, payload);
      showToast('Lead atualizado com sucesso!', 'success');
    } else {
      await api.post(`/tenants/${state.tenantId}/leads`, payload);
      showToast('Lead cadastrado com sucesso!', 'success');
    }

    closeLeadModal();
    await loadLeadsPage();
  } catch (err) {
    showToast(err.message || 'Erro ao salvar lead', 'error');
    console.error('[Leads] Save error:', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function deleteLeadItem(leadId, leadName) {
  if (!confirm(`Deseja realmente excluir o lead "${leadName}" e todo o seu histórico de mensagens? Essa ação não pode ser desfeita.`)) {
    return;
  }

  try {
    await api.del(`/tenants/${state.tenantId}/leads/${leadId}`);
    showToast('Lead excluído com sucesso.', 'success');
    await loadLeadsPage();
  } catch (err) {
    showToast(err.message || 'Erro ao excluir lead', 'error');
    console.error(err);
  }
}

function openLeadChat(leadId) {
  navigate('conversations');
  setTimeout(() => {
    if (typeof selectLead === 'function') {
      selectLead(leadId);
    }
  }, 200);
}

// ============================================================
//   AI LOGIC & COGNITIVE REASONING AUDIT
// ============================================================
state.aiTraces = [];

async function loadAILogicPage() {
  if (!state.tenantId) return;

  // 1. Populate Leads select in simulator
  try {
    const leads = await api.get(`/tenants/${state.tenantId}/leads`).catch(() => []);
    const simSelect = id('sim-lead-select');
    if (simSelect) {
      simSelect.innerHTML = '<option value="">-- Novo Lead (Sem histórico prévio) --</option>';
      (leads || []).forEach(lead => {
        const opt = document.createElement('option');
        opt.value = lead.id;
        opt.textContent = `${lead.name || 'Sem nome'} (+${lead.phone}) [${lead.status}]`;
        simSelect.appendChild(opt);
      });
    }
  } catch(e) {}

  // 2. Fetch and render live traces
  const tbody = id('traces-table-body');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-20 text-muted"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando logs de decisão...</td></tr>';
  }

  try {
    const traces = await api.get(`/tenants/${state.tenantId}/ai-traces?limit=50`);
    state.aiTraces = traces || [];
    renderLiveTraces(state.aiTraces);
  } catch (err) {
    console.error('[AILogic] Error loading traces:', err);
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-20 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Erro ao carregar logs de decisão da IA.</td></tr>';
    }
  }
}

function renderLiveTraces(traces) {
  const tbody = id('traces-table-body');
  if (!tbody) return;

  if (!traces || traces.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:48px 20px;">
          <div style="font-size:36px; opacity:0.3; margin-bottom:8px;"><i class="fa-solid fa-network-wired"></i></div>
          <p style="color:var(--text-1); font-weight:600; margin-bottom:4px;">Nenhuma decisão registrada ainda</p>
          <p class="text-muted" style="font-size:13px; margin-bottom:16px;">Assim que a IA receber mensagens no WhatsApp ou você usar o simulador, os logs detalhados aparecerão aqui.</p>
          <button class="btn-sm-accent" onclick="document.querySelector('[data-inner-tab=\\'tab-ai-simulator\\']')?.click()"><i class="fa-solid fa-vial"></i> Abrir Simulador de Raciocínio</button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';

  traces.forEach(trace => {
    const tr = document.createElement('tr');
    const dateStr = trace.createdAt ? new Date(trace.createdAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '–';

    const inputPreview = trace.inputMessage.length > 50 ? trace.inputMessage.substring(0, 50) + '...' : trace.inputMessage;
    const responsePreview = trace.finalResponse.length > 60 ? trace.finalResponse.substring(0, 60) + '...' : trace.finalResponse;

    tr.innerHTML = `
      <td>
        <div class="lead-contact-info">
          <span class="lead-phone"><i class="fa-brands fa-whatsapp" style="color:var(--success);"></i> +${escapeHtml(trace.phone)}</span>
          <span class="text-muted" style="font-size:11px;">Status: ${escapeHtml(trace.leadStatusAfter || trace.leadStatusBefore || 'NEW')}</span>
        </div>
      </td>
      <td><span style="font-weight:500; color:var(--text-1); font-size:12px;">"${escapeHtml(inputPreview)}"</span></td>
      <td>
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span class="lead-name" style="font-size:12px; color:#f59e0b;">${escapeHtml(trace.nextObjective || trace.currentObjective)}</span>
          <span class="text-muted" style="font-size:11px;">${escapeHtml(trace.objectiveReason || '')}</span>
        </div>
      </td>
      <td>
        <span class="tag-chip" style="color:#ec4899; border-color:rgba(236,72,153,0.3); background:rgba(236,72,153,0.1);">
          ${escapeHtml(trace.nextStrategy || trace.currentStrategy)}
        </span>
      </td>
      <td><span class="text-muted" style="font-size:12px; font-style:italic;">"${escapeHtml(responsePreview)}"</span></td>
      <td><span class="text-muted" style="font-size:11px;">${dateStr}</span></td>
      <td>
        <div class="actions-cell">
          <button class="action-btn-tbl" title="Ver Auditoria Completa" onclick="openTraceDetailsModal('${trace.id}')">
            <i class="fa-solid fa-magnifying-glass-plus"></i>
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

function openTraceDetailsModal(traceId) {
  const trace = state.aiTraces.find(t => t.id === traceId);
  if (!trace) return;

  const modalBody = id('modal-trace-body');
  if (!modalBody) return;

  const memoriesHtml = (trace.memoriesFound && trace.memoriesFound.length > 0)
    ? `<ul style="margin:4px 0 0 16px; font-size:12px; color:var(--text-2);">${trace.memoriesFound.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`
    : '<span class="text-muted" style="font-size:12px;">Nenhuma memória anterior sobre este contato.</span>';

  const knowledgeHtml = (trace.knowledgeChunks && trace.knowledgeChunks.length > 0)
    ? `<div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">${trace.knowledgeChunks.map((k, i) => `<div class="reasoning-quote" style="font-size:11px;"><strong>Trecho ${i+1}:</strong> ${escapeHtml(k)}</div>`).join('')}</div>`
    : '<span class="text-muted" style="font-size:12px;">Nenhum documento específico foi acionado para este termo.</span>';

  modalBody.innerHTML = `
    <div style="background:rgba(255,255,255,0.03); border:1px solid var(--glass-border); border-radius:var(--radius-sm); padding:12px 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Mensagem de Entrada do Lead</span>
        <span class="lead-phone"><i class="fa-brands fa-whatsapp" style="color:var(--success);"></i> +${escapeHtml(trace.phone)}</span>
      </div>
      <p style="font-size:14px; font-weight:600; color:var(--text-1); margin:0;">"${escapeHtml(trace.inputMessage)}"</p>
    </div>

    <!-- Stage 1: Memories -->
    <div class="sim-stage-card">
      <div class="sim-stage-head">
        <div class="sim-stage-title"><i class="fa-solid fa-brain" style="color:#a78bfa;"></i> 1. Memórias do Lead Consideradas</div>
        <span class="step-engine-tag">MemoryEngine</span>
      </div>
      ${memoriesHtml}
    </div>

    <!-- Stage 2: Knowledge -->
    <div class="sim-stage-card">
      <div class="sim-stage-head">
        <div class="sim-stage-title"><i class="fa-solid fa-book-bookmark" style="color:#34d399;"></i> 2. Trechos de Playbook Recuperados (RAG)</div>
        <span class="step-engine-tag">KnowledgeEngine (PGVector)</span>
      </div>
      ${knowledgeHtml}
    </div>

    <!-- Stage 3: Objective -->
    <div class="sim-stage-card highlight">
      <div class="sim-stage-head">
        <div class="sim-stage-title"><i class="fa-solid fa-bullseye" style="color:#f59e0b;"></i> 3. Avaliação do Objetivo Comercial</div>
        <span class="step-engine-tag">ObjectiveEngine</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:4px; font-size:13px;">
        <div><strong>Objetivo Definido:</strong> <span style="color:#f59e0b;">${escapeHtml(trace.nextObjective)}</span></div>
        <div class="reasoning-quote"><strong>Raciocínio da IA:</strong> ${escapeHtml(trace.objectiveReason || 'Objetivo mantido com base no contexto.')}</div>
        <div style="font-size:11px; color:var(--text-muted);">Transição de Status: ${escapeHtml(trace.leadStatusBefore || 'NEW')} &rarr; <strong>${escapeHtml(trace.leadStatusAfter || 'NEW')}</strong></div>
      </div>
    </div>

    <!-- Stage 4: Strategy -->
    <div class="sim-stage-card">
      <div class="sim-stage-head">
        <div class="sim-stage-title"><i class="fa-solid fa-chess" style="color:#ec4899;"></i> 4. Estratégia Comportamental Adotada</div>
        <span class="step-engine-tag">StrategyEngine</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:4px; font-size:13px;">
        <div><strong>Estratégia:</strong> <span style="color:#ec4899;">${escapeHtml(trace.nextStrategy)}</span></div>
        <div class="reasoning-quote"><strong>Raciocínio da IA:</strong> ${escapeHtml(trace.strategyReason || 'Estratégia selecionada para conduzir o lead ao próximo passo.')}</div>
      </div>
    </div>

    <!-- Stage 5: Response Output -->
    <div class="sim-stage-card" style="border-color:rgba(16,185,129,0.4); background:rgba(16,185,129,0.04);">
      <div class="sim-stage-head">
        <div class="sim-stage-title"><i class="fa-solid fa-comments" style="color:#34d399;"></i> 5. Resposta Gerada pelo Gemini 2.5 Flash</div>
        <span class="step-engine-tag" style="color:#34d399;">Outbound WhatsApp</span>
      </div>
      <p style="font-size:14px; color:var(--text-1); line-height:1.5; margin:4px 0 0 0; white-space:pre-wrap;">${escapeHtml(trace.finalResponse)}</p>
    </div>
  `;

  id('modal-trace-details').style.display = 'flex';
}

function closeTraceModal() {
  id('modal-trace-details').style.display = 'none';
}

async function runAISimulation(e) {
  e.preventDefault();

  const inputMessage = id('sim-input-message').value.trim();
  const leadId = id('sim-lead-select').value || undefined;
  if (!inputMessage) return;

  const btn = id('btn-run-simulation');
  const badge = id('sim-status-badge');
  const container = id('sim-result-container');

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Executando Auditoria Cognitiva...';
  badge.className = 'badge-status-running';
  badge.textContent = 'Processando 6 etapas...';

  container.innerHTML = `
    <div style="text-align:center; padding:32px 16px;">
      <div style="font-size:28px; color:var(--accent); margin-bottom:12px;"><i class="fa-solid fa-brain fa-spin"></i></div>
      <h4 style="color:var(--text-1); margin:0 0 6px 0;">Analisando com Pipeline Cognitivo...</h4>
      <p class="text-muted" style="font-size:12px; margin:0;">Avaliando memórias, consultando playbooks vetoriais, testando objetivos e definindo estratégias.</p>
    </div>
  `;

  try {
    const result = await api.post(`/tenants/${state.tenantId}/ai-traces/simulate`, {
      inputMessage,
      leadId
    });

    badge.className = 'badge-status-done';
    badge.textContent = 'Auditoria Concluída';
    renderSimulationResult(result);
    showToast('Auditoria cognitiva concluída!', 'success');
  } catch (err) {
    badge.className = 'badge-status-idle';
    badge.textContent = 'Falha na execução';
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:32px; color:var(--danger);"></i>
        <p style="color:var(--danger);">${escapeHtml(err.message || 'Erro ao executar simulação')}</p>
      </div>
    `;
    showToast(err.message || 'Erro ao simular', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Executar Auditoria Cognitiva';
  }
}

function renderSimulationResult(data) {
  const container = id('sim-result-container');
  if (!container || !data.stages) return;

  const st = data.stages;

  // Memories
  const memoriesList = (st.step1_memory.memoriesFound && st.step1_memory.memoriesFound.length > 0)
    ? `<ul style="margin:4px 0 0 16px; font-size:12px; color:var(--text-2);">${st.step1_memory.memoriesFound.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`
    : '<span class="text-muted" style="font-size:12px;">Nenhuma memória prévia encontrada para este contato.</span>';

  // Knowledge
  const knowledgeList = (st.step2_knowledge.chunksMatched && st.step2_knowledge.chunksMatched.length > 0)
    ? `<div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">${st.step2_knowledge.chunksMatched.map((k, i) => `<div class="reasoning-quote" style="font-size:11px;"><strong>Playbook Trecho ${i+1}:</strong> ${escapeHtml(k)}</div>`).join('')}</div>`
    : '<span class="text-muted" style="font-size:12px;">Nenhum playbook específico recuperado. A IA usará o conhecimento base da empresa.</span>';

  container.innerHTML = `
    <!-- Final Response Banner -->
    <div class="sim-stage-card" style="border-color:rgba(16,185,129,0.5); background:rgba(16,185,129,0.06); margin-bottom:4px;">
      <div class="sim-stage-head">
        <div class="sim-stage-title" style="color:#34d399;"><i class="fa-brands fa-whatsapp" style="font-size:18px;"></i> Resposta Final Sintetizada pelo SDR (${escapeHtml(data.persona.name)})</div>
        <span class="step-engine-tag" style="color:#34d399; border-color:rgba(16,185,129,0.3);">Gemini 2.5 Flash</span>
      </div>
      <p style="font-size:14px; font-weight:500; color:var(--text-1); line-height:1.5; margin:6px 0 0 0; white-space:pre-wrap;">${escapeHtml(data.finalResponse)}</p>
    </div>

    <!-- Step 1: Memory -->
    <div class="sim-stage-card">
      <div class="sim-stage-head">
        <div class="sim-stage-title"><i class="fa-solid fa-brain" style="color:#a78bfa;"></i> ${escapeHtml(st.step1_memory.name)}</div>
        <span class="step-engine-tag">MemoryEngine</span>
      </div>
      ${memoriesList}
    </div>

    <!-- Step 2: Knowledge -->
    <div class="sim-stage-card">
      <div class="sim-stage-head">
        <div class="sim-stage-title"><i class="fa-solid fa-book-bookmark" style="color:#34d399;"></i> ${escapeHtml(st.step2_knowledge.name)}</div>
        <span class="step-engine-tag">KnowledgeEngine (PGVector)</span>
      </div>
      <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(st.step2_knowledge.status)}</div>
      ${knowledgeList}
    </div>

    <!-- Step 3: Objective -->
    <div class="sim-stage-card highlight">
      <div class="sim-stage-head">
        <div class="sim-stage-title"><i class="fa-solid fa-bullseye" style="color:#f59e0b;"></i> ${escapeHtml(st.step3_objective.name)}</div>
        <span class="step-engine-tag">ObjectiveEngine</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:4px; font-size:13px;">
        <div><strong>Objetivo Ativo Determinado:</strong> <span style="color:#f59e0b; font-weight:600;">"${escapeHtml(st.step3_objective.nextObjective)}"</span></div>
        <div class="reasoning-quote"><strong>Por que a IA escolheu este objetivo?</strong> ${escapeHtml(st.step3_objective.objectiveReason)}</div>
        <div style="font-size:11px; color:var(--text-muted);">Status do Lead: ${escapeHtml(st.step3_objective.statusBefore)} &rarr; <strong style="color:var(--text-1);">${escapeHtml(st.step3_objective.statusAfter)}</strong></div>
      </div>
    </div>

    <!-- Step 4: Strategy -->
    <div class="sim-stage-card">
      <div class="sim-stage-head">
        <div class="sim-stage-title"><i class="fa-solid fa-chess" style="color:#ec4899;"></i> ${escapeHtml(st.step4_strategy.name)}</div>
        <span class="step-engine-tag">StrategyEngine</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:4px; font-size:13px;">
        <div><strong>Estratégia Comportamental:</strong> <span class="tag-chip" style="color:#ec4899; border-color:rgba(236,72,153,0.3);">${escapeHtml(st.step4_strategy.nextStrategy)}</span></div>
        <div class="reasoning-quote"><strong>Raciocínio Estratégico:</strong> ${escapeHtml(st.step4_strategy.strategyReason)}</div>
      </div>
    </div>

    <!-- Step 5: Learning -->
    <div class="sim-stage-card">
      <div class="sim-stage-head">
        <div class="sim-stage-title"><i class="fa-solid fa-graduation-cap" style="color:#38bdf8;"></i> ${escapeHtml(st.step5_learning.name)}</div>
        <span class="step-engine-tag">LearningEngine</span>
      </div>
      <div style="font-size:12px; color:var(--text-2);">${escapeHtml(st.step5_learning.fewShotText)}</div>
    </div>

    <!-- Step 6: Prompt Preview Toggle -->
    <details style="background:var(--surface); border:1px solid var(--glass-border); border-radius:var(--radius-sm); padding:10px 14px;">
      <summary style="cursor:pointer; font-size:12px; font-weight:600; color:var(--text-muted);"><i class="fa-solid fa-code"></i> Inspecionar Prompt Completo enviado ao LLM</summary>
      <div class="prompt-preview-box" style="margin-top:10px;">${escapeHtml(st.step6_generation.fullPromptPreview)}</div>
    </details>
  `;
}

// ============================================================
//   FOLLOW-UP INTELLIGENT ENGINE PAGE
// ============================================================
async function loadFollowUpPage() {
  if (!state.tenantId) return;

  try {
    const config = await api.get(`/tenants/${state.tenantId}/followup`);
    if (!config) return;

    // Toggle
    const toggle = id('followup-enabled-toggle');
    if (toggle) toggle.checked = config.followUpEnabled !== false;

    // Trigger & Window
    if (id('followup-delay-hours')) id('followup-delay-hours').value = config.followUpDelayHours || 2;
    if (id('followup-hours-start')) id('followup-hours-start').value = config.businessHoursStart || '08:00';
    if (id('followup-hours-end')) id('followup-hours-end').value = config.businessHoursEnd || '18:00';
    if (id('followup-days')) id('followup-days').value = config.businessDays || '1,2,3,4,5';

    // Limits
    if (id('followup-max-attempts')) id('followup-max-attempts').value = config.followUpMaxAttempts || 3;
    if (id('followup-action-limit')) id('followup-action-limit').value = config.followUpActionAfterLimit || 'PAUSE_FOLLOWUP';

    // Mode
    const mode = config.followUpMode || 'AI_CONTEXTUAL';
    const radios = document.querySelectorAll('input[name="followup-mode"]');
    radios.forEach(r => {
      r.checked = r.value === mode;
    });

    // Custom Sequence
    if (config.followUpSequence && Array.isArray(config.followUpSequence)) {
      if (id('seq-msg-1')) id('seq-msg-1').value = config.followUpSequence[0] || '';
      if (id('seq-msg-2')) id('seq-msg-2').value = config.followUpSequence[1] || '';
      if (id('seq-msg-3')) id('seq-msg-3').value = config.followUpSequence[2] || '';
    }

    toggleFollowUpModeUI();
  } catch (err) {
    console.error('[FollowUp] Error loading config:', err);
    showToast('Erro ao carregar configurações de follow-up', 'error');
  }
}

function toggleFollowUpModeUI() {
  const selectedMode = document.querySelector('input[name="followup-mode"]:checked')?.value || 'AI_CONTEXTUAL';
  const container = id('followup-custom-sequence-container');
  if (container) {
    container.style.display = selectedMode === 'CUSTOM_SEQUENCE' ? 'block' : 'none';
  }
}

async function saveFollowUpConfig(e) {
  if (e) e.preventDefault();
  if (!state.tenantId) return;

  const followUpEnabled = id('followup-enabled-toggle')?.checked ?? true;
  const followUpDelayHours = parseInt(id('followup-delay-hours')?.value || '2', 10);
  const businessHoursStart = id('followup-hours-start')?.value || '08:00';
  const businessHoursEnd = id('followup-hours-end')?.value || '18:00';
  const businessDays = id('followup-days')?.value || '1,2,3,4,5';
  const followUpMaxAttempts = parseInt(id('followup-max-attempts')?.value || '3', 10);
  const followUpActionAfterLimit = id('followup-action-limit')?.value || 'PAUSE_FOLLOWUP';
  const followUpMode = document.querySelector('input[name="followup-mode"]:checked')?.value || 'AI_CONTEXTUAL';

  const sequence = [
    (id('seq-msg-1')?.value || '').trim(),
    (id('seq-msg-2')?.value || '').trim(),
    (id('seq-msg-3')?.value || '').trim(),
  ].filter(Boolean);

  try {
    await api.post(`/tenants/${state.tenantId}/followup`, {
      followUpEnabled,
      followUpDelayHours,
      businessHoursStart,
      businessHoursEnd,
      businessDays,
      followUpMaxAttempts,
      followUpActionAfterLimit,
      followUpMode,
      followUpSequence: sequence,
    });
    showToast('✅ Configurações de Follow-up salvas com sucesso!', 'success');
  } catch (err) {
    console.error('[FollowUp] Save error:', err);
    showToast('Erro ao salvar: ' + err.message, 'error');
  }
}

async function runFollowUpScan(force = true) {
  if (!state.tenantId) return;

  const btn = id('btn-run-followup');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Executando Varredura...';
  }

  try {
    const res = await api.post(`/tenants/${state.tenantId}/followup/run`, { force });
    const result = res.result || {};

    const resultsCard = id('followup-scan-results');
    const resultsBody = id('followup-scan-body');

    if (resultsCard && resultsBody) {
      resultsCard.style.display = 'block';

      let detailsHtml = '';
      if (result.details && result.details.length > 0) {
        detailsHtml = `
          <div style="margin-top:12px; max-height:220px; overflow-y:auto;">
            <table class="data-table" style="font-size:12px;">
              <thead>
                <tr>
                  <th>Lead / Telefone</th>
                  <th>Status</th>
                  <th>Tentativa</th>
                  <th>Detalhes / Mensagem</th>
                </tr>
              </thead>
              <tbody>
                ${result.details.map(d => `
                  <tr>
                    <td><strong>${escHtml(d.name || 'Lead')}</strong><br><span style="font-size:11px; color:var(--text-muted);">${escHtml(d.phone || '-')}</span></td>
                    <td>
                      <span class="badge ${d.status === 'SENT' ? 'badge-success' : 'badge-warning'}">
                        ${d.status === 'SENT' ? 'Enviado' : escHtml(d.status)}
                      </span>
                    </td>
                    <td>${d.attempt || 0}</td>
                    <td>${escHtml(d.messageSent || d.reason || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      resultsBody.innerHTML = `
        <div style="display:flex; gap:20px; margin-bottom:8px; font-weight:600;">
          <span>🔍 Analisados: <strong style="color:var(--text-primary);">${result.analyzed || 0}</strong></span>
          <span>🚀 Disparados: <strong style="color:var(--success);">${result.sent || 0}</strong></span>
          <span>🛡️ Protegidos/Ignorados: <strong style="color:var(--warning);">${result.skipped || 0}</strong></span>
        </div>
        ${detailsHtml}
      `;
    }

    showToast(`✅ Varredura finalizada! ${result.sent || 0} follow-up(s) enviado(s).`, 'success');
  } catch (err) {
    console.error('[FollowUp] Scan error:', err);
    showToast('Erro ao executar varredura: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-play"></i> Executar Varredura Agora';
    }
  }
}

// ============================================================
//   OUTBOUND DISPATCHES PAGE
// ============================================================
state.outboundTab = 'manual';

function switchOutboundTab(tab) {
  state.outboundTab = tab;
  document.querySelectorAll('.media-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `tab-btn-outbound-${tab}`);
  });
  document.querySelectorAll('.outbound-tab-content').forEach(el => {
    el.style.display = el.id === `outbound-tab-${tab}` ? 'block' : 'none';
  });
}

async function loadOutboundPage() {
  if (!state.tenantId) return;

  // Sync API placeholders
  document.querySelectorAll('.api-tenant-placeholder').forEach(el => el.textContent = state.tenantId);
  const token = localStorage.getItem('sdr_token') || 'SEU_JWT_TOKEN';
  document.querySelectorAll('.api-token-placeholder').forEach(el => el.textContent = token.slice(0, 16) + '...');

  // Setup preview listener
  const msgInput = id('outbound-message');
  if (msgInput) {
    msgInput.addEventListener('input', () => {
      const preview = id('outbound-preview-text');
      if (preview) {
        preview.textContent = msgInput.value.trim() || 'Olá! Tudo bem? Como posso te ajudar hoje?';
      }
    });
  }

  // Load default greeting if empty
  if (msgInput && !msgInput.value.trim()) {
    await loadDefaultOutboundGreeting();
  }

  // Load history
  await loadOutboundHistory();
}

async function loadDefaultOutboundGreeting() {
  if (!state.tenantId) return;
  try {
    const config = await api.get(`/tenants/${state.tenantId}/sdr`);
    const persona = config?.personaName || 'Consultor';
    const greeting = `Olá {nome}! Tudo bem? Sou ${persona} da {empresa}. Vi seu interesse e gostaria de saber como posso te ajudar hoje! 😊`;
    if (id('outbound-message')) {
      id('outbound-message').value = greeting;
      if (id('outbound-preview-text')) id('outbound-preview-text').textContent = greeting.replace('{nome}', 'João').replace('{empresa}', 'nossa empresa');
    }
  } catch (err) {
    console.warn('[Outbound] Error loading default greeting:', err);
  }
}

async function sendSingleOutbound(e) {
  e.preventDefault();
  if (!state.tenantId) return;

  const phone = (id('outbound-phone')?.value || '').trim();
  const name = (id('outbound-name')?.value || '').trim();
  const message = (id('outbound-message')?.value || '').trim();

  if (!phone || !message) {
    showToast('Informe o telefone e a mensagem do disparo.', 'error');
    return;
  }

  const btn = id('btn-outbound-send');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando Disparo...';
  }

  try {
    const res = await api.post(`/tenants/${state.tenantId}/outbound/send`, {
      phone,
      name,
      message,
      source: 'MANUAL',
    });

    if (res.success) {
      showToast('🚀 Mensagem enviada com sucesso no WhatsApp!', 'success');
      id('outbound-phone').value = '';
      id('outbound-name').value = '';
      await loadOutboundHistory();
    } else {
      showToast('Aviso: ' + (res.message || 'Erro no envio'), 'warning');
      await loadOutboundHistory();
    }
  } catch (err) {
    console.error('[Outbound] Send error:', err);
    showToast('Erro ao enviar disparo: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar Mensagem via WhatsApp';
    }
  }
}

async function sendBulkOutbound(e) {
  e.preventDefault();
  if (!state.tenantId) return;

  const bulkText = (id('outbound-bulk-list')?.value || '').trim();
  const message = (id('outbound-bulk-message')?.value || '').trim();
  const delaySec = parseInt(id('outbound-bulk-delay')?.value || '5', 10);

  if (!bulkText || !message) {
    showToast('Informe a lista de contatos e a mensagem.', 'error');
    return;
  }

  const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    showToast('Nenhum contato válido encontrado na lista.', 'error');
    return;
  }

  if (!confirm(`Deseja iniciar o disparo para ${lines.length} contato(s) com intervalo de ${delaySec}s entre cada envio?`)) {
    return;
  }

  const btn = id('btn-bulk-send');
  const progressContainer = id('bulk-progress-container');
  const progressBar = id('bulk-progress-bar');
  const progressLabel = id('bulk-progress-label');
  const progressPercent = id('bulk-progress-percent');

  if (btn) btn.disabled = true;
  if (progressContainer) progressContainer.style.display = 'block';

  let sentCount = 0;
  let errorCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(/[,;\t]/).map(p => p.trim());
    const phone = parts[0];
    const name = parts[1] || '';

    const percent = Math.round(((i + 1) / lines.length) * 100);
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressLabel) progressLabel.textContent = `Enviando ${i + 1} de ${lines.length} (${phone})...`;

    try {
      await api.post(`/tenants/${state.tenantId}/outbound/send`, {
        phone,
        name,
        message,
        source: 'BULK',
      });
      sentCount++;
    } catch (err) {
      console.error(`[Outbound Bulk] Error sending to ${phone}:`, err);
      errorCount++;
    }

    if (i < lines.length - 1) {
      await new Promise(r => setTimeout(r, delaySec * 1000));
    }
  }

  if (btn) btn.disabled = false;
  if (progressLabel) progressLabel.textContent = `Concluído: ${sentCount} enviados, ${errorCount} erros.`;
  showToast(`✅ Disparos em lote finalizados! (${sentCount} enviados, ${errorCount} erros)`, 'success');
  await loadOutboundHistory();
}

async function loadOutboundHistory() {
  if (!state.tenantId) return;

  const tbody = id('outbound-history-tbody');
  if (!tbody) return;

  try {
    const list = await api.get(`/tenants/${state.tenantId}/outbound?limit=100`);
    if (!list || list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:30px; color:var(--text-secondary);">
            <i class="fa-solid fa-paper-plane" style="font-size:24px; opacity:0.3; margin-bottom:8px; display:block;"></i>
            Nenhum disparo registrado ainda. Faça seu primeiro disparo acima!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(item => {
      const isSuccess = item.status === 'SENT' || item.status === 'DELIVERED';
      const time = formatTime(item.createdAt);
      return `
        <tr>
          <td>
            <strong>${escHtml(item.name || 'Lead Sem Nome')}</strong>
            <div style="font-size:11px; color:var(--text-muted);">${escHtml(item.phone)}</div>
          </td>
          <td style="max-width:320px; word-break:break-word; font-size:12px;">
            ${escHtml(item.message)}
          </td>
          <td>
            <span class="badge ${isSuccess ? 'badge-success' : 'badge-danger'}">
              ${isSuccess ? '<i class="fa-solid fa-check"></i> Enviado' : '<i class="fa-solid fa-xmark"></i> Erro'}
            </span>
          </td>
          <td>
            <span class="tag-chip" style="font-size:11px;">${escHtml(item.source || 'MANUAL')}</span>
          </td>
          <td style="font-size:12px; color:var(--text-muted);">${time}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('[Outbound] Error loading history:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:20px; color:var(--danger);">
          Erro ao carregar histórico de disparos.
        </td>
      </tr>
    `;
  }
}

function copyApiCurl(type) {
  const tenantId = state.tenantId || 'TENANT_ID';
  const token = localStorage.getItem('sdr_token') || 'SEU_TOKEN';
  let curlText = '';

  if (type === 'leads') {
    curlText = `curl -X POST "http://localhost:3030/tenants/${tenantId}/leads" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token}" \\
  -d '{
    "phone": "5511999998888",
    "name": "Carlos Silva",
    "email": "carlos@email.com",
    "tags": ["facebook-ads", "imoveis"],
    "upsert": true
  }'`;
  } else {
    curlText = `curl -X POST "http://localhost:3030/tenants/${tenantId}/outbound/send" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token}" \\
  -d '{
    "phone": "5511999998888",
    "name": "Carlos Silva",
    "message": "Olá Carlos! Vi seu cadastro sobre nosso produto. Como posso te ajudar?"
  }'`;
  }

  navigator.clipboard.writeText(curlText).then(() => {
    showToast('📋 Exemplo cURL copiado para a área de transferência!', 'success');
  }).catch(() => {
    alert(curlText);
  });
}




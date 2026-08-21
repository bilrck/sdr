# 🤖 SDR Inteligente — SaaS AI-First & Event-Driven

> Plataforma SaaS de SDR (Sales Development Representative) autônomo e multitenant impulsionado por Inteligência Artificial (Google Gemini & OpenAI), integrado nativamente ao WhatsApp via Evolution API.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.26-black.svg)](https://www.fastify.io/)
[![Prisma](https://img.shields.io/badge/Prisma-5.12-2D3748.svg)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20pgvector-336791.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](LICENSE)

---

## 📑 Sumário

- [Visão Geral](#-visão-geral)
- [Arquitetura & Modos do SDR](#-arquitetura--modos-do-sdr)
- [Recursos Principais](#-recursos-principais)
- [Stack Tecnológica](#-stack-tecnológica)
- [Instalação & Configuração](#-instalação--configuração)
  - [Via Docker Compose (Recomendado)](#via-docker-compose-recomendado)
  - [Desenvolvimento Local](#desenvolvimento-local)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Endpoints da API REST](#-endpoints-da-api-rest)
- [Segurança & LGPD](#-segurança--lgpd)
- [Deploy em Produção](#-deploy-em-produção)
- [Licença](#-licença)

---

## 🎯 Visão Geral

O **SDR Inteligente** é um agente autônomo completo para atendimento, nutrição e qualificação de leads via WhatsApp. Projetado para operar em modelo SaaS Multitenant, ele permite que diferentes empresas configurem seus próprios agentes de IA, personas, playbooks comerciais e regras de qualificação de forma 100% isolada e segura.

---

## 🧠 Arquitetura & Modos do SDR

O sistema opera com arquitetura orientada a eventos (`EventBus`) e conta com **dois modos de inteligência**:

### 1. ⚡ Modo Simples (Fluxo de Qualificação Direto)
- Executa perguntas sequenciais estritas definidas no roteiro de qualificação.
- Quando o lead responde à última pergunta do roteiro, define o lead automaticamente como `QUALIFIED`, aciona a ação pós-qualificação (webhook/notificação) e encerra o fluxo do bot.
- Ideal para campanhas com roteiro rígido de captação (ex: Nome, Email, Orçamento, Prazo).

### 2. 🧠 Modo Avançado (Funil Cognitivo & Estratégico)
- Motor de decisão cognitivo em múltiplos estágios:
  1. **Memória de Longo Prazo:** Extração e persistência contínua de fatos declarados pelo lead.
  2. **Base de Conhecimento (RAG):** Busca semântica nos playbooks e documentos cadastrados.
  3. **Objetivo Dinâmico:** Transição inteligente de objetivos de vendas com base no contexto.
  4. **Estratégia Comportamental:** Seleção da postura persuasiva ideal para cada momento.
  5. **Few-Shot Learning:** Aprendizado com correções humanas prévias.
  6. **Humanização:** Variação de balões de mensagens, digitação realista e pausas naturais.

---

## 🚀 Recursos Principais

- 🏢 **Multi-Tenant Seguro:** Isolamento completo de leads, playbooks, conexões de WhatsApp e dados com autenticação JWT e proteção contra BOLA/IDOR.
- 💬 **Integração WhatsApp Nativa:** Conexão multi-instância via Evolution API (QR Code gerado diretamente no painel web).
- 📤 **Disparos Outbound (Prospecção Ativa):** Disparo manual individual, envio em lote via lista/CSV com intervalo anti-banimento e disparo direto via API REST.
- ⏱️ **Motor de Follow-up Inteligente:** Reengaja leads inativos respeitando horário comercial, limite de tentativas, ações de encerramento (`UNRESPONSIVE`, `DISQUALIFY`, `PAUSE`) e proteção anti-conflito (não interrompe conversas ativas nem leads qualificados).
- 📚 **Playbooks & Base de Conhecimento:** Upload de documentos, manuais de vendas e FAQ com chunking e vetorização (pgvector).
- 🎨 **Flow Builder Visual:** Criação de fluxos e nós de automação arrasta-e-solta (Drawflow).
- 🖼️ **Envio de Mídias:** Disparo de fotos, vídeos, áudios e PDFs vinculados a tags de gatilho.
- 📊 **Analytics & Tracing Completo:** Dashboard de métricas em tempo real e visualizador de traces de raciocínio da IA em cada mensagem.
- 🧑‍💻 **Handoff Humano:** Pausa instantânea da IA e transferência para atendente quando o lead solicita ou atinge critérios de parada.

---

## 🛠️ Stack Tecnológica

| Componente | Tecnologia |
|---|---|
| **Runtime & Linguagem** | Node.js (v20+) com TypeScript e ESM |
| **Framework HTTP** | Fastify 4 (Alta performance com Rate Limiting e Multipart) |
| **Banco de Dados** | PostgreSQL 16 com extensão `pgvector` |
| **ORM** | Prisma ORM 5.12 |
| **Mensageria Interna** | EventEmitter2 (Event-driven decoupled pipeline) |
| **Provedores de IA** | Google Gemini SDK (`gemini-2.5-flash`) e OpenAI SDK (`gpt-4o-mini`) |
| **WhatsApp Gateway** | Evolution API (v2 Baileys) com cache Redis |
| **Frontend** | HTML5, CSS3 Custom Properties, Vanilla JavaScript (SPA), FontAwesome |

---

## 📦 Instalação & Configuração

### Pré-requisitos
- [Node.js](https://nodejs.org/) v20 ou superior
- [Docker](https://www.docker.com/) e Docker Compose
- Chave de API da Google Gemini ou OpenAI

---

### Via Docker Compose (Recomendado)

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/sdr-intelligent-saas.git
cd sdr-intelligent-saas
```

2. Crie o arquivo `.env` a partir do exemplo:
```bash
cp .env.example .env
```
> Preencha a variável `GEMINI_API_KEY` com sua chave de API e altere `JWT_SECRET`.

3. Suba todos os serviços (PostgreSQL com pgvector, Redis, Evolution API e SDR App):
```bash
docker-compose up -d --build
```

4. Acesse o painel de controle no navegador:
```
http://localhost:3030
```

---

### Desenvolvimento Local

1. Instale as dependências:
```bash
npm install
```

2. Suba o banco de dados e Evolution API via Docker:
```bash
docker-compose up -d postgres redis evolution-api
```

3. Execute as migrações do banco de dados:
```bash
npx prisma generate
npx prisma db push
```

4. Inicie o servidor em modo de desenvolvimento (com hot-reload):
```bash
npm run dev
```

5. Para compilar TypeScript:
```bash
npm run build
```

---

## 🔑 Variáveis de Ambiente

| Variável | Descrição | Exemplo / Padrão |
|---|---|---|
| `DATABASE_URL` | String de conexão com o PostgreSQL | `postgresql://user:pass@localhost:5432/sdr_intelligent?schema=public` |
| `GEMINI_API_KEY` | Chave de API do Google Gemini | `AIzaSy...` |
| `GEMINI_MODEL` | Modelo padrão do Gemini | `gemini-2.5-flash` |
| `OPENAI_API_KEY` | Chave de API da OpenAI (opcional) | `sk-...` |
| `OPENAI_MODEL` | Modelo padrão da OpenAI | `gpt-4o-mini` |
| `PORT` | Porta de execução do servidor | `3030` |
| `HOST` | Interface de rede | `0.0.0.0` |
| `EVOLUTION_API_URL` | URL base da Evolution API | `http://localhost:8080` |
| `EVOLUTION_API_KEY` | Chave de autenticação da Evolution API | `42D8E424-E342-4D9E-BF6C-21FC8CA5` |
| `EVOLUTION_API_INSTANCE` | Nome da instância padrão | `sdr-instance` |
| `JWT_SECRET` | Segredo para assinatura de tokens JWT | `chave-secreta-forte-e-aleatoria` |

---

## 🔌 Endpoints da API REST

### 🔐 Autenticação & Usuários
- `POST /auth/register` — Cadastro de novo usuário e empresa padrão
- `POST /auth/login` — Login e geração de token JWT
- `GET /auth/me` — Dados do usuário logado e limites de uso
- `POST /auth/change-password` — Alteração de senha

### ⚙️ Gestão de Empresas (Tenants) & SDR
- `GET /tenants` — Lista empresas do usuário logado
- `POST /tenants` — Cria nova empresa
- `GET /tenants/:id/sdr` — Retorna configuração do agente SDR da empresa
- `POST /tenants/:id/sdr` — Cria ou atualiza configuração do SDR
- `POST /tenants/:id/sdr-mode` — Altera modo do SDR (`SIMPLE` vs `ADVANCED`)

### 👥 Leads & Conversas
- `GET /tenants/:id/leads` — Lista leads com paginação, busca e filtros
- `POST /tenants/:id/leads` — Cadastro/Upsert de novo lead via API
- `GET /tenants/:id/leads/:leadId/messages` — Histórico de mensagens do lead
- `PUT /tenants/:id/leads/:leadId/pause` — Pausa ou retoma o atendimento da IA
- `POST /tenants/:id/leads/:leadId/message` — Envia mensagem manual de atendente humano

### 📤 Disparos Outbound (Prospecção)
- `POST /tenants/:id/outbound/send` — Disparo imediato de mensagem inicial via WhatsApp
- `GET /tenants/:id/outbound` — Histórico de mensagens ativas disparadas

### ⏱️ Follow-up Inteligente
- `GET /tenants/:id/followup` — Retorna configuração de cadência de follow-up
- `POST /tenants/:id/followup` — Salva configuração de follow-up
- `POST /tenants/:id/followup/run` — Executa varredura de follow-up sob demanda

### 📱 WhatsApp (Evolution API)
- `GET /tenants/:id/whatsapp/status` — Status da conexão do WhatsApp da empresa
- `GET /tenants/:id/whatsapp/qr` — Gera QR Code de pareamento
- `DELETE /tenants/:id/whatsapp/disconnect` — Desconecta o WhatsApp

### 📚 Conhecimento & Mídias
- `GET /tenants/:id/knowledge` — Lista playbooks cadastrados
- `POST /tenants/:id/knowledge` — Treina novo playbook com fatos
- `POST /tenants/:id/media/upload` — Upload de arquivo de mídia (imagem, vídeo, áudio, PDF)
- `GET /tenants/:id/media` — Lista mídias cadastradas

### 🌐 Webhooks Inbound
- `POST /webhook/whatsapp/receive` — Webhook de entrada da Evolution API
- `POST /webhook/inbound` — Webhook genérico para integração com canais externos

---

## 🛡️ Segurança & LGPD

O projeto adota boas práticas de segurança em conformidade com as diretrizes OWASP e LGPD:
1. **Proteção contra BOLA/IDOR:** Verificação de propriedade do tenant em todos os endpoints `/tenants/:id/*`.
2. **Sanitização de Entradas & XSS:** Escaping rigoroso em todas as renderizações dinâmicas no frontend.
3. **Upload Seguro:** Validação estrita de extensões permitidas (`.jpg`, `.png`, `.mp4`, `.pdf`, etc.), bloqueando executáveis e scripts.
4. **Rate Limiting:** Proteção contra força bruta em rotas sensíveis via `@fastify/rate-limit`.
5. **Headers de Segurança:** `nosniff`, `SAMEORIGIN`, `Strict-Transport-Security`, `Referrer-Policy`.
6. **Descadastro Automático (Opt-out LGPD):** Reconhecimento de intenções como *"parar"*, *"descadastrar"*, *"remover contato"*, pausando o bot e respeitando a privacidade do lead.

---

## 🚀 Deploy em Produção

### Com PM2
```bash
npm run build
pm2 start pm2.config.js
```

### Com Docker
```bash
docker-compose -f docker-compose.yml up -d --build
```

---

## 📄 Licença

Distribuído sob a licença ISC. Consulte `package.json` para obter mais detalhes.

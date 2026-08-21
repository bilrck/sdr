import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const API_KEY = process.env.EVOLUTION_API_KEY || '';
const INSTANCE_NAME = process.env.EVOLUTION_API_INSTANCE || 'sdr-instance';

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(endpoint: string, method: 'GET' | 'POST' | 'DELETE', body?: any): Promise<any> {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function checkInstanceExists(name: string): Promise<boolean> {
  try {
    const instances = await request('/instance/fetchInstances', 'GET');
    return Array.isArray(instances) && instances.some((inst: any) => inst.instanceName === name || inst.name === name);
  } catch (err) {
    console.error('Erro ao buscar instâncias:', err);
    return false;
  }
}

async function generateQrHtml(base64Image: string) {
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Conectar WhatsApp SDR</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background-color: #0b141a;
            color: #e9edef;
            margin: 0;
        }
        .card {
            background: #111b21;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
            text-align: center;
            border: 1px solid #222e35;
            max-width: 450px;
        }
        h2 {
            color: #00a884;
            margin-top: 0;
            font-size: 24px;
        }
        p {
            color: #8696a0;
            line-height: 1.5;
            margin-bottom: 30px;
        }
        .qr-container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            display: inline-block;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }
        img {
            display: block;
            width: 280px;
            height: 280px;
        }
        .status {
            margin-top: 25px;
            font-weight: bold;
            color: #eed060;
        }
    </style>
    <script>
        // Recarregar a página a cada 15 segundos para atualizar o QR code se expirar
        setTimeout(() => {
            window.location.reload();
        }, 15000);
    </script>
</head>
<body>
    <div class="card">
        <h2>Conectar WhatsApp do SDR</h2>
        <p>1. Abra o WhatsApp no seu celular.<br>
           2. Toque em <b>Mais opções</b> ou <b>Configurações</b> e selecione <b>Aparelhos conectados</b>.<br>
           3. Toque em <b>Conectar um aparelho</b>.<br>
           4. Aponte seu celular para esta tela para escanear o código.</p>
        <div class="qr-container">
            <img src="${base64Image}" alt="WhatsApp QR Code" />
        </div>
        <div class="status">Aguardando escaneamento... a página recarrega automaticamente a cada 15s.</div>
    </div>
</body>
</html>`;

  const filePath = path.join(__dirname, '../../public/qrcode.html');
  fs.writeFileSync(filePath, htmlContent, 'utf-8');
  console.log(`\n==================================================================`);
  console.log(`🟢 QR Code gerado com sucesso!`);
  console.log(`👉 Abra o arquivo no navegador para escanear:`);
  console.log(`   file:///${filePath.replace(/\\/g, '/')}`);
  console.log(`==================================================================\n`);
}

async function createInstance() {
  console.log(`📝 Criando nova instância: ${INSTANCE_NAME}...`);
  const createRes = await request('/instance/create', 'POST', {
    instanceName: INSTANCE_NAME,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS'
  });
  
  if (createRes.qrcode?.base64) {
    await generateQrHtml(createRes.qrcode.base64);
  } else if (createRes.code) {
    // Caso venha em outro formato de propriedade
    await generateQrHtml(createRes.code);
  } else {
    console.log('⚠️ Instância criada, mas o QR Code não foi retornado imediatamente. Tentando conectar...');
    await delay(3000);
    const connectRes = await request(`/instance/connect/${INSTANCE_NAME}`, 'GET');
    if (connectRes.base64) {
      await generateQrHtml(connectRes.base64);
    } else {
      console.log('⚠️ Falha ao obter o QR Code após a criação da instância.');
    }
  }
}

async function main() {
  console.log('🔄 Iniciando processo de conexão com a Evolution API...');
  
  // Aguarda a API estar disponível (caso o container ainda esteja iniciando)
  let retries = 10;
  while (retries > 0) {
    try {
      await fetch(`${API_URL}/instance/fetchInstances`, {
        headers: { 'apikey': API_KEY }
      });
      break;
    } catch (e) {
      console.log(`⏳ Aguardando Evolution API iniciar... (${retries} tentativas restantes)`);
      await delay(3000);
      retries--;
    }
  }

  if (retries === 0) {
    console.error('❌ Falha ao conectar com a Evolution API. Certifique-se de que o container Docker está rodando.');
    process.exit(1);
  }

  const exists = await checkInstanceExists(INSTANCE_NAME);
  
  if (!exists) {
    await createInstance();
    return;
  }

  console.log(`🔍 Instância "${INSTANCE_NAME}" já existe. Verificando estado da conexão...`);
  try {
    const connectRes = await request(`/instance/connect/${INSTANCE_NAME}`, 'GET');
    
    if (connectRes.status === 'CONNECTED') {
      console.log('✅ O WhatsApp do SDR já está CONECTADO e pronto para uso!');
      
      const qrFile = path.join(__dirname, '../../public/qrcode.html');
      if (fs.existsSync(qrFile)) {
        fs.unlinkSync(qrFile);
      }
      return;
    }
    
    if (connectRes.base64) {
      await generateQrHtml(connectRes.base64);
    } else {
      // Se não retornou base64 e não está conectado (e.g. após limpar cache do Redis), deletamos e recriamos
      console.log('⚠️ A instância está desconectada e não retornou QR Code. Reiniciando instância (deletando e recriando)...');
      try {
        await request(`/instance/delete/${INSTANCE_NAME}`, 'DELETE');
        await delay(2000);
      } catch (err: any) {
        console.log(`ℹ️ Nota ao deletar: ${err.message}`);
      }
      await createInstance();
    }
  } catch (err: any) {
    console.log('⚠️ Erro ao verificar conexão. Tentando recriar instância...');
    try {
      await request(`/instance/delete/${INSTANCE_NAME}`, 'DELETE');
      await delay(2000);
    } catch (e) {}
    await createInstance();
  }
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});

import { repo, Flow, FlowExecution } from '../../layers/database/repository.js';
import { outboundConnector } from '../whatsapp/OutboundConnector.js';
import { aiOrchestrator } from '../orchestrator/AIOrchestrator.js';

export class FlowEngine {
  
  /**
   * Tenta iniciar um fluxo que case com a mensagem recebida.
   * Retorna true se um fluxo foi iniciado, false caso contrário.
   */
  public async tryStartFlowForMessage(tenantId: string, leadId: string, text: string): Promise<boolean> {
    const flows = await repo.getFlows(tenantId);
    const activeFlows = flows.filter(f => f.isActive);
    
    // Procura por keyword
    const keywordFlow = activeFlows.find(f => 
      f.trigger === 'keyword' && 
      f.triggerValue && 
      text.toLowerCase().includes(f.triggerValue.toLowerCase())
    );

    if (keywordFlow) {
      await this.startFlow(keywordFlow, leadId);
      return true;
    }

    return false;
  }

  /**
   * Inicia um fluxo para um lead específico.
   */
  public async startFlow(flow: Flow, leadId: string): Promise<void> {
    let nodesData: any = {};
    try {
      const parsed = JSON.parse(flow.nodes);
      nodesData = parsed.drawflow?.Home?.data || {};
    } catch (e) {
      console.error(`[FlowEngine] Error parsing nodes for flow ${flow.id}`, e);
      return;
    }

    // Acha o nó inicial (trigger)
    const triggerNode = Object.values(nodesData).find((n: any) => n.name === 'trigger');
    if (!triggerNode) {
      console.error(`[FlowEngine] No trigger node found for flow ${flow.id}`);
      return;
    }

    const exec = await repo.createFlowExecution({
      flowId: flow.id,
      leadId,
      currentNodeId: String((triggerNode as any).id),
      status: 'RUNNING',
      variables: '{}'
    });

    await this.processNode(exec, flow, nodesData);
  }

  /**
   * Retoma a execução de um fluxo que estava pausado esperando resposta.
   */
  public async resumeFlow(exec: FlowExecution, flow: Flow, text: string): Promise<void> {
    let nodesData: any = {};
    try {
      const parsed = JSON.parse(flow.nodes);
      nodesData = parsed.drawflow?.Home?.data || {};
    } catch (e) {
      return;
    }

    const currentNode = nodesData[exec.currentNodeId];
    if (!currentNode) return;

    if (currentNode.name === 'wait_reply') {
      // Salva a resposta em variáveis
      const vars = JSON.parse(exec.variables || '{}');
      vars['last_reply'] = text;
      if (currentNode.data?.variable_name) {
        vars[currentNode.data.variable_name] = text;
      }
      await repo.updateFlowExecution(exec.id, { variables: JSON.stringify(vars) });

      // Move para o próximo nó
      await this.moveToNextNode(exec, flow, nodesData, currentNode);
    } else {
      // Se estava pausado por outro motivo, tenta seguir
      await this.processNode(exec, flow, nodesData);
    }
  }

  /**
   * Processa o nó atual e avança.
   */
  private async processNode(exec: FlowExecution, flow: Flow, nodesData: any): Promise<void> {
    if (exec.status !== 'RUNNING') return;

    const node = nodesData[exec.currentNodeId];
    if (!node) {
      await repo.updateFlowExecution(exec.id, { status: 'COMPLETED' });
      return;
    }

    const lead = await repo.getLeadById(exec.leadId);
    if (!lead) return;

    try {
      switch (node.name) {
        case 'trigger':
          // Apenas avança
          await this.moveToNextNode(exec, flow, nodesData, node);
          break;

        case 'message':
          const msg = node.data?.text || '';
          if (msg) {
            await outboundConnector.sendMessage(lead.tenantId, {
              leadId: lead.id,
              phone: lead.phone,
              formattedContent: this.replaceVars(msg, exec.variables),
            });
            // Adiciona aos messages também
            await repo.createMessage(lead.id, 'SDR', this.replaceVars(msg, exec.variables));
          }
          await this.moveToNextNode(exec, flow, nodesData, node);
          break;

        case 'media':
          const url = node.data?.url || '';
          const type = node.data?.type || 'image';
          if (url) {
            await outboundConnector.sendMessage(lead.tenantId, {
              leadId: lead.id,
              phone: lead.phone,
              formattedContent: `[SEND_MEDIA: ${url}]`,
            });
          }
          await this.moveToNextNode(exec, flow, nodesData, node);
          break;

        case 'wait_reply':
          // Pausa execução e aguarda
          await repo.updateFlowExecution(exec.id, { status: 'PAUSED' });
          break;

        case 'condition':
          // Avalia condição para ver qual output pegar
          // Simplificado: sempre pega a primeira porta se existir, senao a segunda
          await this.moveToNextNode(exec, flow, nodesData, node);
          break;

        case 'ai_message':
          // Chama a IA para gerar resposta baseada num prompt do nó
          const prompt = node.data?.prompt || 'Responda naturalmente';
          // Para simplificar no flow, injeta msg fake e pede pro orquestrador rodar com prompt injetado
          // ou aqui poderíamos chamar LLM direto.
          await outboundConnector.sendMessage(lead.tenantId, {
            leadId: lead.id,
            phone: lead.phone,
            formattedContent: `[IA vai responder usando: ${prompt}]`,
          });
          await this.moveToNextNode(exec, flow, nodesData, node);
          break;

        
        case 'human_transfer':
          // Muda status do lead para HANDOFF (o que fará o ConversationEngine ignorar)
          await repo.updateLead(lead.id, { status: 'HANDOFF', botPaused: true });
          await repo.updateFlowExecution(exec.id, { status: 'COMPLETED' });
          console.log(`[FlowEngine] Transferido para humano (Lead ${lead.id})`);
          return; // Para o fluxo

          // Aqui notificaríamos o painel
          break;

        default:
          await this.moveToNextNode(exec, flow, nodesData, node);
          break;
      }
    } catch (err) {
      console.error(`[FlowEngine] Error processing node ${node.id}`, err);
      await repo.updateFlowExecution(exec.id, { status: 'FAILED' });
    }
  }

  private async moveToNextNode(exec: FlowExecution, flow: Flow, nodesData: any, currentNode: any) {
    const outputs = currentNode.outputs || {};
    // Pegar o output_1 por padrão (ou o primeiro com conexões)
    const outKeys = Object.keys(outputs);
    let nextNodeId = null;

    for (const key of outKeys) {
      const connections = outputs[key].connections || [];
      if (connections.length > 0) {
        nextNodeId = connections[0].node;
        break; // Pega o primeiro por enquanto
      }
    }

    if (nextNodeId && nodesData[nextNodeId]) {
      await repo.updateFlowExecution(exec.id, { currentNodeId: String(nextNodeId), status: 'RUNNING' });
      const updatedExec = await repo.getFlowExecution(exec.leadId); // Get fresh object to continue
      if (updatedExec) {
         // Chamada recursiva para processar o próximo, num setImmediate pra não estourar a stack
         setImmediate(() => this.processNode(updatedExec, flow, nodesData));
      }
    } else {
      // Fim do fluxo
      await repo.updateFlowExecution(exec.id, { status: 'COMPLETED' });
    }
  }

  private replaceVars(text: string, variablesStr: string | null): string {
    if (!variablesStr) return text;
    try {
      const vars = JSON.parse(variablesStr);
      let replaced = text;
      for (const [k, v] of Object.entries(vars)) {
        replaced = replaced.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
      }
      return replaced;
    } catch (e) {
      return text;
    }
  }
}

export const flowEngine = new FlowEngine();

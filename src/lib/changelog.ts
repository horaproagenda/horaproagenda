import { APP_VERSION, APP_BUILD_TIME } from './version';

export interface ChangelogEntry {
  version: string;
  date: string; // ISO ou texto curto (dd/mm/yyyy)
  highlights: string[];
  changes: {
    type: 'novo' | 'melhoria' | 'correção' | 'segurança';
    description: string;
  }[];
}

/**
 * Histórico de versões do aplicativo.
 *
 * Sempre que uma nova versão for publicada, adicione uma nova entrada
 * NO TOPO da lista abaixo, mantendo o histórico para que a Central de
 * Ajuda exiba automaticamente as novidades da versão atual e o
 * histórico completo.
 *
 * A versão atual usada como destaque é `APP_VERSION` (src/lib/version.ts).
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v1.0.3',
    date: '13/06/2026',
    highlights: [
      'Validação obrigatória no preenchimento público de documentos',
      'Prévia editável da mensagem antes de enviar pelo WhatsApp',
      'Relatório de Atendimentos por Profissional em tempo real',
      'Padronização de Contratos, Termos e Anamneses',
    ],
    changes: [
      { type: 'novo', description: 'Prévia editável da mensagem em todos os fluxos de envio por WhatsApp (documentos, orçamentos, cadastro, recibos, suporte e templates).' },
      { type: 'novo', description: 'Bloqueio de envio em formulários públicos quando há perguntas obrigatórias não respondidas, com destaque vermelho no campo pendente.' },
      { type: 'novo', description: 'Aba “Novidades” na Central de Ajuda mostrando o que mudou em cada versão.' },
      { type: 'melhoria', description: 'Relatório de Atendimentos por Profissional atualizado em tempo real via Supabase Realtime (data, cliente, serviço, valor, comissão).' },
      { type: 'melhoria', description: 'Contratos, Termos e Anamneses agora aparecem com o nome correto em todas as listagens (Documentos, Perfil do Cliente).' },
      { type: 'melhoria', description: 'No envio de link de documentos, removida a opção “Copiar Link”; mensagem padronizada com instruções de preenchimento e assinatura.' },
      { type: 'segurança', description: 'Mensagem padrão alerta o cliente que o link é único e não deve ser compartilhado.' },
    ],
  },
  {
    version: 'v1.0.2',
    date: '06/2026',
    highlights: [
      'Detector de novas versões independente do Service Worker',
      'Auto-cura de dados legados após publicação',
      'Painel de integridade Agenda × Pacotes',
    ],
    changes: [
      { type: 'novo', description: 'Watcher de versão verifica novas builds a cada 30s e recarrega automaticamente quando detecta atualização.' },
      { type: 'novo', description: 'Painel “Integridade Agenda & Pacotes” em Configurações para auditar e corrigir inconsistências.' },
      { type: 'melhoria', description: 'Cancelamento/reagendamento libera automaticamente a sessão de pacote vinculada.' },
      { type: 'melhoria', description: 'Preferências por profissional (horário, agenda, automações) sobrepõem as configurações gerais.' },
      { type: 'correção', description: 'Datas de pacote, status legados e intervalos mínimos normalizados após cada publicação.' },
    ],
  },
  {
    version: 'v1.0.1',
    date: '05/2026',
    highlights: [
      'Intervalo mínimo de 21 dias entre aplicações de pacote',
      'Sistema de cores por profissional unificado',
      'Banner “Retomar onde parou” em listas grandes',
    ],
    changes: [
      { type: 'novo', description: 'Bloqueio automático de aplicações de pacote a menos de 21 dias, com cascata via triggers no banco.' },
      { type: 'novo', description: 'Cores do profissional aplicadas de forma consistente em agenda, relatórios e comissões.' },
      { type: 'melhoria', description: 'Tipografia unificada (Poppins) em tabelas, relatórios e cards de resumo.' },
      { type: 'melhoria', description: 'Custo de material por aplicação calculado de forma unificada (precificação + devolução de pacote).' },
    ],
  },
  {
    version: 'v1.0.0',
    date: '04/2026',
    highlights: [
      'Lançamento oficial do Hora Pro',
    ],
    changes: [
      { type: 'novo', description: 'Agenda multiprofissional com Realtime, drag-and-drop, recorrência e validação de conflitos.' },
      { type: 'novo', description: 'Módulo financeiro completo (caixa, contas a pagar/receber, comissões, boletos parcelados).' },
      { type: 'novo', description: 'Gestão de clientes com créditos, documentos (contratos, termos, anamneses), fotos de evolução e histórico.' },
      { type: 'novo', description: 'Catálogo de serviços, pacotes de sessões e controle de estoque com previsão de consumo.' },
      { type: 'novo', description: 'Integração WhatsApp (Evolution API v6) com automações de lembrete, atrasos e estoque baixo.' },
      { type: 'novo', description: 'Sistema de permissões granular por usuário e auditoria completa de ações.' },
    ],
  },
];

export const CURRENT_VERSION = APP_VERSION;
export const CURRENT_BUILD_TIME = APP_BUILD_TIME;

export const CURRENT_CHANGELOG: ChangelogEntry | undefined =
  CHANGELOG.find((c) => c.version === APP_VERSION) ?? CHANGELOG[0];

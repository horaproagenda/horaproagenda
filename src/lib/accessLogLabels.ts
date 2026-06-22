// Friendly labels and summary helpers for access logs.

export const fieldLabels: Record<string, string> = {
  // Comuns
  name: 'Nome',
  phone: 'Número de celular',
  email: 'E-mail',
  cpf: 'CPF',
  cnpj: 'CNPJ',
  birthdate: 'Data de nascimento',
  address: 'Endereço',
  tags: 'Etiquetas',
  observations: 'Observações',
  notes: 'Observações',
  status: 'Status',
  is_active: 'Ativo/Inativo',

  // Cliente
  client_id: 'Cliente',
  client_name: 'Nome do cliente',
  client_phone: 'Celular do cliente',
  last_appointment: 'Último atendimento',

  // Profissional
  professional_id: 'Profissional',
  professional_name: 'Profissional',
  commission_percentage: 'Comissão (%)',
  commission_fixed_value: 'Comissão (valor fixo)',
  commission_type: 'Tipo de comissão',
  commission_frequency: 'Frequência de comissão',
  permissions: 'Permissões',
  app_role: 'Perfil de acesso',
  agenda_color: 'Cor na agenda',
  specialties: 'Especialidades',

  // Serviço
  service_id: 'Serviço',
  service_name: 'Serviço',
  service_price: 'Valor do serviço',
  category: 'Categoria',
  duration: 'Duração',
  price: 'Preço',
  professionals: 'Profissionais habilitados',

  // Sala / Equipamento
  room_id: 'Sala',
  room_name: 'Sala',
  equipment_id: 'Equipamento',
  equipment_name: 'Equipamento',

  // Agendamento
  scheduled_date: 'Data agendada',
  scheduled_time: 'Horário',
  start_time: 'Início',
  end_time: 'Término',
  payment_status: 'Status de pagamento',

  // Financeiro
  amount: 'Valor',
  payment_method: 'Forma de pagamento',
  due_date: 'Vencimento',
  paid_at: 'Pago em',
  discount_amount: 'Desconto',
  final_amount: 'Valor final',

  // Credenciais
  temp_password: 'Senha temporária',

  // Genéricos comuns que apareciam em inglês/cru no log
  type: 'Tipo',
  description: 'Descrição',
  title: 'Título',
  content: 'Conteúdo',
  role: 'Perfil',
  created_at: 'Criado em',
  updated_at: 'Atualizado em',
  created_by: 'Criado por',
  updated_by: 'Atualizado por',
  deleted_at: 'Excluído em',
  id: 'Identificador',
  user_id: 'Usuário',
  account_id: 'Conta',
  message: 'Mensagem',
  metadata: 'Detalhes',
  fields: 'Campos',
  value: 'Valor',
  total: 'Total',
  quantity: 'Quantidade',
  duration_minutes: 'Duração (min)',
  start_at: 'Início',
  end_at: 'Término',
  reason: 'Motivo',
};

export const targetTypeLabels: Record<string, string> = {
  appointment: 'Agendamento',
  client: 'Cliente',
  professional: 'Profissional',
  service: 'Serviço',
  package: 'Pacote',
  product: 'Produto',
  equipment: 'Equipamento',
  room: 'Sala',
  financial_entry: 'Lançamento financeiro',
  cash_register: 'Caixa',
  professional_credential: 'Credencial de profissional',
};

export const moduleLabels: Record<string, string> = {
  agenda: 'Agenda',
  professional_sensitive: 'Profissional (sensível)',
  professional_credentials: 'Credenciais de profissional',
  servicos: 'Serviços',
  financeiro: 'Financeiro',
  caixa: 'Caixa',
  clientes: 'Clientes',
  produtos: 'Produtos',
};

/**
 * Devolve um rótulo amigável em PT-BR para um nome de campo técnico.
 * - Usa o dicionário `fieldLabels` quando disponível.
 * - Caso contrário, transforma `snake_case`/`camelCase` em frase capitalizada
 *   (ex.: "payment_status" -> "Payment status" -> "Payment Status"? não:
 *   primeira letra maiúscula, restante minúsculo) para evitar mostrar
 *   identificadores crus como "type", "descripcion" para o usuário final.
 */
export function labelField(code: string): string {
  if (!code) return '';
  if (fieldLabels[code]) return fieldLabels[code];
  const normalized = code
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!normalized) return code;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}


export function labelTargetType(t?: string | null): string {
  if (!t) return '';
  return targetTypeLabels[t] ?? t;
}

/**
 * "Alvo" = sobre qual registro a ação aconteceu.
 * Ex.: ao abrir o perfil de um cliente, o alvo é "Cliente — João Silva".
 * Quando não há alvo específico (ex.: abrir a página /agenda), retornamos o módulo.
 *
 * IMPORTANTE: nunca exibimos o hash/ID do registro. Para agendamentos, montamos a
 * descrição a partir do `metadata` do log (client_name, service_name, scheduled_date,
 * scheduled_time). Quando o metadata está parcial, exibimos apenas as partes
 * disponíveis; quando está totalmente vazio, mostramos "Agendamento".
 */
function pickStr(meta: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return '';
}

function appointmentLabel(meta: Record<string, unknown>, opts: { preferService?: boolean } = {}): string {
  const clientName = pickStr(meta, 'client_name', 'client', 'patient_name');
  const serviceName = pickStr(meta, 'service_name', 'service', 'package_name');
  const date = pickStr(meta, 'scheduled_date', 'date');
  const time = pickStr(meta, 'scheduled_time', 'start_time', 'time');

  const parts: string[] = [];
  if (opts.preferService) {
    if (serviceName) parts.push(`Serviço: ${serviceName}`);
    if (clientName) parts.push(`Cliente: ${clientName}`);
  } else {
    if (clientName) parts.push(`Cliente: ${clientName}`);
    if (serviceName) parts.push(`Serviço: ${serviceName}`);
  }
  if (date || time) parts.push([date, time].filter(Boolean).join(' '));

  return parts.length > 0 ? `Agendamento — ${parts.join(' • ')}` : 'Agendamento';
}

export function describeTarget(log: {
  target_type?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown> | null;
  module: string;
}, opts: { preferService?: boolean } = {}): string {
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const generic = pickStr(meta, 'target_name', 'name');

  if (log.target_type === 'appointment') {
    return appointmentLabel(meta, opts);
  }

  if (log.target_type) {
    const base = labelTargetType(log.target_type);
    const name =
      generic ||
      pickStr(meta, 'client_name') ||
      pickStr(meta, 'service_name') ||
      pickStr(meta, 'professional_name');
    return name ? `${base} — ${name}` : base;
  }
  // Sem alvo específico: a ação foi feita na página/listagem do módulo
  return `Listagem de ${moduleLabels[log.module] ?? log.module}`;
}

/**
 * Resumo amigável: "Visualizou Perfil do cliente, Nome do cliente, Celular do cliente."
 */
export function summarizeFields(fields: string[] | null | undefined): string {
  if (!fields || fields.length === 0) return '';
  return fields.map(labelField).join(', ');
}

export function summarizeLog(log: {
  action: string;
  fields_viewed?: string[] | null;
  fields_changed?: string[] | null;
  target_type?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown> | null;
  module: string;
}): string {
  // Para agendamentos, no resumo mostramos cliente + serviço (+ data/horário, se houver).
  const target = describeTarget(log);
  const viewed = summarizeFields(log.fields_viewed);
  const changed = summarizeFields(log.fields_changed);

  if (log.action === 'view' || log.action === 'open') {
    return viewed
      ? `Visualizou em ${target}: ${viewed}.`
      : `Acessou ${target}.`;
  }
  if (log.action === 'edit' || log.action === 'update') {
    return changed
      ? `Editou em ${target}: ${changed}.`
      : `Editou ${target}.`;
  }
  if (log.action === 'create') {
    return changed
      ? `Criou ${target} com ${changed}.`
      : `Criou ${target}.`;
  }
  if (log.action === 'delete') return `Excluiu ${target}.`;
  if (log.action === 'export') return `Exportou ${target}.`;
  return `${log.action} em ${target}.`;
}


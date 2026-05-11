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

export function labelField(code: string): string {
  return fieldLabels[code] ?? code.replace(/_/g, ' ');
}

export function labelTargetType(t?: string | null): string {
  if (!t) return '';
  return targetTypeLabels[t] ?? t;
}

/**
 * "Alvo" = sobre qual registro a ação aconteceu.
 * Ex.: ao abrir o perfil de um cliente, o alvo é "Cliente — João Silva".
 * Quando não há alvo específico (ex.: abrir a página /agenda), retornamos o módulo.
 */
export function describeTarget(log: {
  target_type?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown> | null;
  module: string;
}): string {
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const name =
    (meta.target_name as string) ||
    (meta.client_name as string) ||
    (meta.professional_name as string) ||
    (meta.name as string) ||
    '';

  if (log.target_type) {
    const base = labelTargetType(log.target_type);
    if (name) return `${base} — ${name}`;
    if (log.target_id) return `${base} #${String(log.target_id).slice(0, 8)}`;
    return base;
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

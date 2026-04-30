import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FIELD_LABELS: Record<string, string> = {
  start_time: 'Horário de início',
  end_time: 'Horário de término',
  status: 'Status',
  payment_status: 'Status de pagamento',
  amount_paid: 'Valor pago',
  discount_amount: 'Desconto',
  used_client_credit: 'Crédito do cliente usado',
  client_credit: 'Saldo gerado para o cliente',
  notes: 'Observações',
  professional_id: 'Profissional',
  room_id: 'Sala',
  service_id: 'Serviço',
  client_id: 'Cliente',
  payment_methods: 'Forma de pagamento',
};

export const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  missed: 'Faltou',
  rescheduled: 'Reagendado',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  partial: 'Parcial',
  paid: 'Pago',
};

// Internal/technical fields that should NEVER be shown in the changes panel
export const HIDDEN_FIELDS = new Set([
  'updated_at',
  'updated_by',
  'created_at',
  'created_by',
  'version',
  'last_seen_at',
  'recurring_group_id',
  'package_appointment_id',
  'id',
]);

export type NameMaps = {
  payment_methods?: Map<string, string>;
  professional_id?: Map<string, string>;
  room_id?: Map<string, string>;
  service_id?: Map<string, string>;
  client_id?: Map<string, string>;
};

export function resolveName(maps: NameMaps, field: keyof NameMaps, id: string): string {
  const map = maps[field];
  return (map && map.get(id)) || id;
}

export function formatHistoryValue(field: string, value: unknown, maps: NameMaps = {}): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'start_time' || field === 'end_time') {
    try {
      return format(new Date(value as string), "dd/MM/yyyy 'às' HH:mm");
    } catch {
      return String(value);
    }
  }
  if (field === 'status') return STATUS_LABELS[String(value)] || String(value);
  if (field === 'payment_status') return PAYMENT_STATUS_LABELS[String(value)] || String(value);
  if (
    field === 'amount_paid' ||
    field === 'discount_amount' ||
    field === 'used_client_credit' ||
    field === 'client_credit'
  ) {
    return formatCurrency(Number(value) || 0);
  }
  if (field === 'payment_methods' && Array.isArray(value)) {
    if (!value.length) return '—';
    return value
      .map(v =>
        typeof v === 'string' && UUID_RE.test(v) ? resolveName(maps, 'payment_methods', v) : String(v)
      )
      .join(', ');
  }
  if (
    (field === 'professional_id' ||
      field === 'room_id' ||
      field === 'service_id' ||
      field === 'client_id') &&
    typeof value === 'string'
  ) {
    return resolveName(maps, field, value);
  }
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export type ChangeDescription = {
  title: string;
  description: string;
  isPayment: boolean;
};

export function buildChangeDescription(
  action: string,
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
  maps: NameMaps = {}
): ChangeDescription {
  if (action === 'INSERT') {
    return { title: 'Agendamento criado', description: 'Registro inicial do agendamento.', isPayment: false };
  }
  if (action === 'DELETE') {
    return { title: 'Agendamento excluído', description: 'Registro removido do sistema.', isPayment: false };
  }
  if (!oldData || !newData) {
    return { title: 'Agendamento alterado', description: `Ação: ${action}`, isPayment: false };
  }

  const diffs: string[] = [];
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  let isPaymentChange = false;

  for (const key of keys) {
    if (HIDDEN_FIELDS.has(key)) continue;
    const before = (oldData as any)[key];
    const after = (newData as any)[key];
    const beforeStr = JSON.stringify(before ?? null);
    const afterStr = JSON.stringify(after ?? null);
    if (beforeStr === afterStr) continue;

    // Skip if both values render as the same human-readable text (e.g. unchanged FK)
    const beforeFmt = formatHistoryValue(key, before, maps);
    const afterFmt = formatHistoryValue(key, after, maps);
    if (beforeFmt === afterFmt) continue;

    const label = FIELD_LABELS[key];
    // If we don't have a friendly label, skip — never show raw column names like "recurring_group_id"
    if (!label) continue;

    if (['amount_paid', 'payment_status', 'used_client_credit', 'discount_amount', 'payment_methods'].includes(key)) {
      isPaymentChange = true;
    }
    diffs.push(`${label}: ${beforeFmt} → ${afterFmt}`);
  }

  if (diffs.length === 0) {
    return { title: 'Agendamento atualizado', description: 'Sem alterações relevantes detectadas.', isPayment: false };
  }

  const wasPaid = (oldData as any).payment_status;
  const nowPaid = (newData as any).payment_status;
  const paidDelta = Number((newData as any).amount_paid || 0) - Number((oldData as any).amount_paid || 0);

  let title = 'Agendamento alterado';
  if (isPaymentChange && paidDelta > 0) {
    const methodsAfter = Array.isArray((newData as any).payment_methods)
      ? formatHistoryValue('payment_methods', (newData as any).payment_methods, maps)
      : '';
    const methodSuffix = methodsAfter && methodsAfter !== '—' ? ` • ${methodsAfter}` : '';
    title =
      nowPaid === 'paid'
        ? `Baixa de pagamento registrada (${formatCurrency(paidDelta)})${methodSuffix}`
        : `Pagamento parcial registrado (${formatCurrency(paidDelta)})${methodSuffix}`;
  } else if (wasPaid !== nowPaid && nowPaid) {
    title = `Status de pagamento alterado para ${PAYMENT_STATUS_LABELS[nowPaid] || nowPaid}`;
  } else if (diffs.length === 1) {
    title = diffs[0];
  }

  return { title, description: diffs.join(' • '), isPayment: isPaymentChange };
}

export function resolveAuthorName(
  userEmail: string | null | undefined,
  professionalsByEmail: Map<string, string>
): string {
  if (!userEmail) return '';
  return professionalsByEmail.get(userEmail.toLowerCase()) || userEmail;
}

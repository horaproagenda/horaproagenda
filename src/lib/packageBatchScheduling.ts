import { supabase } from '@/integrations/supabase/client';

/**
 * Agendamento de pacotes (comum e sequencial) em UMA única transação.
 *
 * Toda a gravação acontece dentro de `schedule_package_sessions_batch` no banco:
 * cada sessão é validada com a MESMA regra usada pelas telas
 * (`appointment_conflict_reason`) e vinculada ao ID único da etapa
 * (`package_appointments.id`). Se qualquer sessão falhar, nada é salvo — nunca
 * sobra pacote agendado pela metade nem etapa com serviço trocado.
 */
export interface PackageBatchItem {
  /** ID único e imutável da etapa do pacote. */
  packageAppointmentId: string;
  serviceId?: string | null;
  professionalId?: string | null;
  roomId?: string | null;
  equipmentId?: string | null;
  start: Date;
  end: Date;
  notes?: string | null;
  paymentStatus?: string | null;
  discountAmount?: number | null;
  /** Número da etapa, usado apenas nas mensagens da tela. */
  step?: number | null;
}

export interface PackageBatchResult {
  createdCount: number;
  requestedCount: number;
  created: Array<{ appointment_id: string; package_appointment_id: string; step: number | null }>;
  alreadyScheduled: Array<{ appointment_id: string; package_appointment_id: string; step: number | null }>;
}

export interface PackageScheduleIssue {
  step: string | null;
  problem: string;
  package_appointment_id?: string | null;
}

const toRpcItem = (item: PackageBatchItem) => ({
  package_appointment_id: item.packageAppointmentId,
  service_id: item.serviceId ?? null,
  professional_id: item.professionalId ?? null,
  room_id: item.roomId ?? null,
  equipment_id: item.equipmentId ?? null,
  start_time: item.start.toISOString(),
  end_time: item.end.toISOString(),
  notes: item.notes ?? null,
  payment_status: item.paymentStatus ?? 'pending',
  discount_amount: item.discountAmount ?? 0,
});

/** Grava todas as sessões de uma vez (ou nenhuma). */
export async function schedulePackageSessionsBatch(params: {
  clientId: string;
  packageId: string;
  items: PackageBatchItem[];
  batchKey?: string | null;
}): Promise<PackageBatchResult> {
  const { data, error } = await (supabase.rpc as unknown as RpcFn)('schedule_package_sessions_batch', {
    p_client_id: params.clientId,
    p_package_id: params.packageId,
    p_items: params.items.map(toRpcItem),
    p_batch_key: params.batchKey ?? null,
  });

  if (error) throw error;

  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    createdCount: Number(payload.created_count ?? 0),
    requestedCount: Number(payload.requested_count ?? params.items.length),
    created: Array.isArray(payload.created) ? payload.created : [],
    alreadyScheduled: Array.isArray(payload.already_scheduled) ? payload.already_scheduled : [],
  };
}

/**
 * Conferência: compara o que ficou gravado (etapa, data, horário e serviço) com
 * o que o formulário enviou.
 */
export async function verifyPackageSchedule(
  packageId: string,
  items: PackageBatchItem[],
): Promise<{ ok: boolean; checked: number; issues: PackageScheduleIssue[] }> {
  const { data, error } = await (supabase.rpc as unknown as RpcFn)('verify_package_schedule_batch', {
    p_package_id: packageId,
    p_expected: items.map(toRpcItem),
  });

  if (error) throw error;

  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    ok: !!payload.ok,
    checked: Number(payload.checked ?? 0),
    issues: Array.isArray(payload.issues) ? (payload.issues as PackageScheduleIssue[]) : [],
  };
}

/** Correção automática, sem intervenção manual. Nunca lança erro. */
export async function autohealPackageSchedule(packageId: string) {
  try {
    const { data, error } = await (supabase.rpc as unknown as RpcFn)('autoheal_package_schedule', {
      p_package_id: packageId,
    });
    if (error) throw error;
    const payload = (data ?? {}) as Record<string, unknown>;
    return {
      cleared: Number(payload.cleared ?? 0),
      relinked: Number(payload.relinked ?? 0),
      changed: Number(payload.cleared ?? 0) + Number(payload.relinked ?? 0) > 0,
    };
  } catch (err) {
    console.warn('Correção automática do pacote não pôde ser aplicada:', err);
    return { cleared: 0, relinked: 0, changed: false };
  }
}

/**
 * Confere e, se necessário, corrige automaticamente. Devolve os problemas que
 * permaneceram depois da correção — só esses precisam de aviso ao profissional.
 */
export async function verifyAndHealPackageSchedule(
  packageId: string,
  items: PackageBatchItem[],
): Promise<PackageScheduleIssue[]> {
  try {
    const first = await verifyPackageSchedule(packageId, items);
    if (first.ok) return [];

    await autohealPackageSchedule(packageId);

    const second = await verifyPackageSchedule(packageId, items);
    return second.issues;
  } catch (err) {
    console.warn('Não foi possível conferir o agendamento do pacote:', err);
    return [];
  }
}

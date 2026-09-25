import { supabase } from '@/integrations/supabase/client';

/**
 * ÚNICA forma de mudar data/hora de um agendamento no app.
 * Todas as telas (Agenda, arrastar, perfil do cliente, séries, pacotes,
 * pacotes sequenciais e kits) chamam esta função, que usa a operação
 * `reschedule_appointment` do banco. Ela valida conflitos com a mesma regra
 * do banco e, em pacotes sequenciais, mantém o serviço e a ordem da etapa.
 */
export interface RescheduleInput {
  appointmentId: string;
  start?: Date | string | null;
  end?: Date | string | null;
  expectedVersion?: number | null;
  fieldUpdates?: Partial<Record<'professional_id' | 'room_id' | 'equipment_id' | 'service_id' | 'notes', string | null>>;
}

const iso = (v?: Date | string | null) =>
  v == null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString();

const callRpc = (input: RescheduleInput, version: number | null) =>
  (supabase as any).rpc('reschedule_appointment', {
    p_appointment_id: input.appointmentId,
    p_new_start: iso(input.start),
    p_new_end: iso(input.end),
    p_expected_version: version,
    p_field_updates: input.fieldUpdates ?? {},
  });

const isVersionConflict = (e: any) =>
  /atualizado em outro dispositivo/i.test(String(e?.message ?? ''));

export async function rescheduleAppointment(input: RescheduleInput) {
  const { data, error } = await callRpc(input, input.expectedVersion ?? null);
  if (!error) return data;
  if (!isVersionConflict(error) || input.expectedVersion == null) throw error;

  // Versão em cache desatualizada: se a última alteração foi do próprio
  // usuário, repete com a versão atual em vez de bloquear o salvamento.
  const [{ data: row }, { data: auth }] = await Promise.all([
    (supabase as any).from('appointments').select('version, updated_by').eq('id', input.appointmentId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (!row || !auth?.user || (row.updated_by && row.updated_by !== auth.user.id)) throw error;
  const retry = await callRpc(input, row.version ?? null);
  if (retry.error) throw retry.error;
  return retry.data;
}

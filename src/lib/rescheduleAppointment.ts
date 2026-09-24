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

export async function rescheduleAppointment(input: RescheduleInput) {
  const { data, error } = await (supabase as any).rpc('reschedule_appointment', {
    p_appointment_id: input.appointmentId,
    p_new_start: iso(input.start),
    p_new_end: iso(input.end),
    p_expected_version: input.expectedVersion ?? null,
    p_field_updates: input.fieldUpdates ?? {},
  });
  if (error) throw error;
  return data;
}

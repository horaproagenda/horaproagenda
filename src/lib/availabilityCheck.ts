import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Verificação ÚNICA de disponibilidade.
 *
 * A regra vive no banco (`appointment_conflict_reason`), exatamente a mesma
 * aplicada pelo gatilho que bloqueia o salvamento de agendamentos. As telas
 * NÃO devem recalcular conflito de profissional, sala, equipamento ou ausência
 * por conta própria: qualquer divergência faria a interface prometer um horário
 * que o banco recusa (ou recusar um que ele aceitaria).
 */
export interface AvailabilitySlot {
  /** Agendamento sendo editado (ignorado na checagem). */
  id?: string | null;
  professionalId?: string | null;
  roomId?: string | null;
  equipmentId?: string | null;
  start: Date;
  end: Date;
  /** Status pretendido; padrão 'scheduled'. */
  status?: string | null;
}

const toPayload = (slot: AvailabilitySlot) => ({
  id: slot.id ?? null,
  professional_id: slot.professionalId ?? null,
  room_id: slot.roomId ?? null,
  equipment_id: slot.equipmentId ?? null,
  start: slot.start.toISOString(),
  end: slot.end.toISOString(),
  status: slot.status ?? 'scheduled',
});

const isValidSlot = (slot: AvailabilitySlot) =>
  slot.start instanceof Date &&
  slot.end instanceof Date &&
  !Number.isNaN(slot.start.getTime()) &&
  !Number.isNaN(slot.end.getTime()) &&
  slot.end > slot.start;

export const availabilitySlotKey = (slot: AvailabilitySlot) =>
  [
    slot.id ?? '',
    slot.professionalId ?? '',
    slot.roomId ?? '',
    slot.equipmentId ?? '',
    isValidSlot(slot) ? slot.start.toISOString() : 'invalid',
    isValidSlot(slot) ? slot.end.toISOString() : 'invalid',
    slot.status ?? 'scheduled',
  ].join('|');

/**
 * Devolve, para cada horário informado, o motivo do conflito em português
 * (texto vindo do banco) ou `null` quando o horário está livre.
 */
export async function checkAvailabilitySlots(slots: AvailabilitySlot[]): Promise<(string | null)[]> {
  const results: (string | null)[] = slots.map(() => null);
  const valid = slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => isValidSlot(slot));

  if (valid.length === 0) return results;

  const { data, error } = await supabase.rpc('appointment_conflict_reasons', {
    p_slots: valid.map(({ slot }) => toPayload(slot)) as never,
  });

  if (error) throw error;

  const rows = Array.isArray(data) ? (data as Array<{ index: number; reason: string | null }>) : [];
  rows.forEach((row) => {
    const target = valid[Number(row?.index)];
    if (!target) return;
    results[target.index] = row?.reason ? String(row.reason) : null;
  });

  return results;
}

export async function checkAvailabilitySlot(slot: AvailabilitySlot): Promise<string | null> {
  const [reason] = await checkAvailabilitySlots([slot]);
  return reason ?? null;
}

/**
 * Mapa pronto para consulta síncrona nas telas: chave do horário → motivo.
 */
export function useAvailabilityCheck(slots: AvailabilitySlot[], enabled = true) {
  const keys = slots.map(availabilitySlotKey);

  const query = useQuery({
    queryKey: ['availability-check', keys],
    enabled: enabled && slots.length > 0,
    staleTime: 5_000,
    gcTime: 30_000,
    queryFn: async () => {
      const reasons = await checkAvailabilitySlots(slots);
      const map: Record<string, string | null> = {};
      keys.forEach((key, index) => {
        map[key] = reasons[index] ?? null;
      });
      return map;
    },
  });

  const map = query.data ?? {};

  return {
    isChecking: query.isFetching,
    error: query.error,
    /** Motivo do conflito no banco, ou null quando livre / ainda não checado. */
    reasonFor: (slot: AvailabilitySlot) => map[availabilitySlotKey(slot)] ?? null,
  };
}

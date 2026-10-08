import { useMutation, useQueryClient } from '@tanstack/react-query';
import { applyAutoScheduleRule, loadAutoScheduleRule } from '@/lib/autoScheduleRules';
import { rescheduleAppointment } from '@/lib/rescheduleAppointment';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type KitScope = 'single' | 'future' | 'all';

export interface KitItemInput {
  service_id: string | null;
  professional_id?: string | null;
  room_id?: string | null;
  equipment_id?: string | null;
  start_time: string;
  end_time: string;
  notes?: string | null;
  discount_amount?: number;
  payment_status?: string;
  service_name_snapshot?: string | null;
  sequence_order?: number;
}

const KIT_QUERY_KEYS = [
  ['appointments'],
  ['client-appointments'],
  ['client_services'],
];

/**
 * Kits de serviços (serviços compostos): cada etapa é um agendamento
 * independente, criado em UMA única transação no banco (tudo ou nada) e
 * alterado/removido por escopo (somente este, este e os futuros, todos).
 */
export function useKitAppointments() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    KIT_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  };

  const createKit = useMutation({
    mutationFn: async ({ clientId, items, groupId }: { clientId: string; items: KitItemInput[]; groupId?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('create_composite_kit_appointments', {
        p_client_id: clientId,
        p_items: items,
        p_group_id: groupId ?? null,
      });
      if (error) {
        // A resposta pode falhar mesmo com o kit salvo (rede/tempo esgotado).
        // Confere no banco pelo identificador do kit antes de acusar erro.
        if (groupId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existing } = await (supabase as any)
            .from('appointments')
            .select('id')
            .eq('composite_group_id', groupId);
          if (Array.isArray(existing) && existing.length >= items.length) {
            return { composite_group_id: groupId, appointment_ids: existing.map((r: { id: string }) => r.id), count: existing.length, already_created: true };
          }
        }
        throw error;
      }
      return data as { composite_group_id: string; appointment_ids: string[]; count: number; already_created: boolean };
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(`Kit agendado: ${data?.count ?? 0} atendimento(s) criados.`);
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || 'Não foi possível agendar o kit agora.');
    },
  });

  const rescheduleKit = useMutation({
    mutationFn: async ({
      appointmentId,
      scope,
      newStart,
      newEnd,
    }: { appointmentId: string; scope: KitScope; newStart: Date; newEnd?: Date }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('reschedule_kit_appointments', {
        p_appointment_id: appointmentId,
        p_scope: scope,
        p_new_start: newStart.toISOString(),
        p_new_end: newEnd ? newEnd.toISOString() : null,
      });
      if (error) throw error;
      // Kits criados no automático: as etapas seguintes voltam ao dia da
      // semana/horário registrados (a etapa editada fica como o usuário escolheu).
      if (scope !== 'single') {
        await realignKitToAutoRule(appointmentId);
      }
      return data as { count: number };
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(`Kit atualizado: ${data?.count ?? 1} atendimento(s) reagendados.`);
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || 'Não foi possível alterar o kit agora.');
    },
  });

  const deleteKit = useMutation({
    mutationFn: async ({ appointmentId, scope, reason }: { appointmentId: string; scope: KitScope; reason?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('delete_kit_appointments', {
        p_appointment_id: appointmentId,
        p_scope: scope,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      return data as { deleted: number; cancelled: number; kept: number };
    },
    onSuccess: (data) => {
      invalidate();
      const parts: string[] = [];
      if (data?.deleted) parts.push(`${data.deleted} excluído(s)`);
      if (data?.cancelled) parts.push(`${data.cancelled} cancelado(s)`);
      if (data?.kept) parts.push(`${data.kept} mantido(s) no histórico`);
      toast.success(parts.length ? `Kit: ${parts.join(', ')}.` : 'Kit atualizado.');
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || 'Não foi possível remover o kit agora.');
    },
  });

  return { createKit, rescheduleKit, deleteKit };
}

async function realignKitToAutoRule(appointmentId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: src } = await sb.from('appointments').select('id, composite_group_id, start_time').eq('id', appointmentId).maybeSingle();
  const rule = await loadAutoScheduleRule(src?.composite_group_id);
  if (!src || !rule) return;
  const { data: tzRow } = await sb.from('business_settings').select('timezone').maybeSingle();
  const tz = tzRow?.timezone || 'America/Sao_Paulo';
  const { data: rows } = await sb.from('appointments').select('id, start_time, end_time, status')
    .eq('composite_group_id', src.composite_group_id).order('start_time', { ascending: true });
  let floor = new Date(src.start_time).getTime();
  // Tudo ou nada: guarda os horários originais para desfazer se uma etapa falhar.
  const done: { id: string; start: string; end: string }[] = [];
  try {
    for (const r of rows || []) {
      if (r.id === src.id || new Date(r.start_time).getTime() <= new Date(src.start_time).getTime()) continue;
      if (['completed', 'missed', 'cancelled'].includes(r.status)) continue;
      const dur = new Date(r.end_time).getTime() - new Date(r.start_time).getTime();
      let start = applyAutoScheduleRule(new Date(r.start_time), rule, tz);
      if (start.getTime() <= floor) start = applyAutoScheduleRule(new Date(floor + 86400000), rule, tz);
      if (start.getTime() !== new Date(r.start_time).getTime()) {
        await rescheduleAppointment({ appointmentId: r.id, start: start.toISOString(), end: new Date(start.getTime() + dur).toISOString() });
        done.push({ id: r.id, start: r.start_time, end: r.end_time });
      }
      floor = start.getTime();
    }
  } catch (err) {
    for (const d of done.reverse()) {
      try { await rescheduleAppointment({ appointmentId: d.id, start: d.start, end: d.end }); } catch { /* segue desfazendo */ }
    }
    throw err;
  }
}

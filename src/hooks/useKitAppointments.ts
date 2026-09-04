import { useMutation, useQueryClient } from '@tanstack/react-query';
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
      const { data, error } = await (supabase as any).rpc('create_composite_kit_appointments', {
        p_client_id: clientId,
        p_items: items,
        p_group_id: groupId ?? null,
      });
      if (error) throw error;
      return data as { composite_group_id: string; appointment_ids: string[]; count: number; already_created: boolean };
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(`Kit agendado: ${data?.count ?? 0} atendimento(s) criados.`);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Não foi possível agendar o kit agora.');
    },
  });

  const rescheduleKit = useMutation({
    mutationFn: async ({
      appointmentId,
      scope,
      newStart,
      newEnd,
    }: { appointmentId: string; scope: KitScope; newStart: Date; newEnd?: Date }) => {
      const { data, error } = await (supabase as any).rpc('reschedule_kit_appointments', {
        p_appointment_id: appointmentId,
        p_scope: scope,
        p_new_start: newStart.toISOString(),
        p_new_end: newEnd ? newEnd.toISOString() : null,
      });
      if (error) throw error;
      return data as { count: number };
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(`Kit atualizado: ${data?.count ?? 1} atendimento(s) reagendados.`);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Não foi possível alterar o kit agora.');
    },
  });

  const deleteKit = useMutation({
    mutationFn: async ({ appointmentId, scope, reason }: { appointmentId: string; scope: KitScope; reason?: string }) => {
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
    onError: (error: any) => {
      toast.error(error?.message || 'Não foi possível remover o kit agora.');
    },
  });

  return { createKit, rescheduleKit, deleteKit };
}

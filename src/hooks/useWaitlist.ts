import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWhatsapp } from './useWhatsapp';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { broadcastDataChange } from '@/hooks/useCrossDeviceSync';

export interface WaitlistEntry {
  id: string;
  client_id: string;
  service_id: string | null;
  professional_id: string | null;
  preferred_date: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  notes: string | null;
  status: 'waiting' | 'notified' | 'scheduled' | 'expired';
  created_at: string;
  client?: { id: string; name: string; phone: string | null };
  service?: { id: string; name: string };
  professional?: { id: string; name: string };
}

const LEGACY_KEY = 'agenda-waitlist';
const MIGRATION_FLAG = 'agenda-waitlist-migrated-v1';

/**
 * Migra qualquer lista de espera salva apenas no navegador (versão antiga)
 * para o banco no Supabase — assim qualquer dispositivo/link enxerga os
 * mesmos dados. Executa uma única vez por dispositivo.
 */
async function migrateLegacyLocalWaitlist(): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(MIGRATION_FLAG) === '1') return;
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      localStorage.setItem(MIGRATION_FLAG, '1');
      return;
    }
    const legacy = JSON.parse(raw) as WaitlistEntry[];
    if (!Array.isArray(legacy) || legacy.length === 0) {
      localStorage.removeItem(LEGACY_KEY);
      localStorage.setItem(MIGRATION_FLAG, '1');
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.user) return; // tenta novamente quando logar
    const rows = legacy
      .filter((e) => e && e.client_id)
      .map((e) => ({
        client_id: e.client_id,
        service_id: e.service_id || null,
        professional_id: e.professional_id || null,
        preferred_date: e.preferred_date || null,
        preferred_time_start: e.preferred_time_start || null,
        preferred_time_end: e.preferred_time_end || null,
        notes: e.notes || null,
        status: e.status || 'waiting',
      }));
    if (rows.length > 0) {
      // Insert ignorando duplicatas óbvias (mesmo cliente + serviço pendente)
      await supabase.from('waitlist').insert(rows as never);
    }
    localStorage.removeItem(LEGACY_KEY);
    localStorage.setItem(MIGRATION_FLAG, '1');
  } catch (e) {
    console.warn('[useWaitlist] Falha ao migrar lista local:', e);
  }
}

export function useWaitlist() {
  const queryClient = useQueryClient();
  const { sendMessage, connectionStatus } = useWhatsapp();

  useEffect(() => {
    void migrateLegacyLocalWaitlist();
  }, []);

  const { data: waitlist = [], isLoading } = useQuery({
    queryKey: ['waitlist'],
    queryFn: async (): Promise<WaitlistEntry[]> => {
      const { data, error } = await supabase
        .from('waitlist' as never)
        .select(`
          id, client_id, service_id, professional_id,
          preferred_date, preferred_time_start, preferred_time_end,
          notes, status, created_at,
          client:clients(id, name, phone),
          service:services(id, name),
          professional:professionals(id, name)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WaitlistEntry[];
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const addToWaitlist = useMutation({
    mutationFn: async (entry: Omit<WaitlistEntry, 'id' | 'status' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('waitlist' as never)
        .insert({
          client_id: entry.client_id,
          service_id: entry.service_id,
          professional_id: entry.professional_id,
          preferred_date: entry.preferred_date,
          preferred_time_start: entry.preferred_time_start,
          preferred_time_end: entry.preferred_time_end,
          notes: entry.notes,
          status: 'waiting',
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as WaitlistEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      broadcastDataChange();
      toast.success('Cliente adicionado à lista de espera');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Erro ao adicionar à lista de espera');
    },
  });

  const removeFromWaitlist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('waitlist' as never).delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      broadcastDataChange();
      toast.success('Removido da lista de espera');
    },
  });

  const updateWaitlistStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: WaitlistEntry['status'] }) => {
      const { error } = await supabase
        .from('waitlist' as never)
        .update({ status } as never)
        .eq('id', id);
      if (error) throw error;
      return { id, status };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      broadcastDataChange();
    },
  });

  const notifyWaitlistClients = useCallback(
    async (availableDate: Date, availableTime: string, serviceId?: string, professionalId?: string) => {
      if (!connectionStatus?.connected) {
        toast.error('WhatsApp não conectado');
        return;
      }

      const eligible = waitlist.filter((entry) => {
        if (entry.status !== 'waiting') return false;
        if (serviceId && entry.service_id && entry.service_id !== serviceId) return false;
        if (professionalId && entry.professional_id && entry.professional_id !== professionalId) return false;
        return true;
      });

      let notified = 0;
      for (const entry of eligible) {
        if (!entry.client?.phone) continue;
        const message = `Olá ${entry.client.name}! 🎉

Boa notícia! Surgiu uma vaga disponível:
📅 ${format(availableDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
⏰ ${availableTime}
${entry.service?.name ? `💆 ${entry.service.name}` : ''}

Deseja agendar? Responda SIM para confirmar!

*Primeiro a responder, garante a vaga!* ⚡`;
        const success = await sendMessage(entry.client.phone, message);
        if (success) {
          await updateWaitlistStatus.mutateAsync({ id: entry.id, status: 'notified' });
          notified++;
        }
      }
      if (notified > 0) toast.success(`${notified} cliente(s) notificado(s) sobre a vaga`);
    },
    [waitlist, connectionStatus, sendMessage, updateWaitlistStatus],
  );

  const activeWaitlist = useMemo(
    () => waitlist.filter((e) => e.status === 'waiting' || e.status === 'notified'),
    [waitlist],
  );

  return {
    waitlist,
    activeWaitlist,
    isLoading,
    addToWaitlist,
    removeFromWaitlist,
    updateWaitlistStatus,
    notifyWaitlistClients,
  };
}

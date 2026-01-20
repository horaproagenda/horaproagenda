import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWhatsapp } from './useWhatsapp';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
  client?: {
    id: string;
    name: string;
    phone: string | null;
  };
  service?: {
    id: string;
    name: string;
  };
  professional?: {
    id: string;
    name: string;
  };
}

export function useWaitlist() {
  const queryClient = useQueryClient();
  const { sendMessage, connectionStatus } = useWhatsapp();

  // Fetch waitlist entries from localStorage (simulating DB)
  const { data: waitlist = [], isLoading } = useQuery({
    queryKey: ['waitlist'],
    queryFn: async () => {
      const stored = localStorage.getItem('agenda-waitlist');
      if (!stored) return [];
      return JSON.parse(stored) as WaitlistEntry[];
    },
  });

  const saveWaitlist = useCallback((entries: WaitlistEntry[]) => {
    localStorage.setItem('agenda-waitlist', JSON.stringify(entries));
    queryClient.invalidateQueries({ queryKey: ['waitlist'] });
  }, [queryClient]);

  const addToWaitlist = useMutation({
    mutationFn: async (entry: Omit<WaitlistEntry, 'id' | 'status' | 'created_at'>) => {
      const newEntry: WaitlistEntry = {
        ...entry,
        id: crypto.randomUUID(),
        status: 'waiting',
        created_at: new Date().toISOString(),
      };
      
      const current = JSON.parse(localStorage.getItem('agenda-waitlist') || '[]');
      current.push(newEntry);
      localStorage.setItem('agenda-waitlist', JSON.stringify(current));
      
      return newEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      toast.success('Cliente adicionado à lista de espera');
    },
    onError: () => {
      toast.error('Erro ao adicionar à lista de espera');
    },
  });

  const removeFromWaitlist = useMutation({
    mutationFn: async (id: string) => {
      const current = JSON.parse(localStorage.getItem('agenda-waitlist') || '[]');
      const filtered = current.filter((e: WaitlistEntry) => e.id !== id);
      localStorage.setItem('agenda-waitlist', JSON.stringify(filtered));
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      toast.success('Removido da lista de espera');
    },
  });

  const updateWaitlistStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: WaitlistEntry['status'] }) => {
      const current = JSON.parse(localStorage.getItem('agenda-waitlist') || '[]');
      const updated = current.map((e: WaitlistEntry) => 
        e.id === id ? { ...e, status } : e
      );
      localStorage.setItem('agenda-waitlist', JSON.stringify(updated));
      return { id, status };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    },
  });

  const notifyWaitlistClients = useCallback(async (
    availableDate: Date,
    availableTime: string,
    serviceId?: string,
    professionalId?: string
  ) => {
    if (!connectionStatus?.connected) {
      toast.error('WhatsApp não conectado');
      return;
    }

    const eligibleEntries = waitlist.filter(entry => {
      if (entry.status !== 'waiting') return false;
      if (serviceId && entry.service_id && entry.service_id !== serviceId) return false;
      if (professionalId && entry.professional_id && entry.professional_id !== professionalId) return false;
      return true;
    });

    let notifiedCount = 0;
    
    for (const entry of eligibleEntries) {
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
        notifiedCount++;
      }
    }

    if (notifiedCount > 0) {
      toast.success(`${notifiedCount} cliente(s) notificado(s) sobre a vaga`);
    }
  }, [waitlist, connectionStatus, sendMessage, updateWaitlistStatus]);

  const activeWaitlist = useMemo(() => 
    waitlist.filter(e => e.status === 'waiting' || e.status === 'notified'),
    [waitlist]
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

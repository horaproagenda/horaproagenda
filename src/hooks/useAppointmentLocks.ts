/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { AppointmentEditLock } from '@/types';

const LOCK_TTL_MS = 2 * 60 * 1000;
const RENEW_INTERVAL_MS = 45 * 1000;

export function useAppointmentLocks(appointmentId?: string | null) {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const [isAcquiring, setIsAcquiring] = useState(false);
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const { data: locks = [] } = useQuery({
    queryKey: ['appointment_edit_locks', appointmentId],
    queryFn: async () => {
      if (!appointmentId) return [];
      const { data, error } = await (supabase as any)
        .from('appointment_edit_locks')
        .select('*')
        .eq('appointment_id', appointmentId);
      if (error) throw error;
      return (data || []) as AppointmentEditLock[];
    },
    enabled: !!appointmentId,
    staleTime: 0,
    refetchInterval: 30000,
  });

  const activeLock = useMemo(() => {
    const now = Date.now();
    return locks.find((lock) => new Date(lock.expires_at).getTime() > now) || null;
  }, [locks]);

  const isLockedByMe = !!activeLock && activeLock.user_id === user?.id && activeLock.session_id === sessionIdRef.current;
  const isLockedByOther = !!activeLock && !isLockedByMe;

  const refreshLocks = useCallback(() => {
    if (!appointmentId) return;
    queryClient.invalidateQueries({ queryKey: ['appointment_edit_locks', appointmentId], refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['appointment_edit_locks'], refetchType: 'all' });
  }, [appointmentId, queryClient]);

  const releaseLock = useCallback(async () => {
    if (!appointmentId || !user?.id) return;
    await (supabase as any)
      .from('appointment_edit_locks')
      .delete()
      .eq('appointment_id', appointmentId)
      .eq('user_id', user.id)
      .eq('session_id', sessionIdRef.current);
    refreshLocks();
  }, [appointmentId, refreshLocks, user?.id]);

  const acquireLock = useCallback(async () => {
    if (!appointmentId || !user?.id) return false;
    if (isLockedByOther) return false;

    setIsAcquiring(true);
    try {
      const expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString();
      const lockPayload = {
        appointment_id: appointmentId,
        user_id: user.id,
        user_email: user.email,
        holder_name: profile?.full_name || user.email || 'Usuário',
        session_id: sessionIdRef.current,
        expires_at: expiresAt,
      };

      const { error } = await (supabase as any)
        .from('appointment_edit_locks')
        .upsert(lockPayload, { onConflict: 'appointment_id' });

      if (error) throw error;
      refreshLocks();
      return true;
    } catch (error) {
      console.error('Erro ao bloquear agendamento:', error);
      refreshLocks();
      return false;
    } finally {
      setIsAcquiring(false);
    }
  }, [appointmentId, isLockedByOther, profile?.full_name, refreshLocks, user]);

  useEffect(() => {
    if (!appointmentId) return;
    const channel = supabase
      .channel(`appointment-locks-${appointmentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_edit_locks', filter: `appointment_id=eq.${appointmentId}` }, refreshLocks)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointmentId, refreshLocks]);

  useEffect(() => {
    if (!isLockedByMe || !appointmentId || !user?.id) return;
    const interval = window.setInterval(() => {
      (supabase as any)
        .from('appointment_edit_locks')
        .update({ expires_at: new Date(Date.now() + LOCK_TTL_MS).toISOString() })
        .eq('appointment_id', appointmentId)
        .eq('user_id', user.id)
        .eq('session_id', sessionIdRef.current)
        .then(refreshLocks);
    }, RENEW_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [appointmentId, isLockedByMe, refreshLocks, user?.id]);

  useEffect(() => {
    return () => {
      void releaseLock();
    };
  }, [releaseLock]);

  return { activeLock, isLockedByMe, isLockedByOther, isAcquiring, acquireLock, releaseLock };
}
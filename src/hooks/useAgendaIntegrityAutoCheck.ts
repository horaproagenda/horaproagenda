import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logSyncEvent } from '@/lib/syncAudit';
import { toast } from 'sonner';

const ISSUE_KEYS = [
  'cancelledLinkedPackageSessions',
  'cancelledAppointmentsStillLinked',
  'orphanedPackageLinks',
  'statusMismatches',
  'counterMismatches',
];

const MIN_INTERVAL_MS = 60_000; // throttle: no más que una vez por minuto

/**
 * Roda automaticamente a verificação de integridade de agenda/pacotes:
 *  - Ao logar (auth state SIGNED_IN / INITIAL_SESSION com user)
 *  - Ao retornar à aba (visibilitychange visible)
 *  - Ao ganhar foco da janela
 * Se detectar divergências, dispara repair_agenda_package_integrity
 * e invalida o cache do React Query.
 */
export function useAgendaIntegrityAutoCheck() {
  const queryClient = useQueryClient();
  const lastRunRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    const runCheck = async (trigger: string) => {
      if (runningRef.current) return;
      const now = Date.now();
      if (now - lastRunRef.current < MIN_INTERVAL_MS) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      runningRef.current = true;
      lastRunRef.current = now;
      logSyncEvent('agenda-integrity:check', 'ok', { trigger });

      try {
        const { data, error } = await supabase.rpc('get_agenda_package_integrity_report' as never);
        if (error) throw error;
        const r = (data || {}) as Record<string, number>;
        const issues = ISSUE_KEYS.reduce((s, k) => s + Number(r[k] || 0), 0);

        if (issues > 0) {
          logSyncEvent('agenda-integrity:repair', 'ok', { trigger, issues });
          const { data: rep, error: repErr } = await supabase.rpc('repair_agenda_package_integrity' as never);
          if (repErr) throw repErr;
          const fixed = (rep || {}) as Record<string, number>;
          await queryClient.invalidateQueries({ predicate: () => true, refetchType: 'active' });
          toast.success('Agenda sincronizada automaticamente', {
            description: `${issues} divergência(s) corrigida(s) · sessões liberadas: ${fixed.releasedPackageSessions || 0}`,
            duration: 5000,
          });
        } else {
          logSyncEvent('agenda-integrity:healthy', 'ok', { trigger });
        }
      } catch (e) {
        logSyncEvent('agenda-integrity:error', 'error', { trigger, error: String(e) });
      } finally {
        runningRef.current = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void runCheck('visible');
    };
    const onFocus = () => { void runCheck('focus'); };
    const onOnline = () => { void runCheck('online'); };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        // small delay to let other boot tasks settle
        setTimeout(() => { void runCheck(`auth:${event}`); }, 1500);
      }
    });

    // Boot: tenta uma vez após 3s caso já exista sessão
    const boot = window.setTimeout(() => { void runCheck('boot'); }, 3000);

    // Helper global para DevTools
    (window as unknown as Record<string, unknown>).__agendaIntegrityCheck = () => runCheck('manual');

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.clearTimeout(boot);
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);
}

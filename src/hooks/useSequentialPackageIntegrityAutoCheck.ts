import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logSyncEvent } from '@/lib/syncAudit';
import { toast } from 'sonner';

const ISSUE_KEYS = [
  'stepServiceMismatches',
  'appointmentServiceMismatches',
  'missingSteps',
  'duplicateSteps',
];

const MIN_INTERVAL_MS = 60_000;

/**
 * Verificação automática das etapas dos pacotes sequenciais.
 *
 * Garante que o serviço de cada etapa continue sendo o do modelo do pacote
 * (mudar a data de uma aplicação não pode trocar o serviço da etapa nem
 * fazer a última etapa desaparecer). Se encontrar divergência, repara e
 * atualiza as telas.
 */
export function useSequentialPackageIntegrityAutoCheck() {
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
      logSyncEvent('sequential-package-integrity:check', 'ok', { trigger });

      try {
        const { data, error } = await supabase.rpc('get_sequential_package_integrity_report' as never);
        if (error) throw error;
        const report = (data || {}) as Record<string, number>;
        const issues = ISSUE_KEYS.reduce((sum, key) => sum + Number(report[key] || 0), 0);

        if (issues > 0) {
          const { error: repairError } = await supabase.rpc('repair_all_sequential_packages' as never);
          if (repairError) throw repairError;
          await queryClient.invalidateQueries({ predicate: () => true, refetchType: 'active' });
          logSyncEvent('sequential-package-integrity:repair', 'ok', { trigger, issues });
          toast.success('Pacotes sequenciais sincronizados', {
            description: 'Os serviços de cada aplicação foram conferidos e ajustados.',
            duration: 5000,
          });
        } else {
          logSyncEvent('sequential-package-integrity:healthy', 'ok', { trigger });
        }
      } catch (e) {
        logSyncEvent('sequential-package-integrity:error', 'error', { trigger, error: String(e) });
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
        setTimeout(() => { void runCheck(`auth:${event}`); }, 2000);
      }
    });

    const boot = window.setTimeout(() => { void runCheck('boot'); }, 5000);

    (window as unknown as Record<string, unknown>).__sequentialPackageIntegrityCheck = () => runCheck('manual');

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.clearTimeout(boot);
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);
}

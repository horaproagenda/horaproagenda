import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logSyncEvent } from '@/lib/syncAudit';

const MIN_INTERVAL_MS = 120_000; // 2 min throttle

/**
 * Roda automaticamente o audit_payment_integrity e dispara
 * repair_payment_integrity quando detecta agendamentos com cobrança
 * indevida (pendentes apesar de existir venda paga associada ao
 * serviço/pacote). Isso evita que o usuário veja "valor pendente"
 * para itens já pagos.
 *
 * Triggers: login, foco da janela, retorno online, visibilitychange.
 * Throttled para 1x a cada 2 minutos por dispositivo.
 */
export function usePaymentIntegrityAutoCheck() {
  const queryClient = useQueryClient();
  const lastRunRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    const run = async (trigger: string) => {
      if (runningRef.current) return;
      const now = Date.now();
      if (now - lastRunRef.current < MIN_INTERVAL_MS) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      runningRef.current = true;
      lastRunRef.current = now;

      try {
        const { data, error } = await (supabase as any).rpc('audit_payment_integrity');
        if (error) throw error;
        const report = (data || {}) as Record<string, any[]>;
        const pkgIssues = report.package_appointments_pending_with_paid_sale || [];
        const svcIssues = report.service_appointments_pending_with_paid_sale || [];
        const total = pkgIssues.length + svcIssues.length;

        if (total === 0) {
          logSyncEvent('payment-integrity:healthy', 'ok', { trigger });
          return;
        }

        logSyncEvent('payment-integrity:repair', 'ok', { trigger, count: total });
        const { data: repaired, error: rErr } = await (supabase as any).rpc('repair_payment_integrity');
        if (rErr) throw rErr;

        if ((repaired || 0) > 0) {
          await queryClient.invalidateQueries({
            predicate: (q) => {
              const k = q.queryKey?.[0] as string;
              return [
                'appointments', 'client-appointments', 'service_packages',
                'package_appointments', 'single_sales', 'client-sales',
              ].includes(k);
            },
            refetchType: 'active',
          });
        }
      } catch (e) {
        logSyncEvent('payment-integrity:error', 'error', { trigger, error: String(e) });
      } finally {
        runningRef.current = false;
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') void run('visible'); };
    const onFocus = () => { void run('focus'); };
    const onOnline = () => { void run('online'); };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        setTimeout(() => { void run(`auth:${event}`); }, 3000);
      }
    });

    const boot = window.setTimeout(() => { void run('boot'); }, 5000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.clearTimeout(boot);
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);
}

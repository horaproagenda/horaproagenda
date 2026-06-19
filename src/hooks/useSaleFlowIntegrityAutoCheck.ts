import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logSyncEvent } from '@/lib/syncAudit';

const MIN_INTERVAL_MS = 120_000; // 2 min throttle

/**
 * Roda automaticamente o audit_sale_flow_integrity e dispara
 * purge_single_sale_cascade nas vendas de boleto sem nenhuma parcela
 * (vendas-fantasma). Mantém pacotes, serviços disponíveis, agendamentos
 * e lançamentos financeiros sincronizados sem necessidade de UI manual.
 *
 * Triggers: login, foco da janela, retorno online, visibilitychange.
 * Throttled para 1x a cada 2 minutos por dispositivo.
 */
export function useSaleFlowIntegrityAutoCheck() {
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
        const { data, error } = await (supabase as any).rpc('audit_sale_flow_integrity');
        if (error) throw error;
        const report = (data || {}) as Record<string, any[]>;
        const ghostSales = report.sales_with_boleto_no_installments || [];

        if (ghostSales.length === 0) {
          logSyncEvent('sale-flow:healthy', 'ok', { trigger });
          return;
        }

        logSyncEvent('sale-flow:purge', 'ok', { trigger, count: ghostSales.length });
        let purged = 0;
        for (const s of ghostSales) {
          const { error: pErr } = await (supabase as any).rpc('purge_single_sale_cascade', { _sale_id: s.id });
          if (!pErr) purged++;
        }

        if (purged > 0) {
          await queryClient.invalidateQueries({
            predicate: (q) => {
              const k = q.queryKey?.[0] as string;
              return [
                'single_sales', 'client-sales', 'service_packages', 'client_services',
                'financial_entries', 'appointments', 'package_appointments',
              ].includes(k);
            },
            refetchType: 'active',
          });
        }
      } catch (e) {
        logSyncEvent('sale-flow:error', 'error', { trigger, error: String(e) });
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
        setTimeout(() => { void run(`auth:${event}`); }, 2500);
      }
    });

    const boot = window.setTimeout(() => { void run('boot'); }, 4000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.clearTimeout(boot);
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);
}

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logSyncEvent } from '@/lib/syncAudit';

const MIN_INTERVAL_MS = 120_000; // 2 min throttle

/**
 * Roda automaticamente o audit_sale_flow_integrity para detectar divergências
 * no fluxo venda → boleto → pacote/serviço. Não apaga vendas automaticamente:
 * uma venda legítima pode ficar temporariamente sem parcelas durante correções
 * manuais, e apagar em background remove o pacote real do cliente.
 *
 * Triggers: login, foco da janela, retorno online, visibilitychange.
 * Throttled para 1x a cada 2 minutos por dispositivo.
 */
export function useSaleFlowIntegrityAutoCheck() {
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
        const orphanPackages = report.packages_without_active_sale || [];

        // Auto-heal orphan packages (packages whose originating sale was deleted)
        if (orphanPackages.length > 0) {
          const { data: healed, error: healError } = await (supabase as any).rpc('heal_orphan_service_packages');
          if (healError) {
            logSyncEvent('sale-flow:heal-error', 'error', { trigger, error: String(healError) });
          } else {
            logSyncEvent('sale-flow:orphan-packages-healed', 'ok', { trigger, result: healed });
          }
        }

        if (ghostSales.length === 0 && orphanPackages.length === 0) {
          logSyncEvent('sale-flow:healthy', 'ok', { trigger });
          return;
        }

        logSyncEvent('sale-flow:needs-review', 'skipped', { trigger, ghostSales: ghostSales.length, orphanPackages: orphanPackages.length });
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
  }, []);
}

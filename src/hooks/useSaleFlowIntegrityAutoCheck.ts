import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logSyncEvent } from '@/lib/syncAudit';

const MIN_INTERVAL_MS = 120_000; // 2 min throttle

/**
 * Roda automaticamente o audit_sale_flow_integrity para detectar divergências
 * no fluxo venda → boleto → pacote/serviço.
 *
 * REGRESSÃO PROTEGIDA: esta verificação NUNCA apaga dados. Pacotes criados
 * direto pela agenda não possuem venda no Caixa e eram apagados em segundo
 * plano junto com todos os agendamentos (bug "agendamentos aparecem e somem").
 * Divergências apenas são registradas para revisão manual.
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

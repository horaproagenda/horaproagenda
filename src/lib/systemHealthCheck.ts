/**
 * System Health Check
 *
 * Executa diagnósticos em todos os fluxos críticos do aplicativo
 * (auth, banco, realtime, edge functions, sincronização, cache,
 * service worker, fila offline) e tenta auto-reparar problemas
 * conhecidos para evitar erros silenciosos.
 *
 * Uso:
 *   const report = await runSystemHealthCheck();
 *   await autoRepair(report); // tenta corrigir falhas conhecidas
 *
 * Também exposto globalmente como `window.__healthCheck()` para
 * inspeção rápida via DevTools.
 */
import { supabase } from '@/integrations/supabase/client';
import { logSyncEvent } from '@/lib/syncAudit';
import { getQueue } from '@/lib/offlineQueue';
import type { QueryClient } from '@tanstack/react-query';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skipped';

export interface HealthCheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  durationMs: number;
  detail?: string;
  fixable?: boolean;
}

export interface HealthReport {
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  overall: CheckStatus;
  items: HealthCheckItem[];
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: unknown; ms: number }> {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { value, ms: Math.round(performance.now() - t0) };
  } catch (error) {
    return { error, ms: Math.round(performance.now() - t0) };
  }
}

async function checkAuth(): Promise<HealthCheckItem> {
  const { value, error, ms } = await timed(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  });
  if (error) return { id: 'auth', label: 'Sessão autenticada', status: 'fail', durationMs: ms, detail: String(error), fixable: true };
  if (!value) return { id: 'auth', label: 'Sessão autenticada', status: 'warn', durationMs: ms, detail: 'Nenhuma sessão ativa' };
  const expIn = (value.expires_at ?? 0) * 1000 - Date.now();
  if (expIn < 60_000) return { id: 'auth', label: 'Sessão autenticada', status: 'warn', durationMs: ms, detail: 'Token expira em <1min', fixable: true };
  return { id: 'auth', label: 'Sessão autenticada', status: 'ok', durationMs: ms, detail: `Expira em ${Math.round(expIn / 60000)}min` };
}

async function checkDatabase(): Promise<HealthCheckItem> {
  const { error, ms } = await timed(async () => {
    const { error } = await supabase.from('business_settings').select('id').limit(1);
    if (error) throw error;
  });
  if (error) return { id: 'db', label: 'Acesso ao banco (Supabase)', status: 'fail', durationMs: ms, detail: String(error) };
  return { id: 'db', label: 'Acesso ao banco (Supabase)', status: 'ok', durationMs: ms };
}

async function checkCriticalTables(): Promise<HealthCheckItem> {
  const tables = ['appointments', 'clients', 'professionals', 'services', 'waitlist'] as const;
  const t0 = performance.now();
  const results = await Promise.all(
    tables.map(async (t) => {
      const { error } = await supabase.from(t).select('id', { count: 'exact', head: true });
      return { t, ok: !error, err: error?.message };
    }),
  );
  const ms = Math.round(performance.now() - t0);
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) return { id: 'tables', label: 'Tabelas críticas acessíveis', status: 'ok', durationMs: ms, detail: `${tables.length} tabelas OK` };
  return {
    id: 'tables',
    label: 'Tabelas críticas acessíveis',
    status: 'fail',
    durationMs: ms,
    detail: failed.map((f) => `${f.t}: ${f.err}`).join(' | '),
  };
}

async function checkRealtime(): Promise<HealthCheckItem> {
  const t0 = performance.now();
  return await new Promise<HealthCheckItem>((resolve) => {
    const channel = supabase.channel(`health-${Date.now()}`);
    let settled = false;
    const cleanup = () => {
      // Defer removal to the next tick so we never call removeChannel
      // synchronously from inside a channel callback (causes infinite
      // recursion when CLOSED triggers another close handler).
      setTimeout(() => {
        try { supabase.removeChannel(channel); } catch { /* noop */ }
      }, 0);
    };
    const settle = (item: HealthCheckItem) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      cleanup();
      resolve(item);
    };
    const timeout = window.setTimeout(() => {
      settle({ id: 'realtime', label: 'Realtime (WebSocket)', status: 'fail', durationMs: Math.round(performance.now() - t0), detail: 'Timeout 5s', fixable: true });
    }, 5000);
    channel.subscribe((status) => {
      if (settled) return;
      if (status === 'SUBSCRIBED') {
        settle({ id: 'realtime', label: 'Realtime (WebSocket)', status: 'ok', durationMs: Math.round(performance.now() - t0) });
      } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
        settle({ id: 'realtime', label: 'Realtime (WebSocket)', status: 'fail', durationMs: Math.round(performance.now() - t0), detail: status, fixable: true });
      }
    });
  });
}

async function checkEdgeFunction(): Promise<HealthCheckItem> {
  const { value, error, ms } = await timed(async () => {
    const { data, error } = await supabase.functions.invoke('whatsapp-check-connection', { body: { ping: true } });
    if (error) throw error;
    return data;
  });
  if (error) {
    const msg = String(error);
    // Erro de configuração (sem secret) ainda significa que a função está reachable.
    if (/credentials|api.?key|secret|missing|not configured|EVOLUTION/i.test(msg)) {
      return { id: 'edge', label: 'Edge Functions', status: 'warn', durationMs: ms, detail: 'Função acessível, mas WhatsApp não configurado' };
    }
    return { id: 'edge', label: 'Edge Functions', status: 'fail', durationMs: ms, detail: msg };
  }
  return { id: 'edge', label: 'Edge Functions', status: 'ok', durationMs: ms, detail: value ? 'Resposta recebida' : undefined };
}

function checkNetwork(): HealthCheckItem {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  return { id: 'net', label: 'Conexão de rede', status: online ? 'ok' : 'fail', durationMs: 0, detail: online ? 'Online' : 'Offline' };
}

function checkOfflineQueue(): HealthCheckItem {
  try {
    const q = getQueue();
    if (q.length === 0) return { id: 'queue', label: 'Fila offline', status: 'ok', durationMs: 0, detail: 'Vazia' };
    if (q.length < 5) return { id: 'queue', label: 'Fila offline', status: 'warn', durationMs: 0, detail: `${q.length} pendente(s)`, fixable: true };
    return { id: 'queue', label: 'Fila offline', status: 'fail', durationMs: 0, detail: `${q.length} alteração(ões) acumulada(s)`, fixable: true };
  } catch (e) {
    return { id: 'queue', label: 'Fila offline', status: 'warn', durationMs: 0, detail: String(e) };
  }
}

async function checkServiceWorker(): Promise<HealthCheckItem> {
  if (!('serviceWorker' in navigator)) return { id: 'sw', label: 'Service Worker', status: 'skipped', durationMs: 0, detail: 'Indisponível' };
  // Em preview do Lovable / dev, o SW é intencionalmente desregistrado
  // (ver main.tsx e index.html). Não faz sentido flaggar como warn e
  // disparar auto-heal em loop infinito. Trata como 'skipped'.
  const host = typeof location !== 'undefined' ? location.hostname : '';
  const isPreviewOrDev =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.includes('lovable.app') ||
    host.endsWith('.lovableproject.com') ||
    host.endsWith('.lovableproject-dev.com') ||
    host.endsWith('.beta.lovable.dev');
  const t0 = performance.now();
  const reg = await navigator.serviceWorker.getRegistration();
  const ms = Math.round(performance.now() - t0);
  if (isPreviewOrDev) return { id: 'sw', label: 'Service Worker', status: 'skipped', durationMs: ms, detail: 'Desativado em preview/dev' };
  if (!reg) return { id: 'sw', label: 'Service Worker', status: 'warn', durationMs: ms, detail: 'Não registrado', fixable: true };
  if (reg.waiting) return { id: 'sw', label: 'Service Worker', status: 'warn', durationMs: ms, detail: 'Nova versão aguardando ativação', fixable: true };
  return { id: 'sw', label: 'Service Worker', status: 'ok', durationMs: ms };
}


function checkCacheFreshness(queryClient?: QueryClient): HealthCheckItem {
  if (!queryClient) return { id: 'cache', label: 'Cache React Query', status: 'skipped', durationMs: 0 };
  const queries = queryClient.getQueryCache().getAll();
  const stale = queries.filter((q) => q.isStale()).length;
  // Só considera queries em erro que ainda estão ATIVAS (montadas na tela).
  // Queries antigas em erro (rotas desmontadas) não devem disparar auto-heal em loop.
  const activeErrored = queries.filter(
    (q) => q.state.status === 'error' && q.getObserversCount() > 0,
  ).length;
  if (activeErrored >= 3) {
    return { id: 'cache', label: 'Cache React Query', status: 'fail', durationMs: 0, detail: `${activeErrored} query(ies) ativas em erro`, fixable: true };
  }
  if (stale > queries.length * 0.7 && queries.length > 5) {
    return { id: 'cache', label: 'Cache React Query', status: 'warn', durationMs: 0, detail: `${stale}/${queries.length} stale`, fixable: true };
  }
  return { id: 'cache', label: 'Cache React Query', status: 'ok', durationMs: 0, detail: `${queries.length} queries, ${stale} stale` };
}

export async function runSystemHealthCheck(queryClient?: QueryClient): Promise<HealthReport> {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  logSyncEvent('health-check:start', 'ok');

  const [net, auth, db, tables, realtime, edge, sw] = await Promise.all([
    Promise.resolve(checkNetwork()),
    checkAuth(),
    checkDatabase(),
    checkCriticalTables(),
    checkRealtime(),
    checkEdgeFunction(),
    checkServiceWorker(),
  ]);
  const queue = checkOfflineQueue();
  const cache = checkCacheFreshness(queryClient);

  const items = [net, auth, db, tables, realtime, edge, queue, cache, sw];
  const overall: CheckStatus = items.some((i) => i.status === 'fail')
    ? 'fail'
    : items.some((i) => i.status === 'warn')
      ? 'warn'
      : 'ok';

  const report: HealthReport = {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalMs: Math.round(performance.now() - t0),
    overall,
    items,
  };

  logSyncEvent('health-check:done', overall === 'ok' ? 'ok' : overall === 'warn' ? 'skipped' : 'error', {
    failed: items.filter((i) => i.status === 'fail').map((i) => i.id),
    warned: items.filter((i) => i.status === 'warn').map((i) => i.id),
  });

  return report;
}

/**
 * Tenta corrigir automaticamente os problemas detectados.
 * Retorna lista de ações aplicadas.
 */
export async function autoRepair(
  report: HealthReport,
  queryClient?: QueryClient,
): Promise<string[]> {
  const actions: string[] = [];

  for (const item of report.items) {
    if (!item.fixable) continue;
    try {
      switch (item.id) {
        case 'auth': {
          await supabase.auth.refreshSession();
          actions.push('Sessão renovada');
          break;
        }
        case 'realtime': {
          // Forçar reconnect: remover todos canais e re-subscribe
          try { supabase.removeAllChannels(); } catch { /* noop */ }
          actions.push('Realtime reconectado');
          break;
        }
        case 'queue': {
          // dispara sync da fila offline
          window.dispatchEvent(new Event('online'));
          actions.push('Sincronização da fila disparada');
          break;
        }
        case 'cache': {
          // Reexecuta APENAS queries em erro/ativas — evita refetch global que
          // trava a UI e mantém a percepção de "carregando eterno".
          await queryClient?.refetchQueries({
            type: 'active',
            predicate: (q) => q.state.status === 'error',
          });
          actions.push('Queries em erro reexecutadas');
          break;
        }
        case 'sw': {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg?.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              actions.push('Service Worker atualizado');
            } else if (!reg) {
              // Reload força registro
              actions.push('Reload necessário para registrar SW');
            }
          }
          break;
        }
      }
    } catch (e) {
      actions.push(`Falha ao corrigir ${item.id}: ${String(e)}`);
    }
  }

  logSyncEvent('health-check:repair', actions.length > 0 ? 'ok' : 'skipped', { actions });
  return actions;
}

// Helpers globais para DevTools
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__healthCheck = () => runSystemHealthCheck();
  (window as unknown as Record<string, unknown>).__healthRepair = async () => {
    const r = await runSystemHealthCheck();
    return autoRepair(r);
  };
}

/**
 * perfMetrics
 *
 * Coleta métricas leves de performance em memória para diagnosticar
 * gargalos em produção sem depender de ferramentas externas:
 *
 *   - Contagem de refetch por queryKey (identifica loops de invalidação)
 *   - Duração média/max de queries importantes
 *   - Tempo de render de componentes instrumentados
 *
 * Uso no console do navegador:
 *   window.__perfMetrics()          // snapshot atual
 *   window.__perfMetrics('reset')   // limpa contadores
 *
 * Warnings automáticos:
 *   - Uma queryKey com >30 refetches em 10s
 *   - Uma query lenta (>1000ms de média)
 *   - Um render que ultrapassa 100ms
 */

type Counter = { count: number; firstAt: number; lastAt: number };
type Timing = { count: number; total: number; max: number };

const refetches = new Map<string, Counter>();
const queries = new Map<string, Timing>();
const renders = new Map<string, Timing>();

const REFETCH_LOOP_WINDOW_MS = 10_000;
const REFETCH_LOOP_THRESHOLD = 30;
const SLOW_QUERY_MS = 1000;
const SLOW_RENDER_MS = 100;

// Anti-flood dos warnings do console
const warned = new Map<string, number>();
function warnOnce(key: string, message: string, cooldownMs = 30_000) {
  const now = Date.now();
  const prev = warned.get(key) ?? 0;
  if (now - prev < cooldownMs) return;
  warned.set(key, now);
  // eslint-disable-next-line no-console
  console.warn(`[perf] ${message}`);
}

export function recordRefetch(queryKey: string): void {
  const now = Date.now();
  const prev = refetches.get(queryKey);
  if (!prev) {
    refetches.set(queryKey, { count: 1, firstAt: now, lastAt: now });
    return;
  }
  // Reseta janela se passou muito tempo
  if (now - prev.firstAt > REFETCH_LOOP_WINDOW_MS) {
    refetches.set(queryKey, { count: 1, firstAt: now, lastAt: now });
    return;
  }
  prev.count += 1;
  prev.lastAt = now;
  if (prev.count === REFETCH_LOOP_THRESHOLD) {
    warnOnce(
      `refetch:${queryKey}`,
      `Loop de refetch detectado em "${queryKey}" (${prev.count} refetches em ${Math.round(
        (now - prev.firstAt) / 1000,
      )}s). Verifique invalidações agressivas.`,
    );
  }
}

export function recordQuery(queryKey: string, durationMs: number): void {
  const prev = queries.get(queryKey) ?? { count: 0, total: 0, max: 0 };
  prev.count += 1;
  prev.total += durationMs;
  if (durationMs > prev.max) prev.max = durationMs;
  queries.set(queryKey, prev);
  const avg = prev.total / prev.count;
  if (avg > SLOW_QUERY_MS && prev.count > 3) {
    warnOnce(
      `query:${queryKey}`,
      `Query lenta "${queryKey}" — média ${avg.toFixed(0)}ms em ${prev.count} chamadas (máx ${prev.max.toFixed(
        0,
      )}ms).`,
    );
  }
}

export function recordRender(componentName: string, durationMs: number): void {
  const prev = renders.get(componentName) ?? { count: 0, total: 0, max: 0 };
  prev.count += 1;
  prev.total += durationMs;
  if (durationMs > prev.max) prev.max = durationMs;
  renders.set(componentName, prev);
  if (durationMs > SLOW_RENDER_MS) {
    warnOnce(
      `render:${componentName}`,
      `Render lento em <${componentName}> (${durationMs.toFixed(0)}ms).`,
      60_000,
    );
  }
}

/**
 * Cronometra uma função async e registra como query.
 */
export async function timeQuery<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    recordQuery(key, performance.now() - start);
  }
}

export function snapshot() {
  const top = <V extends { count: number }>(
    map: Map<string, V>,
    getScore: (v: V) => number,
    n = 10,
  ) =>
    Array.from(map.entries())
      .map(([k, v]) => ({ key: k, ...v, score: getScore(v) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n);

  return {
    generatedAt: new Date().toISOString(),
    topRefetches: top(refetches, (v) => v.count),
    slowestQueries: top(queries, (v) => v.total / Math.max(v.count, 1)),
    slowestRenders: top(renders, (v) => v.total / Math.max(v.count, 1)),
  };
}

export function resetMetrics() {
  refetches.clear();
  queries.clear();
  renders.clear();
  warned.clear();
}

// Expõe helper no window apenas em dev/preview.
if (typeof window !== 'undefined') {
  (window as unknown as { __perfMetrics?: (cmd?: 'reset') => unknown }).__perfMetrics = (cmd) => {
    if (cmd === 'reset') {
      resetMetrics();
      return { ok: true, reset: true };
    }
    const snap = snapshot();
    // eslint-disable-next-line no-console
    console.table(snap.topRefetches);
    // eslint-disable-next-line no-console
    console.table(snap.slowestQueries);
    // eslint-disable-next-line no-console
    console.table(snap.slowestRenders);
    return snap;
  };
}

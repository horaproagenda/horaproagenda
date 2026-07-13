import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { runSystemHealthCheck, autoRepair, type HealthReport } from '@/lib/systemHealthCheck';
import { logSyncEvent } from '@/lib/syncAudit';

const STORAGE_KEY = 'auto-healing-config-v1';

export interface AutoHealingConfig {
  enabled: boolean;
  /** Intervalo entre verificações periódicas, em segundos. */
  intervalSec: number;
  /** Quantas tentativas de reparo antes de desistir. */
  maxRetries: number;
  /** Timeout (ms) para cada ciclo verificação+reparo. */
  timeoutMs: number;
  /** Tempo de espera (ms) entre tentativas. */
  retryDelayMs: number;
}

export const DEFAULT_AUTO_HEALING: AutoHealingConfig = {
  enabled: true,
  intervalSec: 120,
  maxRetries: 3,
  timeoutMs: 15_000,
  retryDelayMs: 2_000,
};

function loadConfig(): AutoHealingConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AUTO_HEALING;
    return { ...DEFAULT_AUTO_HEALING, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_AUTO_HEALING;
  }
}

function saveConfig(c: AutoHealingConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* noop */ }
}

export function getAutoHealingConfig() { return loadConfig(); }

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms);
    p.then((v) => { window.clearTimeout(t); resolve(v); },
           (e) => { window.clearTimeout(t); reject(e); });
  });
}

export interface AutoHealingState {
  config: AutoHealingConfig;
  lastReport: HealthReport | null;
  lastRunAt: string | null;
  lastActions: string[];
  running: boolean;
  consecutiveFailures: number;
}

/**
 * useAutoHealing — modo de auto-reparo contínuo.
 *
 * - Roda o Health Check periodicamente (intervalSec).
 * - Ao detectar falha, dispara autoRepair com até maxRetries tentativas,
 *   cada ciclo limitado por timeoutMs e espaçado por retryDelayMs.
 * - Também escuta eventos críticos (online, visible, sync-audit:error)
 *   para acionar verificação imediata.
 * - Tudo logado via syncAudit para auditoria.
 */
export function useAutoHealing() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<AutoHealingConfig>(loadConfig);
  const [state, setState] = useState<Omit<AutoHealingState, 'config'>>({
    lastReport: null, lastRunAt: null, lastActions: [], running: false, consecutiveFailures: 0,
  });
  const runningRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;

  const updateConfig = useCallback((partial: Partial<AutoHealingConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      saveConfig(next);
      return next;
    });
  }, []);

  const runCycle = useCallback(async (trigger: string) => {
    if (runningRef.current) return;
    const cfg = configRef.current;
    if (!cfg.enabled) return;
    runningRef.current = true;
    setState((s) => ({ ...s, running: true }));
    logSyncEvent('auto-heal:start', 'ok', { trigger });

    let attempt = 0;
    let report: HealthReport | null = null;
    let actions: string[] = [];
    let failed = false;

    try {
      while (attempt <= cfg.maxRetries) {
        attempt++;
        try {
          report = await withTimeout(runSystemHealthCheck(queryClient), cfg.timeoutMs, 'healthCheck');
        } catch (e) {
          logSyncEvent('auto-heal:check-timeout', 'error', { attempt, error: String(e) });
          if (attempt > cfg.maxRetries) { failed = true; break; }
          await new Promise((r) => setTimeout(r, cfg.retryDelayMs));
          continue;
        }

        if (report.overall === 'ok') {
          logSyncEvent('auto-heal:healthy', 'ok', { attempt });
          break;
        }

        try {
          const a = await withTimeout(autoRepair(report, queryClient), cfg.timeoutMs, 'autoRepair');
          actions = actions.concat(a);
          logSyncEvent('auto-heal:repair', a.length ? 'ok' : 'skipped', { attempt, actions: a, overall: report.overall });
        } catch (e) {
          logSyncEvent('auto-heal:repair-timeout', 'error', { attempt, error: String(e) });
        }

        if (attempt > cfg.maxRetries) {
          failed = report.overall === 'fail';
          break;
        }
        await new Promise((r) => setTimeout(r, cfg.retryDelayMs));
      }
    } finally {
      runningRef.current = false;
      setState((s) => ({
        running: false,
        lastReport: report,
        lastRunAt: new Date().toISOString(),
        lastActions: actions,
        consecutiveFailures: failed ? s.consecutiveFailures + 1 : 0,
      }));
      logSyncEvent('auto-heal:done', failed ? 'error' : 'ok', { attempts: attempt, actions, overall: report?.overall });
    }
  }, [queryClient]);

  // Loop periódico + listeners
  useEffect(() => {
    if (!config.enabled) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void runCycle('interval');
      }
    }, Math.max(15, config.intervalSec) * 1000);

    const onOnline = () => { void runCycle('online'); };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runCycle('visible');
    };
    const onSyncError = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      if (detail?.result !== 'error') return;
      // Evita loop infinito: eventos disparados pelo próprio auto-heal /
      // health-check não devem re-disparar outro ciclo.
      const evName: string = String(detail?.event || '');
      if (evName.startsWith('health-check:') || evName.startsWith('auto-heal:')) return;
      void runCycle('sync-error');
    };


    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('sync-audit', onSyncError as EventListener);

    // Roda uma vez logo no boot (com pequeno delay)
    const boot = window.setTimeout(() => { void runCycle('boot'); }, 4000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(boot);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('sync-audit', onSyncError as EventListener);
    };
  }, [config.enabled, config.intervalSec, runCycle]);

  // Helpers globais para DevTools
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__autoHeal = () => runCycle('manual');
    (window as unknown as Record<string, unknown>).__autoHealConfig = (p?: Partial<AutoHealingConfig>) => {
      if (p) updateConfig(p);
      return configRef.current;
    };
  }, [runCycle, updateConfig]);

  return { ...state, config, updateConfig, runNow: () => runCycle('manual') };
}

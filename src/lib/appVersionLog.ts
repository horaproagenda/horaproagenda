/**
 * appVersionLog
 *
 * Logger interno (localStorage + console) para diagnosticar problemas de
 * atualização do aplicativo. Registra eventos do watcher de versão:
 *  - check_ok / check_fail
 *  - new_version_detected
 *  - reload_triggered
 *  - state_preserved / state_restored
 *
 * Mantém um buffer circular dos últimos N eventos (default 100) acessível
 * via `window.__APP_VERSION_LOG__()` ou `getVersionLog()` para inspeção.
 *
 * Também envia (best-effort) para uma tabela Supabase `app_version_events`
 * se ela existir — silenciosamente ignora falhas para não quebrar nada.
 */
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'app_version_log_v1';
const MAX_EVENTS = 100;

export type VersionEventType =
  | 'watcher_started'
  | 'check_ok'
  | 'check_fail'
  | 'new_version_detected'
  | 'reload_triggered'
  | 'state_preserved'
  | 'state_restored'
  | 'sw_update_found'
  | 'sw_controller_change';

export interface VersionEvent {
  type: VersionEventType;
  ts: string; // ISO
  detail?: Record<string, unknown>;
  ua?: string;
  url?: string;
}

function readBuffer(): VersionEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBuffer(events: VersionEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    /* quota / disabled storage — ignore */
  }
}

export function logVersionEvent(type: VersionEventType, detail?: Record<string, unknown>) {
  const evt: VersionEvent = {
    type,
    ts: new Date().toISOString(),
    detail,
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
  };

  const buf = readBuffer();
  buf.push(evt);
  writeBuffer(buf);

  // Console com prefixo padronizado
  // eslint-disable-next-line no-console
  console.info(`[AppVersion] ${type}`, detail ?? '');

  // Best-effort remote log (não bloqueia, ignora erros)
  void sendRemote(evt).catch(() => {});
}

async function sendRemote(evt: VersionEvent) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;
    // Só envia eventos relevantes para reduzir ruído
    if (
      evt.type !== 'new_version_detected' &&
      evt.type !== 'reload_triggered' &&
      evt.type !== 'check_fail'
    ) {
      return;
    }
    await supabase.from('app_version_events' as never).insert({
      user_id: userId,
      event_type: evt.type,
      detail: evt.detail ?? {},
      user_agent: evt.ua,
      url: evt.url,
      created_at: evt.ts,
    } as never);
  } catch {
    /* tabela pode não existir — silencioso */
  }
}

export function getVersionLog(): VersionEvent[] {
  return readBuffer();
}

export function clearVersionLog() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Expor no window para fácil debug em dispositivos remotos
if (typeof window !== 'undefined') {
  (window as unknown as { __APP_VERSION_LOG__?: () => VersionEvent[] }).__APP_VERSION_LOG__ =
    getVersionLog;
}

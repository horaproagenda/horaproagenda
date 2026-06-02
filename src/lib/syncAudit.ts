/**
 * Sync Audit Log
 *
 * Registra todos os eventos de sincronização (mount, focus, realtime,
 * heartbeat, broadcast, auth) com timestamp, id único, origem do dispositivo
 * e resultado, permitindo diagnosticar rapidamente por que um link
 * específico não refletiu uma alteração.
 *
 * Os logs ficam disponíveis no console (`__syncAudit()`), em
 * localStorage (`sync-audit-log`) e podem ser exportados em JSON.
 */

export type SyncEventResult = 'ok' | 'skipped' | 'error';

export interface SyncAuditEntry {
  id: string;
  timestamp: string;
  event: string;
  origin: string;
  result: SyncEventResult;
  details?: Record<string, unknown>;
}

const STORAGE_KEY = 'sync-audit-log';
const MAX_ENTRIES = 200;

function getOrigin(): string {
  try {
    let id = localStorage.getItem('sync-origin-id');
    if (!id) {
      id = `${navigator.platform || 'web'}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('sync-origin-id', id);
    }
    const href = typeof window !== 'undefined' ? window.location.host : 'unknown';
    return `${href}::${id}`;
  } catch {
    return 'unknown';
  }
}

function readLog(): SyncAuditEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SyncAuditEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLog(entries: SyncAuditEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* quota cheia, ignora */
  }
}

export function logSyncEvent(
  event: string,
  result: SyncEventResult,
  details?: Record<string, unknown>,
): SyncAuditEntry {
  const entry: SyncAuditEntry = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    event,
    origin: getOrigin(),
    result,
    details,
  };

  const log = readLog();
  log.push(entry);
  writeLog(log);

  const tag = result === 'error' ? '❌' : result === 'skipped' ? '⏭️' : '✅';
  // eslint-disable-next-line no-console
  console.log(`[SyncAudit] ${tag} ${event} (${entry.origin})`, details ?? '');

  // Expor evento no window para testes E2E e debug
  try {
    (window as unknown as { __lastSyncEvent?: SyncAuditEntry }).__lastSyncEvent = entry;
    window.dispatchEvent(new CustomEvent('sync-audit', { detail: entry }));
  } catch {
    /* noop */
  }

  return entry;
}

export function getSyncAuditLog(): SyncAuditEntry[] {
  return readLog();
}

export function clearSyncAuditLog() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function exportSyncAuditLog(): string {
  return JSON.stringify(readLog(), null, 2);
}

// Helpers globais para inspeção rápida via DevTools
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__syncAudit = getSyncAuditLog;
  (window as unknown as Record<string, unknown>).__syncAuditExport = exportSyncAuditLog;
  (window as unknown as Record<string, unknown>).__syncAuditClear = clearSyncAuditLog;
}

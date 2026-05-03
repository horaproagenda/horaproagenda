/**
 * offlineQueue.ts
 *
 * Fila persistente (localStorage) de operações de mutação realizadas
 * enquanto o dispositivo está offline. As operações são reprocessadas
 * em ordem assim que a conectividade é restabelecida.
 *
 * Pensada para funcionar em conjunto com `useOfflineSync` e o
 * Service Worker (PWA) — a UI continua funcionando mesmo sem internet.
 */

export type QueuedOperation = {
  id: string;
  /** Identificador lógico do tipo de operação (ex: 'appointment.create') */
  type: string;
  /** Payload arbitrário, serializável em JSON */
  payload: unknown;
  /** Epoch ms */
  createdAt: number;
  /** Quantas vezes já tentamos sincronizar */
  attempts: number;
  /** Última mensagem de erro, quando aplicável */
  lastError?: string;
};

const STORAGE_KEY = 'app:offlineQueue:v1';
const MAX_ATTEMPTS = 5;

type Listener = (queue: QueuedOperation[]) => void;
const listeners = new Set<Listener>();

function safeRead(): QueuedOperation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(queue: QueuedOperation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[offlineQueue] Falha ao salvar fila:', e);
  }
  listeners.forEach((l) => {
    try {
      l(queue);
    } catch (err) {
      console.warn('[offlineQueue] listener falhou:', err);
    }
  });
}

export function getQueue(): QueuedOperation[] {
  return safeRead();
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  // emite estado atual imediatamente
  try {
    listener(safeRead());
  } catch {
    /* noop */
  }
  return () => {
    listeners.delete(listener);
  };
}

export function enqueue(op: Omit<QueuedOperation, 'id' | 'createdAt' | 'attempts'>): QueuedOperation {
  const queue = safeRead();
  const entry: QueuedOperation = {
    ...op,
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `op_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    attempts: 0,
  };
  queue.push(entry);
  safeWrite(queue);
  return entry;
}

export function removeFromQueue(id: string) {
  const queue = safeRead().filter((op) => op.id !== id);
  safeWrite(queue);
}

export function clearQueue() {
  safeWrite([]);
}

export function markAttempt(id: string, error?: string) {
  const queue = safeRead().map((op) =>
    op.id === id
      ? { ...op, attempts: op.attempts + 1, lastError: error }
      : op,
  );
  safeWrite(queue);
}

/**
 * Processa cada operação da fila com o handler informado, em ordem FIFO.
 * Operações com sucesso são removidas; falhas têm `attempts` incrementado
 * e são descartadas após `MAX_ATTEMPTS` tentativas.
 *
 * Retorna um resumo do processamento.
 */
export async function processQueue(
  handler: (op: QueuedOperation) => Promise<void>,
): Promise<{ processed: number; failed: number; dropped: number }> {
  const queue = safeRead();
  let processed = 0;
  let failed = 0;
  let dropped = 0;

  for (const op of queue) {
    try {
      await handler(op);
      removeFromQueue(op.id);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextAttempts = op.attempts + 1;
      if (nextAttempts >= MAX_ATTEMPTS) {
        removeFromQueue(op.id);
        dropped += 1;
      } else {
        markAttempt(op.id, message);
        failed += 1;
      }
    }
  }

  return { processed, failed, dropped };
}

export const __testing__ = { STORAGE_KEY, MAX_ATTEMPTS };

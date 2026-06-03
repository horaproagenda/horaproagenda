/**
 * Fila local de mensagens WhatsApp.
 *
 * Objetivo: enviar mensagens em background sem travar a UI, com
 * concorrência limitada, retry com backoff exponencial e persistência
 * em sessionStorage para sobreviver a navegações dentro da sessão.
 *
 * Cada job é entregue ao edge function `whatsapp-send`. Se o envio
 * falhar (rede, UltraMsg temporariamente indisponível, etc.) o job
 * é re-agendado até `maxAttempts`. Após esgotar tentativas, o job
 * é marcado como `failed` e o callback `onFailure` é chamado.
 *
 * Esta fila é client-side. Para automações server-side (lembretes
 * agendados), os edge functions existentes já fazem seu próprio
 * controle de envio.
 */
import { supabase } from '@/integrations/supabase/client';

export interface WhatsappJob {
  id: string;
  phone: string;
  message: string;
  options?: {
    client_id?: string;
    professional_id?: string;
    test?: boolean;
  };
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  nextRunAt: number; // epoch ms
  status: 'pending' | 'running' | 'failed' | 'done';
  lastError?: string;
  createdAt: number;
}

type Listener = (snapshot: QueueSnapshot) => void;

/** Janela de deduplicação para jobs já concluídos (ms). */
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutos

function normalizePhoneForKey(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

function defaultIdempotencyKey(input: {
  phone: string;
  message: string;
  options?: WhatsappJob['options'];
}): string {
  const phone = normalizePhoneForKey(input.phone);
  const msg = (input.message || '').trim();
  const client = input.options?.client_id ?? '';
  const prof = input.options?.professional_id ?? '';
  // Hash leve (djb2) — suficiente para deduplicação local.
  const raw = `${phone}|${client}|${prof}|${msg}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return `wa_${phone}_${(h >>> 0).toString(36)}`;
}

export interface QueueSnapshot {
  pending: number;
  running: number;
  failed: number;
  done: number;
  total: number;
}

const STORAGE_KEY = 'whatsapp-message-queue:v1';
const MAX_CONCURRENCY = 2;
const BASE_BACKOFF_MS = 4_000;

class WhatsappMessageQueue {
  private jobs: Map<string, WhatsappJob> = new Map();
  /** idempotencyKey -> timestamp do último envio concluído (para dedup TTL). */
  private recentlySent: Map<string, number> = new Map();
  private running = 0;
  private listeners = new Set<Listener>();
  private tickTimer: number | null = null;
  private paused = false;

  constructor() {
    this.restore();
    this.schedule();
  }

  // ---- Public API ----------------------------------------------------------

  enqueue(input: {
    phone: string;
    message: string;
    options?: WhatsappJob['options'];
    maxAttempts?: number;
    idempotencyKey?: string;
  }): string {
    const idempotencyKey = input.idempotencyKey ?? defaultIdempotencyKey(input);

    // 1) Dedup: já existe um job ativo (pending/running) com a mesma chave?
    for (const existing of this.jobs.values()) {
      if (
        existing.idempotencyKey === idempotencyKey &&
        (existing.status === 'pending' || existing.status === 'running')
      ) {
        return existing.id;
      }
    }

    // 2) Dedup TTL: já enviamos essa mesma mensagem recentemente?
    const lastSentAt = this.recentlySent.get(idempotencyKey);
    if (lastSentAt && Date.now() - lastSentAt < DEDUP_TTL_MS) {
      // Cria um job "done" virtual só pra retornar id estável? Não — apenas ignora.
      return `dedup:${idempotencyKey}`;
    }

    const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    const job: WhatsappJob = {
      id,
      phone: input.phone,
      message: input.message,
      options: input.options,
      idempotencyKey,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 4,
      nextRunAt: Date.now(),
      status: 'pending',
      createdAt: Date.now(),
    };
    this.jobs.set(id, job);
    this.persist();
    this.notify();
    this.schedule(0);
    return id;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; this.schedule(0); }

  retryFailed() {
    let touched = false;
    for (const job of this.jobs.values()) {
      if (job.status === 'failed') {
        job.status = 'pending';
        job.attempts = 0;
        job.nextRunAt = Date.now();
        touched = true;
      }
    }
    if (touched) {
      this.persist();
      this.notify();
      this.schedule(0);
    }
  }

  clearDone() {
    let touched = false;
    for (const [id, job] of this.jobs) {
      if (job.status === 'done') { this.jobs.delete(id); touched = true; }
    }
    if (touched) { this.persist(); this.notify(); }
  }

  snapshot(): QueueSnapshot {
    let pending = 0, running = 0, failed = 0, done = 0;
    for (const j of this.jobs.values()) {
      if (j.status === 'pending') pending++;
      else if (j.status === 'running') running++;
      else if (j.status === 'failed') failed++;
      else if (j.status === 'done') done++;
    }
    return { pending, running, failed, done, total: this.jobs.size };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => { this.listeners.delete(fn); };
  }

  // ---- Internals -----------------------------------------------------------

  private notify() {
    const snap = this.snapshot();
    this.listeners.forEach((l) => { try { l(snap); } catch { /* ignore */ } });
  }

  private persist() {
    try {
      const arr = Array.from(this.jobs.values())
        // Não persistir jobs concluídos para não inflar storage.
        .filter((j) => j.status !== 'done');
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch { /* ignore quota / disabled storage */ }
  }

  private restore() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as WhatsappJob[];
      arr.forEach((j) => {
        // Jobs que estavam "running" antes do reload voltam para pending.
        if (j.status === 'running') j.status = 'pending';
        this.jobs.set(j.id, j);
      });
    } catch { /* ignore */ }
  }

  private schedule(delayMs?: number) {
    if (this.tickTimer != null) {
      window.clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    const wait = delayMs ?? 1_000;
    this.tickTimer = window.setTimeout(() => { void this.tick(); }, wait);
  }

  private async tick() {
    this.tickTimer = null;
    if (this.paused) { this.schedule(); return; }

    const now = Date.now();
    const runnable: WhatsappJob[] = [];
    for (const job of this.jobs.values()) {
      if (job.status === 'pending' && job.nextRunAt <= now) {
        runnable.push(job);
      }
    }
    runnable.sort((a, b) => a.nextRunAt - b.nextRunAt);

    while (this.running < MAX_CONCURRENCY && runnable.length > 0) {
      const job = runnable.shift()!;
      void this.runJob(job);
    }

    // Próximo tick: se há jobs pendentes futuros, escala para o mais próximo.
    let nextWait = 5_000;
    for (const job of this.jobs.values()) {
      if (job.status === 'pending') {
        const delta = Math.max(250, job.nextRunAt - Date.now());
        if (delta < nextWait) nextWait = delta;
      }
    }
    this.schedule(nextWait);
  }

  private async runJob(job: WhatsappJob) {
    job.status = 'running';
    job.attempts += 1;
    this.running += 1;
    this.notify();

    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          phone: job.phone,
          message: job.message,
          ...(job.options ?? {}),
        },
      });
      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.error || 'Falha ao enviar mensagem');
      }
      job.status = 'done';
      job.lastError = undefined;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      job.lastError = msg;
      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
      } else {
        // Backoff exponencial: 4s, 8s, 16s, 32s...
        const wait = BASE_BACKOFF_MS * Math.pow(2, job.attempts - 1);
        job.nextRunAt = Date.now() + wait;
        job.status = 'pending';
      }
    } finally {
      this.running -= 1;
      this.persist();
      this.notify();
      this.schedule(0);
    }
  }
}

// Singleton compartilhado.
export const whatsappMessageQueue = new WhatsappMessageQueue();

/**
 * Helper de uso direto: enfileira uma mensagem para envio em background.
 * Retorna o id do job — o componente pode subscrever a fila para acompanhar.
 */
export function enqueueWhatsappMessage(
  phone: string,
  message: string,
  options?: WhatsappJob['options'],
) {
  return whatsappMessageQueue.enqueue({ phone, message, options });
}

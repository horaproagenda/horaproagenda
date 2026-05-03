import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enqueue,
  getQueue,
  removeFromQueue,
  clearQueue,
  processQueue,
  subscribeQueue,
  __testing__,
} from './offlineQueue';

beforeEach(() => {
  localStorage.clear();
});

describe('offlineQueue', () => {
  it('enfileira operações com id e timestamp', () => {
    const op = enqueue({ type: 'appointment.create', payload: { a: 1 } });
    expect(op.id).toBeTruthy();
    expect(op.attempts).toBe(0);
    expect(op.createdAt).toBeGreaterThan(0);
    expect(getQueue()).toHaveLength(1);
  });

  it('persiste em localStorage', () => {
    enqueue({ type: 'x', payload: null });
    const raw = localStorage.getItem(__testing__.STORAGE_KEY);
    expect(raw).toContain('"type":"x"');
  });

  it('remove operação por id', () => {
    const op = enqueue({ type: 't', payload: 1 });
    enqueue({ type: 't', payload: 2 });
    removeFromQueue(op.id);
    const queue = getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toBe(2);
  });

  it('clearQueue esvazia tudo', () => {
    enqueue({ type: 't', payload: 1 });
    enqueue({ type: 't', payload: 2 });
    clearQueue();
    expect(getQueue()).toHaveLength(0);
  });

  it('subscribeQueue emite estado inicial e notifica mudanças', () => {
    const listener = vi.fn();
    const unsub = subscribeQueue(listener);
    expect(listener).toHaveBeenCalledWith([]);

    enqueue({ type: 't', payload: 1 });
    expect(listener).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ type: 't' }),
    ]));

    unsub();
  });

  it('processQueue executa em ordem FIFO e remove sucessos', async () => {
    enqueue({ type: 'a', payload: 1 });
    enqueue({ type: 'a', payload: 2 });
    enqueue({ type: 'a', payload: 3 });

    const handled: unknown[] = [];
    const result = await processQueue(async (op) => {
      handled.push(op.payload);
    });

    expect(handled).toEqual([1, 2, 3]);
    expect(result.processed).toBe(3);
    expect(result.failed).toBe(0);
    expect(getQueue()).toHaveLength(0);
  });

  it('processQueue mantém na fila em caso de falha (incrementando attempts)', async () => {
    enqueue({ type: 'a', payload: 'fail' });

    const result = await processQueue(async () => {
      throw new Error('boom');
    });

    expect(result.failed).toBe(1);
    expect(result.processed).toBe(0);
    const queue = getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBe(1);
    expect(queue[0].lastError).toBe('boom');
  });

  it('descarta operação após MAX_ATTEMPTS', async () => {
    enqueue({ type: 'a', payload: 'fail' });

    for (let i = 0; i < __testing__.MAX_ATTEMPTS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await processQueue(async () => {
        throw new Error('boom');
      });
    }

    expect(getQueue()).toHaveLength(0);
  });

  it('processa parcialmente quando alguns falham e outros passam', async () => {
    enqueue({ type: 'ok', payload: 1 });
    enqueue({ type: 'fail', payload: 2 });
    enqueue({ type: 'ok', payload: 3 });

    const result = await processQueue(async (op) => {
      if (op.type === 'fail') throw new Error('x');
    });

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
    const remaining = getQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].type).toBe('fail');
  });
});

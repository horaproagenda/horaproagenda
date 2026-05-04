/**
 * Testes de integração — Fila Offline + Reconexão
 *
 * Garante o fluxo completo:
 *   1. Usuário fica offline
 *   2. Ações são enfileiradas (persistidas em localStorage)
 *   3. Conexão volta
 *   4. Fila é processada automaticamente em ordem (FIFO)
 *   5. Falhas são reenviadas até MAX_ATTEMPTS
 *   6. Estado da UI (pendingCount/isOnline) reflete cada etapa
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    message: vi.fn(),
    loading: vi.fn(() => 'tid'),
    dismiss: vi.fn(),
  },
}));

import { toast } from 'sonner';
import {
  useOfflineSync,
  registerOfflineHandler,
} from '@/hooks/useOfflineSync';
import {
  enqueue,
  getQueue,
  clearQueue,
  __testing__,
} from '@/lib/offlineQueue';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(
    QueryClientProvider,
    { client: qc },
    children,
  );
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  localStorage.clear();
  clearQueue();
  vi.clearAllMocks();
  setOnline(true);
});

afterEach(() => {
  setOnline(true);
});

describe('Integração: Fila offline → reconexão', () => {
  it('processa todas as operações enfileiradas offline assim que volta online', async () => {
    const created: number[] = [];
    const unregister = registerOfflineHandler('appointment.create', async (op) => {
      created.push((op.payload as { id: number }).id);
    });

    setOnline(false);
    const { result } = renderHook(() => useOfflineSync(), { wrapper });

    // Enfileira 3 ações enquanto offline
    await act(async () => {
      enqueue({ type: 'appointment.create', payload: { id: 1 } });
      enqueue({ type: 'appointment.create', payload: { id: 2 } });
      enqueue({ type: 'appointment.create', payload: { id: 3 } });
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(3));
    expect(result.current.isOnline).toBe(false);

    // Reconecta
    await act(async () => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(created).toEqual([1, 2, 3]);
      expect(getQueue()).toHaveLength(0);
      expect(result.current.pendingCount).toBe(0);
    });

    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('3 alteração(ões) sincronizada(s)'),
      expect.any(Object),
    );

    unregister();
  });

  it('preserva a fila em localStorage entre "reloads" (re-mounts)', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const unregister = registerOfflineHandler('persisted.op', handler);

    setOnline(false);
    enqueue({ type: 'persisted.op', payload: { a: 1 } });
    enqueue({ type: 'persisted.op', payload: { a: 2 } });

    // Simula primeiro mount offline
    const first = renderHook(() => useOfflineSync(), { wrapper });
    await waitFor(() => expect(first.result.current.pendingCount).toBe(2));
    first.unmount();

    // Verifica que a fila sobreviveu ao unmount (reload simulado)
    expect(getQueue()).toHaveLength(2);

    // Re-mount já online → deve disparar sync inicial
    setOnline(true);
    const second = renderHook(() => useOfflineSync(), { wrapper });

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(2);
      expect(second.result.current.pendingCount).toBe(0);
    });

    unregister();
  });

  it('mantém ordem FIFO quando múltiplos tipos coexistem na fila', async () => {
    const order: string[] = [];
    const u1 = registerOfflineHandler('a', async (op) => {
      order.push(`a:${op.payload}`);
    });
    const u2 = registerOfflineHandler('b', async (op) => {
      order.push(`b:${op.payload}`);
    });

    setOnline(false);
    renderHook(() => useOfflineSync(), { wrapper });

    await act(async () => {
      enqueue({ type: 'a', payload: 1 });
      enqueue({ type: 'b', payload: 2 });
      enqueue({ type: 'a', payload: 3 });
      enqueue({ type: 'b', payload: 4 });
    });

    await act(async () => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(order).toEqual(['a:1', 'b:2', 'a:3', 'b:4']);
    });

    u1();
    u2();
  });

  it('reenvia operação que falha e remove após MAX_ATTEMPTS', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('rede instável'));
    const unregister = registerOfflineHandler('flaky.op', handler);

    const { result } = renderHook(() => useOfflineSync(), { wrapper });

    await act(async () => {
      enqueue({ type: 'flaky.op', payload: 'x' });
    });

    // Tenta MAX_ATTEMPTS vezes manualmente
    for (let i = 0; i < __testing__.MAX_ATTEMPTS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await result.current.sync();
      });
    }

    expect(handler).toHaveBeenCalledTimes(__testing__.MAX_ATTEMPTS);
    expect(getQueue()).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('descartada(s)'),
      expect.any(Object),
    );

    unregister();
  });

  it('sincroniza parcialmente: mantém apenas as falhas na fila', async () => {
    const uOk = registerOfflineHandler('ok', async () => {
      /* sucesso */
    });
    const uFail = registerOfflineHandler('fail', async () => {
      throw new Error('400 bad request');
    });

    // Mantém online e usa sync() manual para garantir UMA passagem
    const { result } = renderHook(() => useOfflineSync(), { wrapper });

    await act(async () => {
      enqueue({ type: 'ok', payload: 1 });
      enqueue({ type: 'fail', payload: 2 });
      enqueue({ type: 'ok', payload: 3 });
    });

    await act(async () => {
      await result.current.sync();
    });

    const remaining = getQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].type).toBe('fail');
    expect(remaining[0].attempts).toBe(1);

    uOk();
    uFail();
  });

  it('sincronização manual (sync()) funciona online sem evento "online"', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const unregister = registerOfflineHandler('manual.op', handler);

    const { result } = renderHook(() => useOfflineSync(), { wrapper });

    await act(async () => {
      enqueue({ type: 'manual.op', payload: 'go' });
    });

    await act(async () => {
      await result.current.sync();
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(getQueue()).toHaveLength(0);

    unregister();
  });

  it('não dispara sync quando offline (mesmo chamando manualmente)', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const unregister = registerOfflineHandler('blocked', handler);

    setOnline(false);
    const { result } = renderHook(() => useOfflineSync(), { wrapper });

    await act(async () => {
      enqueue({ type: 'blocked', payload: 1 });
    });

    await act(async () => {
      await result.current.sync();
    });

    expect(handler).not.toHaveBeenCalled();
    expect(getQueue()).toHaveLength(1);

    unregister();
  });

  it('operação sem handler permanece na fila (ignorada com segurança)', async () => {
    const { result } = renderHook(() => useOfflineSync(), { wrapper });

    await act(async () => {
      enqueue({ type: 'unknown.type', payload: { foo: 'bar' } });
    });

    await act(async () => {
      await result.current.sync();
    });

    // Sem handler → falha controlada → permanece na fila com attempts++
    const queue = getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBeGreaterThanOrEqual(1);
    expect(queue[0].lastError).toContain('Sem handler');
  });
});

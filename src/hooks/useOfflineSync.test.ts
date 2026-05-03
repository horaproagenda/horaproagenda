import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
import { useOfflineSync, registerOfflineHandler } from './useOfflineSync';
import { enqueue, clearQueue, getQueue } from '@/lib/offlineQueue';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  localStorage.clear();
  clearQueue();
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('useOfflineSync', () => {
  it('reflete o estado inicial de conectividade', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const { result } = renderHook(() => useOfflineSync(), { wrapper });
    expect(result.current.isOnline).toBe(false);
  });

  it('alerta quando fica offline e quando volta online', async () => {
    const { result } = renderHook(() => useOfflineSync(), { wrapper });
    expect(result.current.isOnline).toBe(true);

    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOnline).toBe(false);
    expect(toast.warning).toHaveBeenCalledWith(
      'Você está offline',
      expect.any(Object),
    );

    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.isOnline).toBe(true);
    expect(toast.success).toHaveBeenCalledWith(
      'Conexão restabelecida',
      expect.any(Object),
    );
  });

  it('expõe a contagem de operações pendentes', async () => {
    enqueue({ type: 'noop', payload: { x: 1 } });
    enqueue({ type: 'noop', payload: { x: 2 } });

    const { result } = renderHook(() => useOfflineSync(), { wrapper });
    await waitFor(() => expect(result.current.pendingCount).toBe(2));
  });

  it('processa a fila quando volta online (via handler registrado)', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const unregister = registerOfflineHandler('test.op', handler);

    enqueue({ type: 'test.op', payload: { hello: 'world' } });

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const { result } = renderHook(() => useOfflineSync(), { wrapper });

    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      window.dispatchEvent(new Event('online'));
      // Aguarda o ciclo de processamento
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
      expect(getQueue()).toHaveLength(0);
      expect(result.current.pendingCount).toBe(0);
    });

    unregister();
  });

  it('mantém na fila quando handler falha', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    const unregister = registerOfflineHandler('flaky', handler);

    // Renderiza primeiro (sem itens na fila ainda)
    const { result } = renderHook(() => useOfflineSync(), { wrapper });

    // Enfileira após o mount para evitar auto-sync inicial
    await act(async () => {
      enqueue({ type: 'flaky', payload: 1 });
    });

    await act(async () => {
      await result.current.sync();
    });

    expect(handler).toHaveBeenCalled();
    expect(getQueue()).toHaveLength(1);
    expect(getQueue()[0].attempts).toBeGreaterThanOrEqual(1);

    unregister();
  });
});

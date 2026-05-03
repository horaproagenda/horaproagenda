import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock do sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    message: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
  },
}));

import { toast } from 'sonner';
import { useAppUpdater } from './useAppUpdater';

type Listener = (event: Event) => void;

class MockServiceWorker extends EventTarget {
  state: 'installing' | 'installed' | 'activated' = 'installing';
  postMessage = vi.fn();
}

class MockRegistration extends EventTarget {
  installing: MockServiceWorker | null = null;
  waiting: MockServiceWorker | null = null;
  update = vi.fn().mockResolvedValue(undefined);
}

let mockRegistration: MockRegistration;
let controllerChangeListeners: Listener[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  mockRegistration = new MockRegistration();
  controllerChangeListeners = [];

  // @ts-expect-error mock global
  global.navigator.serviceWorker = {
    getRegistration: vi.fn().mockResolvedValue(mockRegistration),
    addEventListener: (type: string, listener: Listener) => {
      if (type === 'controllerchange') controllerChangeListeners.push(listener);
    },
    removeEventListener: vi.fn(),
    controller: {} as ServiceWorker,
  };

  // Mock reload sem quebrar jsdom
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: vi.fn() },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  // @ts-expect-error mock global
  delete global.navigator.serviceWorker;
});

describe('useAppUpdater', () => {
  it('verifica atualizações periodicamente (60s) e ao montar', async () => {
    renderHook(() => useAppUpdater());
    // Aguarda promessa de getRegistration resolver
    await act(async () => { await Promise.resolve(); });

    expect(mockRegistration.update).toHaveBeenCalledTimes(1); // checagem inicial

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockRegistration.update).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockRegistration.update).toHaveBeenCalledTimes(3);
  });

  it('mostra toast e aciona SKIP_WAITING quando uma nova versão é instalada', async () => {
    renderHook(() => useAppUpdater());
    await act(async () => { await Promise.resolve(); });

    // Simula nova versão sendo instalada
    const newWorker = new MockServiceWorker();
    mockRegistration.installing = newWorker;
    mockRegistration.dispatchEvent(new Event('updatefound'));

    // Worker passou ao estado 'installed'
    newWorker.state = 'installed';
    newWorker.dispatchEvent(new Event('statechange'));

    expect(toast.success).toHaveBeenCalledWith(
      'Nova versão disponível!',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Atualizar agora' }),
      }),
    );

    // SKIP_WAITING é enviado em ~1s
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(newWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    // Reload em ~4s
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('detecta SW já em waiting na primeira carga', async () => {
    const waiting = new MockServiceWorker();
    mockRegistration.waiting = waiting;

    renderHook(() => useAppUpdater());
    await act(async () => { await Promise.resolve(); });

    expect(toast.success).toHaveBeenCalledWith(
      'Nova versão disponível!',
      expect.any(Object),
    );
  });

  it('controllerchange força reload', async () => {
    renderHook(() => useAppUpdater());
    await act(async () => { await Promise.resolve(); });

    controllerChangeListeners.forEach((l) => l(new Event('controllerchange')));
    expect(window.location.reload).toHaveBeenCalled();
  });
});

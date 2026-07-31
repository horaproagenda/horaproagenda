import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const { toastMock, checkConnection, queue } = vi.hoisted(() => ({
  toastMock: {
    error: vi.fn(() => 'id-error'),
    warning: vi.fn(() => 'id-warning'),
    success: vi.fn(() => 'id-success'),
    dismiss: vi.fn(),
  },
  checkConnection: vi.fn(),
  queue: { pause: vi.fn(), resume: vi.fn(), retryFailed: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/hooks/useWhatsapp', () => ({ useWhatsapp: () => ({ checkConnection }) }));
vi.mock('@/lib/whatsappMessageQueue', () => ({ whatsappMessageQueue: queue }));

import { useWhatsappConnectionKeepAlive } from '@/hooks/useWhatsappConnectionKeepAlive';

describe('useWhatsappConnectionKeepAlive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
  afterEach(() => vi.useRealTimers());

  it('não emite alertas de queda quando os lembretes estão inativos (notify=false)', async () => {
    checkConnection.mockResolvedValue({ configured: true, connected: false, state: 'close' });
    renderHook(() =>
      useWhatsappConnectionKeepAlive('prof-1', { notify: false, intervalMs: 60_000, fastIntervalMs: 60_000 }),
    );
    await waitFor(() => expect(checkConnection).toHaveBeenCalled());
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('avisa e pausa a fila ao detectar queda quando notify=true', async () => {
    checkConnection.mockResolvedValue({ configured: true, connected: false, state: 'close' });
    renderHook(() =>
      useWhatsappConnectionKeepAlive('prof-1', { notify: true, intervalMs: 60_000, fastIntervalMs: 60_000 }),
    );
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalled());
    expect(queue.pause).toHaveBeenCalled();
  });

  it('reconsulta no intervalo rápido e retoma a fila quando a sessão volta', async () => {
    vi.useFakeTimers();
    checkConnection
      .mockResolvedValueOnce({ configured: true, connected: false, state: 'close' })
      .mockResolvedValue({ configured: true, connected: true, state: 'open' });

    renderHook(() =>
      useWhatsappConnectionKeepAlive('prof-1', { notify: true, intervalMs: 60_000, fastIntervalMs: 5_000 }),
    );
    await act(async () => { await Promise.resolve(); });
    // enquanto desconectado, a próxima verificação acontece no intervalo rápido
    await act(async () => { await vi.advanceTimersByTimeAsync(5_100); });

    expect(queue.resume).toHaveBeenCalled();
    expect(queue.retryFailed).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalled();
  });


  it('propaga o status para o callback onStatus (usado para esconder o QR Code)', async () => {
    checkConnection.mockResolvedValue({ configured: true, connected: true, state: 'open' });
    const onStatus = vi.fn();
    renderHook(() =>
      useWhatsappConnectionKeepAlive('prof-1', { notify: true, onStatus }),
    );
    await waitFor(() => expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ connected: true }),
    ));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const h = vi.hoisted(() => ({
  toastWarning: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
  usage: { current: null as unknown },
}));

vi.mock('sonner', () => ({
  toast: { warning: h.toastWarning, info: h.toastInfo, error: h.toastError, success: h.toastSuccess },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: h.invoke } },
}));

vi.mock('@/hooks/useSeatUsage', () => ({
  useSeatUsage: () => h.usage.current,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@b.com', user_metadata: {} } }),
}));

import { useSeatThresholdNotifier } from '../useSeatThresholdNotifier';

describe('useSeatThresholdNotifier', () => {
  beforeEach(() => {
    h.toastWarning.mockClear();
    h.toastInfo.mockClear();
    h.invoke.mockClear();
  });

  it('does NOT toast when paid user is exactly at seat_limit (1/1)', () => {
    h.usage.current = { used: 1, seat_limit: 1, available: 0, is_grandfathered: false };
    renderHook(() => useSeatThresholdNotifier());
    expect(h.toastWarning).not.toHaveBeenCalled();
    expect(h.toastInfo).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('does NOT toast at full capacity on multi-seat plan (3/3)', () => {
    h.usage.current = { used: 3, seat_limit: 3, available: 0, is_grandfathered: false };
    renderHook(() => useSeatThresholdNotifier());
    expect(h.toastWarning).not.toHaveBeenCalled();
    expect(h.toastInfo).not.toHaveBeenCalled();
  });

  it('does NOT toast for grandfathered accounts', () => {
    h.usage.current = { used: 999, seat_limit: 1, available: 0, is_grandfathered: true };
    renderHook(() => useSeatThresholdNotifier());
    expect(h.toastWarning).not.toHaveBeenCalled();
  });

  it('warns "acima do plano" when used > seat_limit (downgrade)', () => {
    h.usage.current = { used: 5, seat_limit: 3, available: 0, is_grandfathered: false };
    renderHook(() => useSeatThresholdNotifier());
    expect(h.toastWarning).toHaveBeenCalledTimes(1);
    const [title, opts] = h.toastWarning.mock.calls[0];
    expect(title).toMatch(/acima do plano/i);
    expect(String(opts.description)).toContain('5');
    expect(String(opts.description)).toContain('3');
  });
});

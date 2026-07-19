import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mocks devem ser declarados antes de importar o hook.
const toastWarning = vi.fn();
const toastInfo = vi.fn();
vi.mock('sonner', () => ({
  toast: { warning: toastWarning, info: toastInfo, error: vi.fn(), success: vi.fn() },
}));

const invokeMock = vi.fn().mockResolvedValue({ data: null, error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

const usageRef: { current: unknown } = { current: null };
vi.mock('@/hooks/useSeatUsage', () => ({
  useSeatUsage: () => usageRef.current,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@b.com', user_metadata: {} } }),
}));

import { useSeatThresholdNotifier } from '../useSeatThresholdNotifier';

describe('useSeatThresholdNotifier', () => {
  beforeEach(() => {
    toastWarning.mockClear();
    toastInfo.mockClear();
    invokeMock.mockClear();
  });

  it('does NOT toast when paid user is exactly at seat_limit (1/1)', () => {
    usageRef.current = { used: 1, seat_limit: 1, available: 0, is_grandfathered: false };
    renderHook(() => useSeatThresholdNotifier());
    expect(toastWarning).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('does NOT toast at full capacity on multi-seat plan (3/3)', () => {
    usageRef.current = { used: 3, seat_limit: 3, available: 0, is_grandfathered: false };
    renderHook(() => useSeatThresholdNotifier());
    expect(toastWarning).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('does NOT toast for grandfathered accounts', () => {
    usageRef.current = { used: 999, seat_limit: 1, available: 0, is_grandfathered: true };
    renderHook(() => useSeatThresholdNotifier());
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it('warns "acima do plano" when used > seat_limit (downgrade)', () => {
    usageRef.current = { used: 5, seat_limit: 3, available: 0, is_grandfathered: false };
    renderHook(() => useSeatThresholdNotifier());
    expect(toastWarning).toHaveBeenCalledTimes(1);
    const [title, opts] = toastWarning.mock.calls[0];
    expect(title).toMatch(/acima do plano/i);
    expect(String(opts.description)).toContain('5');
    expect(String(opts.description)).toContain('3');
  });
});

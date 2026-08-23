import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const invoke = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

const { waitForSubscriptionAccess, grantsAppAccess } = await import('../subscriptionSync');
type Sub = Awaited<ReturnType<typeof waitForSubscriptionAccess>>;

const trial: NonNullable<Sub> = {
  id: 'sub-1',
  is_grandfathered: false,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  status: 'trial' as const,
  trial_ends_at: new Date(Date.now() + 30 * 864e5).toISOString(),
};
const active: NonNullable<Sub> = { ...trial, status: 'active' };

beforeEach(() => {
  rpc.mockReset();
  invoke.mockClear();
});

describe('regressão: retorno do checkout pago', () => {
  it('não confirma pagamento com registro de teste gratuito pré-existente', async () => {
    rpc.mockResolvedValue({ data: trial, error: null });
    const result = await waitForSubscriptionAccess({ timeoutMs: 0, intervalMs: 0, requirePaid: true });
    expect(result).toBeNull();
  });

  it('confirma quando a assinatura vira ativa', async () => {
    rpc.mockResolvedValue({ data: active, error: null });
    const result = await waitForSubscriptionAccess({ timeoutMs: 0, intervalMs: 0, requirePaid: true });
    expect(result?.status).toBe('active');
  });

  it('teste gratuito continua liberando o acesso ao aplicativo', () => {
    expect(grantsAppAccess(trial)).toBe(true);
  });
});

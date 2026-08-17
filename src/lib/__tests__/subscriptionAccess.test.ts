import { describe, it, expect } from 'vitest';
import { hasSubscriptionAccess, getBlockReason, type SubscriptionAccessLike } from '@/lib/subscriptionAccess';

const base: SubscriptionAccessLike = {
  status: 'active',
  trial_ends_at: null,
  is_grandfathered: false,
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: 'sub_1',
};

const NOW = new Date('2026-08-17T12:00:00Z').getTime();

describe('subscriptionAccess', () => {
  it('libera assinatura ativa e vitalícia', () => {
    expect(hasSubscriptionAccess(base, NOW)).toBe(true);
    expect(hasSubscriptionAccess({ ...base, status: 'canceled', is_grandfathered: true }, NOW)).toBe(true);
    expect(getBlockReason(base, NOW)).toBeNull();
  });

  it('libera teste vigente e bloqueia teste expirado como pagamento recusado', () => {
    const trialing = { ...base, status: 'trial' as const, trial_ends_at: '2026-09-01T00:00:00Z' };
    expect(hasSubscriptionAccess(trialing, NOW)).toBe(true);
    const expired = { ...trialing, trial_ends_at: '2026-08-01T00:00:00Z' };
    expect(hasSubscriptionAccess(expired, NOW)).toBe(false);
    expect(getBlockReason(expired, NOW)).toBe('payment_failed');
  });

  it('past_due é pagamento recusado', () => {
    expect(getBlockReason({ ...base, status: 'past_due' }, NOW)).toBe('payment_failed');
  });

  it('canceled com cliente Stripe é pagamento recusado', () => {
    expect(getBlockReason({ ...base, status: 'canceled' }, NOW)).toBe('payment_failed');
  });

  it('quem nunca assinou cai em no_plan', () => {
    const never = {
      ...base,
      status: 'trial' as const,
      trial_ends_at: '2026-08-01T00:00:00Z',
      stripe_customer_id: null,
      stripe_subscription_id: null,
    };
    expect(getBlockReason(never, NOW)).toBe('no_plan');
  });

  it('sem dados carregados não bloqueia', () => {
    expect(hasSubscriptionAccess(null, NOW)).toBe(true);
    expect(getBlockReason(null, NOW)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { grantsAppAccess } from '@/lib/subscriptionSync';

const base = {
  status: 'trial' as const,
  trial_ends_at: null as string | null,
  is_grandfathered: false,
  stripe_customer_id: null as string | null,
  stripe_subscription_id: null as string | null,
};

describe('grantsAppAccess', () => {
  it('nega quando não há assinatura', () => {
    expect(grantsAppAccess(null)).toBe(false);
  });

  it('libera assinatura ativa', () => {
    expect(grantsAppAccess({ ...base, status: 'active' })).toBe(true);
  });

  it('libera teste gratuito vigente (cartão salvo no cadastro)', () => {
    const ends = new Date(Date.now() + 30 * 86400000).toISOString();
    expect(grantsAppAccess({ ...base, trial_ends_at: ends })).toBe(true);
  });

  it('nega teste expirado', () => {
    const ends = new Date(Date.now() - 86400000).toISOString();
    expect(grantsAppAccess({ ...base, trial_ends_at: ends })).toBe(false);
  });

  it('nega pagamento recusado', () => {
    expect(grantsAppAccess({ ...base, status: 'past_due' })).toBe(false);
  });
});

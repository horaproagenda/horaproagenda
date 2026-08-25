import { describe, it, expect } from 'vitest';
import { hasSubscriptionAccess, getBlockReason, type SubscriptionAccessLike } from '@/lib/subscriptionAccess';

const base: SubscriptionAccessLike = {
  status: 'active',
  trial_ends_at: null,
  is_grandfathered: false,
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: 'sub_1',
  asaas_customer_id: 'cus_asaas_1',
  asaas_subscription_id: 'sub_asaas_1',
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

  it('canceled com cobrança Asaas é pagamento recusado', () => {
    expect(getBlockReason({ ...base, status: 'canceled' }, NOW)).toBe('payment_failed');
  });

  it('quem nunca assinou cai em no_plan', () => {
    const never = {
      ...base,
      status: 'trial' as const,
      trial_ends_at: '2026-08-01T00:00:00Z',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      asaas_customer_id: null,
      asaas_subscription_id: null,
    };
    expect(getBlockReason(never, NOW)).toBe('no_plan');
  });

  it('sem dados carregados não bloqueia', () => {
    expect(hasSubscriptionAccess(null, NOW)).toBe(true);
    expect(getBlockReason(null, NOW)).toBeNull();
  });
});

describe('carência após cobrança recusada (2 dias corridos)', () => {
  it('mantém acesso dentro da carência e suspende depois', async () => {
    const { getPaymentPhase, getGraceDaysLeft } = await import('@/lib/subscriptionAccess');
    const pastDue = {
      ...base,
      status: 'past_due' as const,
      current_period_end: '2026-08-16T12:00:00Z',
    };
    expect(getPaymentPhase(pastDue, NOW)).toBe('grace');
    expect(hasSubscriptionAccess(pastDue, NOW)).toBe(true);
    expect(getGraceDaysLeft(pastDue, NOW)).toBe(1); // 16/08 + 2 dias = 18/08; de 17/08 resta 1 dia

    const late = { ...pastDue, current_period_end: '2026-08-01T12:00:00Z' };
    expect(getPaymentPhase(late, NOW)).toBe('suspended');
    expect(hasSubscriptionAccess(late, NOW)).toBe(false);
  });

  it('respeita o fim de carência calculado no servidor', async () => {
    const { getPaymentPhase, getGraceDaysLeft } = await import('@/lib/subscriptionAccess');
    const pastDue = {
      ...base,
      status: 'past_due' as const,
      current_period_end: '2026-08-10T12:00:00Z', // localmente já teria passado
      grace_ends_at: '2026-08-19T12:00:00Z',      // servidor ainda dá carência
    };
    expect(getPaymentPhase(pastDue, NOW)).toBe('grace');
    expect(getGraceDaysLeft(pastDue, NOW)).toBe(2);
  });

  it('status suspended bloqueia na hora, mesmo com carência local vigente', async () => {
    const { getPaymentPhase } = await import('@/lib/subscriptionAccess');
    const suspended = {
      ...base,
      status: 'suspended' as const,
      current_period_end: '2026-08-17T00:00:00Z',
    };
    expect(getPaymentPhase(suspended, NOW)).toBe('suspended');
    expect(hasSubscriptionAccess(suspended, NOW)).toBe(false);
    expect(getBlockReason(suspended, NOW)).toBe('payment_failed');
  });

  it('pendente sem cobrança no provedor é no_plan; com provedor entra em carência', async () => {
    const { getPaymentPhase } = await import('@/lib/subscriptionAccess');
    const freshPending = {
      ...base,
      status: 'pending' as const,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      asaas_customer_id: null,
      asaas_subscription_id: null,
    };
    expect(getBlockReason(freshPending, NOW)).toBe('no_plan');

    const charging = { ...base, status: 'pending' as const, updated_at: '2026-08-16T12:00:00Z' };
    expect(getBlockReason(charging, NOW)).toBe('payment_failed');
    expect(getPaymentPhase(charging, NOW)).toBe('grace');
  });

  it('cobrança do fim do teste recusada entra em carência', async () => {
    const { getPaymentPhase } = await import('@/lib/subscriptionAccess');
    const trialFailed = {
      ...base,
      status: 'trial' as const,
      trial_ends_at: '2026-08-16T12:00:00Z',
      current_period_end: null,
    };
    expect(getPaymentPhase(trialFailed, NOW)).toBe('grace');
    expect(hasSubscriptionAccess(trialFailed, NOW)).toBe(true);
  });

  it('quem nunca assinou não recebe carência', async () => {
    const { getPaymentPhase } = await import('@/lib/subscriptionAccess');
    const never = {
      ...base,
      status: 'canceled' as const,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      asaas_customer_id: null,
      asaas_subscription_id: null,
    };
    expect(getPaymentPhase(never, NOW)).toBe('ok');
    expect(hasSubscriptionAccess(never, NOW)).toBe(false);
  });
});

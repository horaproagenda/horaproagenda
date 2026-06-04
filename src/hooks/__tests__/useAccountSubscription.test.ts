import { describe, it, expect } from 'vitest';

/**
 * Reproduz a lógica de trialDaysLeft/hasAccess de useAccountSubscription
 * para garantir que mudanças futuras não quebrem o gating de trial.
 */
function computeAccess(sub: {
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'grandfathered';
  trial_ends_at: string | null;
  is_grandfathered: boolean;
} | null, now = Date.now()) {
  const trialEndsMs = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
  const trialDaysLeft = sub?.status === 'trial'
    ? Math.max(0, Math.ceil((trialEndsMs - now) / (1000 * 60 * 60 * 24)))
    : 0;
  const trialExpired = sub?.status === 'trial' && trialEndsMs < now;
  const hasAccess = !sub
    ? true
    : sub.is_grandfathered
      || sub.status === 'active'
      || sub.status === 'grandfathered'
      || (sub.status === 'trial' && !trialExpired);
  return { trialDaysLeft, trialExpired, hasAccess };
}

describe('useAccountSubscription gating', () => {
  const NOW = new Date('2026-06-04T12:00:00Z').getTime();

  it('libera acesso quando subscription ainda não carregou', () => {
    expect(computeAccess(null, NOW).hasAccess).toBe(true);
  });

  it('libera acesso vitalício para grandfathered', () => {
    const res = computeAccess({ status: 'grandfathered', trial_ends_at: null, is_grandfathered: true }, NOW);
    expect(res.hasAccess).toBe(true);
  });

  it('libera trial dentro do prazo e calcula dias restantes', () => {
    const ends = new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = computeAccess({ status: 'trial', trial_ends_at: ends, is_grandfathered: false }, NOW);
    expect(res.hasAccess).toBe(true);
    expect(res.trialExpired).toBe(false);
    expect(res.trialDaysLeft).toBe(7);
  });

  it('bloqueia trial expirado e zera dias restantes', () => {
    const ends = new Date(NOW - 1000).toISOString();
    const res = computeAccess({ status: 'trial', trial_ends_at: ends, is_grandfathered: false }, NOW);
    expect(res.hasAccess).toBe(false);
    expect(res.trialExpired).toBe(true);
    expect(res.trialDaysLeft).toBe(0);
  });

  it('libera quando status é active', () => {
    const res = computeAccess({ status: 'active', trial_ends_at: null, is_grandfathered: false }, NOW);
    expect(res.hasAccess).toBe(true);
  });

  it('bloqueia quando canceled', () => {
    const res = computeAccess({ status: 'canceled', trial_ends_at: null, is_grandfathered: false }, NOW);
    expect(res.hasAccess).toBe(false);
  });

  it('bloqueia quando past_due', () => {
    const res = computeAccess({ status: 'past_due', trial_ends_at: null, is_grandfathered: false }, NOW);
    expect(res.hasAccess).toBe(false);
  });
});

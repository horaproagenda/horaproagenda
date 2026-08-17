import { describe, expect, it } from 'vitest';
import { billingIntervalLabel, daysUntil, getRenewalNotice, isReminderDay } from '../subscriptionReminders';

const NOW = new Date('2026-08-17T12:00:00Z').getTime();
const inDays = (d: number) => new Date(NOW + d * 86400000).toISOString();

describe('subscriptionReminders', () => {
  it('rotula os ciclos do Stripe', () => {
    expect(billingIntervalLabel('month', 1)).toBe('mensal');
    expect(billingIntervalLabel('month', 6)).toBe('semestral');
    expect(billingIntervalLabel('year', 1)).toBe('anual');
    expect(billingIntervalLabel('week', 1)).toBeNull();
  });

  it('calcula dias restantes', () => {
    expect(daysUntil(inDays(3), NOW)).toBe(3);
    expect(daysUntil(inDays(-1), NOW)).toBe(0);
    expect(daysUntil(null, NOW)).toBeNull();
  });

  it('reconhece marcos de aviso', () => {
    expect(isReminderDay(7)).toBe(true);
    expect(isReminderDay(5)).toBe(false);
  });

  it('avisa renovação próxima de assinatura ativa', () => {
    const notice = getRenewalNotice(
      { status: 'active', is_grandfathered: false, current_period_end: inDays(3), trial_ends_at: null },
      NOW,
    );
    expect(notice).toMatchObject({ kind: 'renewal', daysLeft: 3 });
  });

  it('avisa fim do teste gratuito', () => {
    const notice = getRenewalNotice(
      { status: 'trial', is_grandfathered: false, current_period_end: null, trial_ends_at: inDays(1) },
      NOW,
    );
    expect(notice).toMatchObject({ kind: 'trial_charge', daysLeft: 1 });
  });

  it('não avisa fora da janela nem para vitalício', () => {
    expect(getRenewalNotice(
      { status: 'active', is_grandfathered: false, current_period_end: inDays(20), trial_ends_at: null },
      NOW,
    )).toBeNull();
    expect(getRenewalNotice(
      { status: 'active', is_grandfathered: true, current_period_end: inDays(2), trial_ends_at: null },
      NOW,
    )).toBeNull();
  });
});

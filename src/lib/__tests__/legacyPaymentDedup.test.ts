import { describe, it, expect } from 'vitest';
import {
  buildLegacyPaymentKey,
  buildLegacySaleKeySet,
  hasMatchingLegacySale,
  isLegacyRetroactiveAppointment,
  LEGACY_SALE_NOTE,
} from '../legacyPaymentDedup';

const legacySale = {
  notes: LEGACY_SALE_NOTE,
  service_id: 'svc-1',
  package_id: null,
  paid_at: '2026-02-18T12:00:00.000Z',
  sale_date: '2026-02-18',
  final_amount: 110,
};

describe('legacyPaymentDedup', () => {
  it('builds a stable key regardless of date/amount formatting', () => {
    expect(
      buildLegacyPaymentKey({ serviceId: 'svc-1', date: '2026-02-18T12:00:00.000Z', amount: 110 })
    ).toBe(buildLegacyPaymentKey({ serviceId: 'svc-1', date: '2026-02-18', amount: '110.00' }));
  });

  it('ignores zero/invalid payments', () => {
    expect(buildLegacyPaymentKey({ serviceId: 'svc-1', date: '2026-02-18', amount: 0 })).toBeNull();
    expect(buildLegacyPaymentKey({ serviceId: 'svc-1', date: null, amount: 110 })).toBeNull();
  });

  it('only indexes retroactive sales', () => {
    const keys = buildLegacySaleKeySet([
      legacySale,
      { ...legacySale, notes: 'Venda normal', service_id: 'svc-2' },
    ]);
    expect(keys.size).toBe(1);
  });

  it('hides the retroactive appointment when a matching retroactive sale exists', () => {
    const keys = buildLegacySaleKeySet([legacySale]);
    expect(
      hasMatchingLegacySale(keys, {
        serviceId: 'svc-1',
        packageId: undefined,
        date: '2026-02-18',
        amount: 110,
      })
    ).toBe(true);
  });

  it('keeps legacy appointments that have no matching sale (older records)', () => {
    const keys = buildLegacySaleKeySet([legacySale]);
    // different date
    expect(hasMatchingLegacySale(keys, { serviceId: 'svc-1', date: '2026-03-20', amount: 110 })).toBe(false);
    // different amount
    expect(hasMatchingLegacySale(keys, { serviceId: 'svc-1', date: '2026-02-18', amount: 90 })).toBe(false);
    // no retroactive sales at all
    expect(hasMatchingLegacySale(new Set(), { serviceId: 'svc-1', date: '2026-02-18', amount: 110 })).toBe(false);
  });

  it('matches package sales by package id', () => {
    const keys = buildLegacySaleKeySet([
      { ...legacySale, service_id: null, package_id: 'pkg-1', final_amount: 500 },
    ]);
    expect(hasMatchingLegacySale(keys, { packageId: 'pkg-1', date: '2026-02-18', amount: 500 })).toBe(true);
  });

  it('detects the retroactive appointment note prefix', () => {
    expect(isLegacyRetroactiveAppointment('[Histórico] Cadastro retroativo')).toBe(true);
    expect(isLegacyRetroactiveAppointment('Sessão 1 de 4')).toBe(false);
    expect(isLegacyRetroactiveAppointment(null)).toBe(false);
  });
});

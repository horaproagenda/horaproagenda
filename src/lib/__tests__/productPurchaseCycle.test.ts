import { describe, it, expect } from 'vitest';
import { resolvePurchaseCycleDates, validatePurchaseCycleDates } from '../productPurchaseCycle';

describe('productPurchaseCycle', () => {
  it('nunca preenche datas automaticamente', () => {
    expect(resolvePurchaseCycleDates({})).toEqual({ startedUsingAt: null, finishedAt: null });
    expect(resolvePurchaseCycleDates({ usageStartDate: '', usageEndDate: '' })).toEqual({
      startedUsingAt: null,
      finishedAt: null,
    });
  });

  it('grava exatamente as datas informadas manualmente', () => {
    expect(resolvePurchaseCycleDates({ usageStartDate: '2026-09-01', usageEndDate: '2026-09-20' })).toEqual({
      startedUsingAt: '2026-09-01',
      finishedAt: '2026-09-20',
    });
  });

  it('ignora término sem início', () => {
    expect(resolvePurchaseCycleDates({ usageEndDate: '2026-09-20' })).toEqual({
      startedUsingAt: null,
      finishedAt: null,
    });
  });

  it('valida coerência das datas', () => {
    expect(validatePurchaseCycleDates({})).toBeNull();
    expect(validatePurchaseCycleDates({ usageStartDate: '2026-09-01' })).toBeNull();
    expect(validatePurchaseCycleDates({ usageEndDate: '2026-09-01' })).toMatch(/início/i);
    expect(validatePurchaseCycleDates({ usageStartDate: '2026-09-10', usageEndDate: '2026-09-01' })).toMatch(/término/i);
  });
});

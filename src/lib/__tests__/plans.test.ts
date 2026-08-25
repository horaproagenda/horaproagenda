import { describe, it, expect } from 'vitest';
import {
  PLANS,
  ALLOWED_SEATS,
  BILLING_PERIODS,
  TRIAL_DAYS,
  GRACE_DAYS,
  suggestPlan,
  formatBRL,
  periodTotal,
  APP_MODULES,
} from '@/lib/plans';

describe('plans.ts — tabela oficial de pacotes', () => {
  it('exporta exatamente 8 pacotes com seats crescentes', () => {
    expect(PLANS.map(p => p.seats)).toEqual([1, 5, 8, 10, 15, 20, 25, 30]);
  });

  it('preços mensais correspondem à tabela oficial', () => {
    const expected: Record<number, number> = {
      1: 79.9, 5: 250, 8: 400, 10: 500, 15: 750, 20: 1000, 25: 1250, 30: 1500,
    };
    for (const p of PLANS) expect(p.priceBRL).toBeCloseTo(expected[p.seats], 2);
  });

  it('ALLOWED_SEATS espelha PLANS.seats', () => {
    expect(ALLOWED_SEATS).toEqual(PLANS.map(p => p.seats));
  });

  it('ciclos: mensal sem desconto, semestral −10%, anual −20%', () => {
    expect(BILLING_PERIODS.map(p => [p.months, p.discount])).toEqual([
      [1, 0],
      [6, 0.10],
      [12, 0.20],
    ]);
  });

  it('periodTotal: semestral = mensal × 6 × 0,90 · anual = mensal × 12 × 0,80', () => {
    expect(periodTotal(79.9, 1)).toBeCloseTo(79.9, 2);
    expect(periodTotal(250, 6)).toBeCloseTo(1350, 2);
    expect(periodTotal(500, 12)).toBeCloseTo(4800, 2);
    expect(periodTotal(1500, 6)).toBeCloseTo(8100, 2);
    expect(periodTotal(1500, 12)).toBeCloseTo(14400, 2);
    expect(periodTotal(79.9, 6)).toBeCloseTo(431.46, 2);
  });

  it('regras comerciais: 20 dias de teste e 2 dias de carência', () => {
    expect(TRIAL_DAYS).toBe(20);
    expect(GRACE_DAYS).toBe(2);
  });

  it('suggestPlan retorna o menor pacote que comporta os usuários', () => {
    expect(suggestPlan(1).seats).toBe(1);
    expect(suggestPlan(2).seats).toBe(5);
    expect(suggestPlan(6).seats).toBe(8);
    expect(suggestPlan(9).seats).toBe(10);
    expect(suggestPlan(11).seats).toBe(15);
    expect(suggestPlan(25).seats).toBe(25);
    expect(suggestPlan(100).seats).toBe(30); // cap no maior
  });

  it('formatBRL formata corretamente em pt-BR', () => {
    const s = formatBRL(1299);
    expect(s).toMatch(/R\$/);
    expect(s).toContain('1.299');
  });

  it('APP_MODULES contém os módulos esperados', () => {
    const keys = APP_MODULES.map(m => m.key);
    expect(keys).toContain('agenda');
    expect(keys).toContain('financeiro');
    expect(keys).toContain('configuracoes');
  });
});

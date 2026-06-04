import { describe, it, expect } from 'vitest';
import { PLANS, PRODUCT_TO_SEATS, suggestPlan, formatBRL, APP_MODULES } from '@/lib/plans';

describe('plans.ts', () => {
  it('exporta exatamente 8 planos com seats crescentes', () => {
    expect(PLANS).toHaveLength(8);
    const seats = PLANS.map(p => p.seats);
    const sorted = [...seats].sort((a, b) => a - b);
    expect(seats).toEqual(sorted);
  });

  it('todos os planos têm productId/priceId/preço válidos', () => {
    for (const p of PLANS) {
      expect(p.productId).toMatch(/^prod_/);
      expect(p.priceId).toMatch(/^price_/);
      expect(p.priceBRL).toBeGreaterThan(0);
      expect(p.seats).toBeGreaterThan(0);
    }
  });

  it('PRODUCT_TO_SEATS mapeia 1:1 com PLANS', () => {
    expect(Object.keys(PRODUCT_TO_SEATS)).toHaveLength(PLANS.length);
    for (const p of PLANS) {
      expect(PRODUCT_TO_SEATS[p.productId]).toBe(p.seats);
    }
  });

  it('suggestPlan retorna o menor plano que comporta os usuários', () => {
    expect(suggestPlan(1).seats).toBe(1);
    expect(suggestPlan(2).seats).toBe(3);
    expect(suggestPlan(4).seats).toBe(6);
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

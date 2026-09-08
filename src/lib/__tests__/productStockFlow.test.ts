import { describe, it, expect } from 'vitest';
import {
  resolveStockAfterPurchase,
  resolveCycleDeduction,
  resolveStockAfterCycle,
} from '../productStockFlow';

describe('resolveStockAfterPurchase', () => {
  it('soma a compra ao estoque remanescente', () => {
    expect(resolveStockAfterPurchase({ currentStock: 500, purchaseQuantity: 200 })).toBe(700);
  });

  it('funciona para o primeiro cadastro (estoque zero)', () => {
    expect(resolveStockAfterPurchase({ currentStock: 0, purchaseQuantity: 600 })).toBe(600);
  });

  it('ignora quantidades inválidas', () => {
    expect(resolveStockAfterPurchase({ currentStock: 100, purchaseQuantity: -5 })).toBe(100);
  });
});

describe('resolveCycleDeduction', () => {
  it('usa a quantidade parcial em uso quando informada', () => {
    expect(resolveCycleDeduction({ stockBefore: 600, cycleQuantity: 100 })).toBe(100);
  });

  it('nunca desconta mais do que o estoque disponível', () => {
    expect(resolveCycleDeduction({ stockBefore: 80, cycleQuantity: 100 })).toBe(80);
  });

  it('usa os vínculos quando não há quantidade parcial', () => {
    expect(
      resolveCycleDeduction({ stockBefore: 5000, estimatedDeduction: 500, exactDeduction: 20 }),
    ).toBe(520);
  });

  it('nunca consome o estoque inteiro por falta de informação', () => {
    expect(resolveCycleDeduction({ stockBefore: 600 })).toBe(0);
  });

  it('não desconta nada quando o produto tem vínculos sem uso no ciclo', () => {
    expect(resolveCycleDeduction({ stockBefore: 600 })).toBe(0);
  });
});


describe('resolveStockAfterCycle', () => {
  it('reduz o estoque total pela quantidade usada', () => {
    expect(resolveStockAfterCycle(600, 100)).toBe(500);
  });

  it('não gera estoque negativo', () => {
    expect(resolveStockAfterCycle(50, 100)).toBe(0);
  });
});

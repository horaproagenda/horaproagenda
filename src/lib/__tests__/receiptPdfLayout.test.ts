import { describe, expect, it } from 'vitest';
import { calculateReceiptSummaryLayout } from '../receiptPdfLayout';

describe('layout do resumo do recibo em PDF', () => {
  it('separa total final e valor pago quando há desconto', () => {
    const layout = calculateReceiptSummaryLayout({ tableFinalY: 100, hasDiscount: true });

    expect(layout.discountY).toBe(128);
    expect(layout.totalY).toBe(148);
    expect(layout.paidY - layout.totalY).toBe(10);
  });

  it('mantém o espaçamento sem desconto', () => {
    const layout = calculateReceiptSummaryLayout({ tableFinalY: 100, hasDiscount: false });

    expect(layout.discountY).toBeUndefined();
    expect(layout.totalY).toBe(140);
    expect(layout.paidY - layout.totalY).toBe(10);
  });

  it('move o bloco inteiro para uma nova página quando não houver espaço', () => {
    const layout = calculateReceiptSummaryLayout({ tableFinalY: 250, hasDiscount: true });

    expect(layout.startsOnNewPage).toBe(true);
    expect(layout.originalValueY).toBe(20);
    expect(layout.paidY).toBeLessThanOrEqual(282);
  });
});
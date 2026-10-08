import { describe, it, expect } from 'vitest';
import { computePageSlices, findSafeBreak } from '../pdfPageBreak';

describe('corte de folhas dos documentos', () => {
  it('não corta uma linha de texto ao meio: recua até o espaço entre linhas', () => {
    // Texto ocupa linhas 90-110; espaço em branco 80-89.
    const blank = (r: number) => r < 90 && r >= 80;
    expect(findSafeBreak(blank, 100, 70)).toBeLessThan(90);
    expect(findSafeBreak(blank, 100, 70)).toBeGreaterThanOrEqual(80);
  });
  it('sem espaço em branco, mantém o corte ideal', () => {
    expect(findSafeBreak(() => false, 100, 80)).toBe(100);
  });
  it('as fatias cobrem todo o documento sem sobrepor nem perder conteúdo', () => {
    const slices = computePageSlices(2500, 1000, r => r % 50 < 10);
    expect(slices.reduce((s, x) => s + x.height, 0)).toBe(2500);
    slices.forEach(s => expect(s.height).toBeLessThanOrEqual(1000));
  });
});

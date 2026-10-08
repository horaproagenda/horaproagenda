import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('estoque alterado por um único caminho', () => {
  it('venda de produto no caixa não desconta o estoque duas vezes', () => {
    expect(read('src/components/caixa/SaleForm.tsx')).not.toMatch(/current_stock:\s*Math\.max\(0,\s*product\.current_stock - item\.quantity/);
  });
  it('baixas por venda e consumo usam adjustProductStock (sem ler-e-regravar)', () => {
    for (const f of ['src/lib/saleStockDeduction.ts', 'src/hooks/useProductDailyConsumption.ts']) {
      const s = read(f);
      expect(s).toContain('adjustProductStock');
      expect(s).not.toMatch(/\.update\(\{\s*current_stock/);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('estoque alterado por um único caminho', () => {
  it('venda de produto no caixa não desconta o estoque duas vezes', () => {
    expect(read('src/components/caixa/SaleForm.tsx')).not.toMatch(/current_stock:\s*Math\.max\(0,\s*product\.current_stock - item\.quantity/);
  });
  it('baixas por venda e consumo usam caminhos atômicos (sem ler-e-regravar)', () => {
    expect(read('src/lib/saleStockDeduction.ts')).toContain('adjustProductStock');
    const c = read('src/hooks/useProductDailyConsumption.ts');
    expect(c).toContain("rpc('record_manual_product_consumption'");
    expect(c).not.toMatch(/\.update\(\{\s*current_stock/);
  });
});

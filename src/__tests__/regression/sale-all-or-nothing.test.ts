import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const s = readFileSync('src/components/caixa/SaleForm.tsx', 'utf8');
describe('venda do Caixa tudo ou nada', () => {
  it('desfaz vendas criadas quando algo falha', () => {
    expect(s).toMatch(/catch[\s\S]*purge_single_sale_cascade/);
  });
  it('estoque só baixa depois de tudo gravado', () => {
    expect(s).toContain('for (const s of pendingStock) await deductStockForSale(s)');
  });
  it('boleto usa a venda criada, não a última do cliente', () => {
    expect(s).not.toMatch(/order\('created_at', \{ ascending: false \}\)\s*\.limit\(1\)/);
  });
  it('venda nasce não concluída e só é marcada concluída no fim', () => {
    expect(s).toContain('sale_committed = false');
    expect(s).toMatch(/update\(\{ sale_committed: true \}\)\.in\('id', createdSaleIds\)/);
  });
  it('Caixa aciona a limpeza de vendas pela metade', () => {
    expect(readFileSync('src/pages/Caixa.tsx', 'utf8')).toContain("rpc('heal_uncommitted_sales')");
  });
});

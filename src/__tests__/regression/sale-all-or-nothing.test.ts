import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const s = readFileSync('src/components/caixa/SaleForm.tsx', 'utf8');
describe('venda do Caixa tudo ou nada', () => {
  it('venda inteira grava numa única transação do servidor, com identidade da requisição', () => {
    expect(s).toContain('submitMultiItemSale(');
    expect(readFileSync('src/lib/multiItemSale.ts', 'utf8')).toMatch(/rpc\('create_multi_item_sale_atomic'[\s\S]*_request_id/);
  });
  it('navegador não baixa estoque nem compensa vendas sozinho', () => {
    expect(s).not.toContain('deductStockForSale');
    expect(s).not.toContain('purge_single_sale_cascade');
  });
  it('boleto usa a venda criada, não a última do cliente', () => {
    expect(s).not.toMatch(/order\('created_at', \{ ascending: false \}\)\s*\.limit\(1\)/);
  });
  it('navegador não grava venda, lançamento ou caixa diretamente', () => {
    expect(s).not.toMatch(/from\('(single_sales|financial_entries|cash_transactions)'\)\.insert/);
  });
  it('Caixa aciona a limpeza de vendas pela metade', () => {
    expect(readFileSync('src/pages/Caixa.tsx', 'utf8')).toContain("rpc('heal_uncommitted_sales')");
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'supabase/migrations');
const latest = (needle: string) =>
  readdirSync(dir).sort().map((f) => readFileSync(join(dir, f), 'utf8')).filter((s) => s.includes(needle)).pop() ?? '';

describe('editar/excluir compra ajusta o estoque', () => {
  it('a edição soma a diferença ao estoque e não deixa negativo', () => {
    const sql = latest('FUNCTION public.update_product_purchase');
    expect(sql).toContain('v_delta := p_quantity - COALESCE(v_old.quantity,0)');
    expect(sql).toContain('current_stock = COALESCE(current_stock,0) + v_delta');
    expect(sql).toContain('+ v_delta < 0');
  });
  it('a exclusão tira as unidades e limpa Financeiro e Caixa', () => {
    const sql = latest('FUNCTION public.delete_product_purchase');
    expect(sql).toContain('COALESCE(current_stock,0) - COALESCE(v_old.quantity,0)');
    expect(sql).toContain("DELETE FROM public.cash_transactions WHERE reference_type='product_purchase'");
  });
  it('o app usa as rotinas únicas e não grava a compra direto', () => {
    const hook = readFileSync(join(process.cwd(), 'src/hooks/useProducts.ts'), 'utf8');
    expect(hook).toContain("rpc('update_product_purchase'");
    expect(hook).toContain("rpc('delete_product_purchase'");
    expect(hook).not.toMatch(/from\('product_purchases'\)\s*\.(update|delete)/);
  });
});

describe('edição de compra "já paga" não é bloqueada', () => {
  it('a rotina aceita e grava skip_cash_transaction e o app envia', () => {
    const sql = latest('FUNCTION public.update_product_purchase');
    expect(sql).toContain('p_skip_cash_transaction boolean');
    expect(sql).toContain('skip_cash_transaction = v_skip');
    const hook = readFileSync(join(process.cwd(), 'src/hooks/useProducts.ts'), 'utf8');
    expect(hook).toContain('p_skip_cash_transaction: (p as any).skip_cash_transaction');
  });
});

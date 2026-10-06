import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'supabase/migrations');
const latest = (needle: string) =>
  readdirSync(dir).sort().map((f) => readFileSync(join(dir, f), 'utf8')).filter((s) => s.includes(needle)).pop() ?? '';

describe('compra de produto já pago', () => {
  it('forma de pagamento só é exigida quando não é "já pago"', () => {
    const sql = latest('FUNCTION public.require_product_purchase_payment_method');
    expect(sql).toContain('NOT COALESCE(NEW.skip_cash_transaction, false)');
  });
  it('compra já paga não gera saída no caixa e a RPC não duplica a saída', () => {
    const sql = latest('FUNCTION public.sync_product_purchase_finance');
    expect(sql).toContain('IF COALESCE(v_purchase.skip_cash_transaction, false) THEN RETURN; END IF;');
    expect(sql).toContain('IF v_register IS NULL THEN RETURN; END IF;');
    const rpc = sql.slice(sql.indexOf('FUNCTION public.register_product_purchase'));
    expect(rpc).not.toContain('INSERT INTO public.cash_transactions');
  });
  it('formulário pede forma de pagamento quando não é já pago', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/Produtos.tsx'), 'utf8');
    expect(page).toContain('!purchaseForm.skip_cash_transaction && !purchaseForm.payment_method_id');
  });
});

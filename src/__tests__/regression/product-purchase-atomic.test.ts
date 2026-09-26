import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('compra de produto: transação única e formas de pagamento válidas', () => {
  it('a compra é registrada por uma única operação no banco', () => {
    const hook = read('src/hooks/useProducts.ts');
    expect(hook).toContain("supabase.rpc('register_product_purchase'");
    // Não deve voltar a gravar a compra em etapas separadas no aplicativo.
    expect(hook).not.toContain("from('product_purchases')\n        .insert");
  });

  it('o formulário não atualiza estoque em chamada separada', () => {
    const page = read('src/pages/Produtos.tsx');
    const submit = page.slice(page.indexOf('const handlePurchaseSubmit'), page.indexOf('const buildExportPayload'));
    expect(submit).toContain('createPurchase.mutateAsync');
    expect(submit).not.toContain('updateProduct.mutateAsync');
  });

  it('crédito ao cliente não aparece como forma de pagamento da compra', () => {
    const page = read('src/pages/Produtos.tsx');
    expect(page).toContain('purchasePaymentMethods');
    expect(page).toContain('!isClientCreditPaymentMethod(m.name)');
    expect(page).not.toContain('{activePaymentMethods.map(m => <SelectItem');
  });

  it('existe a rotina do banco que grava compra e estoque juntos', () => {
    const dir = join(root, 'supabase/migrations');
    const found = readdirSync(dir).some((f) => {
      const sql = readFileSync(join(dir, f), 'utf8');
      return sql.includes('FUNCTION public.register_product_purchase')
        && sql.includes('UPDATE public.products')
        && sql.includes('current_stock');
    });
    expect(found).toBe(true);
  });
});

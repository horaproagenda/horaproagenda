import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('Baixa de contas a pagar e venda do pacote', () => {
  it('contas a pagar usa a data preenchida (individual e em lote)', () => {
    const src = read('src/components/financeiro/ContasAPagar.tsx');
    expect(src).toContain('paid_date: paymentDate ||');
    expect(src).toContain('paid_date: batchPaymentDate ||');
    expect(src).not.toMatch(/paid_date: format\(new Date\(\), 'yyyy-MM-dd'\),/);
  });

  it('baixa de pacote sincroniza a venda original', () => {
    const src = read('supabase/functions/process-payment/index.ts');
    expect(src).toContain("rpc('sync_package_sale_from_appointments'");
    expect(src).toContain("rpc('heal_package_sales_payment')");
  });
});

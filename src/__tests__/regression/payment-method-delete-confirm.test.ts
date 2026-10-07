import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
const src = readFileSync('src/components/financeiro/FormasPagamento.tsx', 'utf8');
describe('Formas de pagamento: exclusão segura e lista sem corte no celular', () => {
  it('lixeira só abre confirmação, nunca exclui direto', () => {
    expect(src).not.toMatch(/onClick=\{\(\) => deletePaymentMethod\.mutate/);
    expect(src).not.toMatch(/onClick=\{\(\) => deleteCardBrand\.mutate/);
    expect(src).toContain('setPendingDelete({ kind: \'pm\'');
    expect(src).toContain('Excluir forma de pagamento?');
  });
  it('lista não tem altura fixa no celular', () => {
    expect(src).not.toContain('"max-h-[400px] overflow-y-auto');
    expect(src).toContain('pb-24 lg:pb-0 lg:max-h-[400px]');
  });
});

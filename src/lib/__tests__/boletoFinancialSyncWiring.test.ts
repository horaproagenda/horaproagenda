import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Regressão: a baixa de boleto precisa gerar/atualizar lançamento financeiro,
 * e relatórios/extrato precisam ser invalidados em tempo real.
 */
describe('boleto → financeiro/relatórios em tempo real', () => {
  it('baixa e criação de parcela espelham no financeiro', () => {
    const hook = read('src/hooks/useBoletoInstallments.ts');
    expect(hook).toContain("from '@/lib/boletoFinancialSync'");
    // markAsPaid (2 hooks), batch, create, update, cancel, delete
    expect(hook.match(/syncBoletoInstallmentsToFinancial\(/g)?.length ?? 0).toBeGreaterThanOrEqual(7);
    expect(hook).toContain('removeBoletoInstallmentFinancialEntry(id)');

    const dialog = read('src/components/financeiro/CreateBoletoParceladoDialog.tsx');
    expect(dialog).toContain('syncBoletoInstallmentsToFinancial(');
  });

  it('chaves de relatório e extrato são invalidadas pelo realtime', () => {
    const sync = read('src/hooks/useRealtimeSync.ts');
    for (const key of [
      'fin_dashboard',
      'package-sales-financial',
      'conciliacao-pagamentos',
      'atend_prof_data',
      'atend_prof_commission_payments',
    ]) {
      expect(sync).toContain(key);
    }

    const hook = read('src/hooks/useBoletoInstallments.ts');
    expect(hook).toContain('fin_dashboard');
    expect(hook).toContain('conciliacao-pagamentos');

    const extrato = read('src/components/financeiro/ExtratoFinanceiro.tsx');
    expect(extrato).toContain("table: 'boleto_installments'");

    const atend = read('src/components/relatorios/AtendimentosPorProfissional.tsx');
    expect(atend).toContain("table: 'boleto_installments'");
  });
});

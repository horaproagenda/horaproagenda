import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('movimentações de dinheiro usam o helper único', () => {
  it('devolução no histórico do cliente usa o caixa da venda, não qualquer caixa aberto', () => {
    const s = readFileSync('src/components/client-profile/ClientReportTab.tsx', 'utf8');
    expect(s).toContain('resolveRefundCashRegister');
    expect(s).not.toMatch(/from\('cash_registers'\)\s*\.select\('id'\)\s*\.eq\('status', 'open'\)/);
  });
  it('caixa, cancelamento de pacote e histórico gravam pelo helper', () => {
    for (const f of ['src/components/caixa/CashRegisterPanel.tsx', 'src/components/financeiro/CancelPackageDialog.tsx', 'src/components/client-profile/ClientReportTab.tsx']) {
      const s = readFileSync(f, 'utf8');
      expect(s).toContain('recordCashMovement(');
      expect(s).not.toContain("from('cash_transactions').insert(");
    }
  });
});

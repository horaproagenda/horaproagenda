import { describe, it, expect } from 'vitest';
import { keysForDomains, ACTION_DOMAINS } from '@/lib/domainSync';

describe('Sincronização unificada entre telas', () => {
  it('baixa de pagamento atualiza agenda, perfil, caixa e financeiro', () => {
    const keys = keysForDomains(ACTION_DOMAINS.payment);
    for (const k of ['appointments', 'client-appointments', 'client', 'cash_transactions', 'financial_entries']) {
      expect(keys).toContain(k);
    }
  });
  it('venda atualiza produtos, caixa e financeiro', () => {
    const keys = keysForDomains(ACTION_DOMAINS.sale);
    for (const k of ['products', 'cash_transactions', 'financial_entries', 'single_sales']) expect(keys).toContain(k);
  });
  it('lançamento financeiro atualiza o caixa', () => {
    expect(keysForDomains(ACTION_DOMAINS.financialEntry)).toContain('cash_transactions');
  });
});

describe('telas de venda usam o mapa único de atualização', () => {
  it('Caixa, perfil do cliente e pacotes chamam syncAfter("sale")', async () => {
    const { readFileSync } = await import('fs');
    for (const f of ['src/components/caixa/SaleForm.tsx', 'src/components/client-profile/ClientReportTab.tsx', 'src/components/financeiro/PacotesFinanceiro.tsx']) {
      expect(readFileSync(f, 'utf8')).toContain("syncAfter(queryClient, 'sale')");
    }
  });
  it('venda atualiza lembretes, sessões pendentes e créditos', () => {
    const keys = keysForDomains(ACTION_DOMAINS.sale);
    for (const k of ['reminders', 'client-pending-package-sessions', 'client_credit_transactions', 'package-sales-financial', 'products']) expect(keys).toContain(k);
  });
});

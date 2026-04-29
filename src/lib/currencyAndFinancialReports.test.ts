import { describe, expect, it } from 'vitest';
import { formatCurrency, parseBrazilianCurrencyToCents } from './utils';
import { calculateConsolidatedReportTotals, calculateOpenCashRegistersBalance } from './financialReports';

describe('BRL currency normalization and financial balances', () => {
  it('converte máscara BRL 1.234,56 para centavos antes de salvar', () => {
    expect(parseBrazilianCurrencyToCents('1.234,56')).toBe(123456);
    expect(parseBrazilianCurrencyToCents('R$ 9.876,54')).toBe(987654);
    expect(parseBrazilianCurrencyToCents('0,01')).toBe(1);
  });

  it('mantém formatação brasileira nos relatórios', () => {
    expect(formatCurrency(1234.56)).toBe('R$ 1.234,56');
    expect(formatCurrency(-98.7)).toBe('R$ -98,70');
  });

  it('calcula saldos consolidados entre financeiro e caixa sem alterar pagamentos não monetários', () => {
    const totals = calculateConsolidatedReportTotals([
      { type: 'income', amount: 1200.5 },
      { type: 'income', amount: 34.06 },
      { type: 'expense', amount: 200.56 },
      { type: 'non_cash', amount: 999.99 },
    ]);

    expect(totals.totalIncome).toBeCloseTo(1234.56);
    expect(totals.totalExpense).toBeCloseTo(200.56);
    expect(totals.balance).toBeCloseTo(1034);
  });

  it('calcula saldo dos caixas abertos com saldo inicial e recebido', () => {
    expect(calculateOpenCashRegistersBalance([
      { status: 'open', opening_balance: '100.25', total_received: '250.75' },
      { status: 'closed', opening_balance: '999', total_received: '999' },
      { status: 'open', opening_balance: 10, total_received: 5.5 },
    ])).toBeCloseTo(366.5);
  });
});
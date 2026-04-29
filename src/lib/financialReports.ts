export type ConsolidatedEntryType = 'income' | 'expense' | 'non_cash';

export interface ConsolidatedReportEntry {
  type: ConsolidatedEntryType;
  amount: number;
}

export interface CashRegisterBalanceInput {
  status: string;
  opening_balance?: number | string | null;
  total_received?: number | string | null;
}

export function calculateConsolidatedReportTotals(entries: ConsolidatedReportEntry[]) {
  const totalIncome = entries
    .filter((entry) => entry.type === 'income')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const totalExpense = entries
    .filter((entry) => entry.type === 'expense')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
  };
}

export function calculateOpenCashRegistersBalance(cashRegisters: CashRegisterBalanceInput[]) {
  return cashRegisters
    .filter((cashRegister) => cashRegister.status === 'open')
    .reduce(
      (sum, cashRegister) => sum + Number(cashRegister.opening_balance || 0) + Number(cashRegister.total_received || 0),
      0,
    );
}
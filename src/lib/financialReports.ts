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

export function getDateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return dateOnly[1];

  const isoDate = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoDate) return isoDate[1];

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isDateOnlyWithinRange(value: string | Date | null | undefined, start: Date, end: Date) {
  const valueDay = getDateOnly(value);
  const startDay = getDateOnly(start);
  const endDay = getDateOnly(end);
  if (!valueDay || !startDay || !endDay) return false;
  return valueDay >= startDay && valueDay <= endDay;
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
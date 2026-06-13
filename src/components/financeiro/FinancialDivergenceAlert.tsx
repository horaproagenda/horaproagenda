import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useCashTransactions } from '@/hooks/useCashTransactions';
import { checkFinancialDivergence } from '@/lib/recurringEntryCalculation';

/**
 * Divergence detection — only flags REAL inconsistencies, not legitimate
 * financial-only items (refunds, boletos, backfills, discounts, etc.).
 *
 * Strategy: cash_transactions is the canonical source for sales/payments.
 * A financial_entry is considered a mirror of a cash transaction when:
 *  - description starts with "Caixa:" (auto-mirror), OR
 *  - shares appointment_id with a cash transaction (reference_type='appointment'), OR
 *  - matches a cash transaction by date + amount + payment method.
 *
 * Only the SUM of mirrors is compared to the SUM of cash transactions of the
 * same type. If those don't match, there's a real cascade/sync bug.
 */
export function FinancialDivergenceAlert() {
  const { entries } = useFinancialEntries();
  const { transactions } = useCashTransactions();

  const divergences = useMemo(() => {
    const makeKey = (date: string, amount: number, method: string | null | undefined) => {
      const day = (date || '').slice(0, 10);
      const amt = Math.round(Number(amount || 0) * 100);
      const m = (method || '').toLowerCase().trim();
      return `${day}|${amt}|${m}`;
    };

    // Index cash transactions by type
    const incomeKeys = new Set<string>();
    const incomeAptIds = new Set<string>();
    const incomeSaleIds = new Set<string>();
    let cashIncomeTotal = 0;

    const expenseKeys = new Set<string>();
    const expenseAptIds = new Set<string>();
    const expenseSaleIds = new Set<string>();
    let cashExpenseTotal = 0;

    transactions.forEach((tx: any) => {
      const key = makeKey(tx.created_at, Number(tx.amount), tx.payment_method_name);
      if (tx.type === 'income') {
        cashIncomeTotal += Number(tx.amount);
        incomeKeys.add(key);
        if (tx.reference_type === 'appointment' && tx.reference_id) incomeAptIds.add(tx.reference_id);
        if ((tx.reference_type === 'single_sale' || tx.reference_type === 'sale') && tx.reference_id) {
          incomeSaleIds.add(tx.reference_id);
        }
      } else if (tx.type === 'expense') {
        cashExpenseTotal += Number(tx.amount);
        expenseKeys.add(key);
        if (tx.reference_type === 'appointment' && tx.reference_id) expenseAptIds.add(tx.reference_id);
        if ((tx.reference_type === 'single_sale' || tx.reference_type === 'sale') && tx.reference_id) {
          expenseSaleIds.add(tx.reference_id);
        }
      }
    });

    const isMirror = (
      entry: any,
      keys: Set<string>,
      aptIds: Set<string>,
      saleIds: Set<string>
    ) => {
      const desc = entry.description || '';
      const lowerDesc = desc.toLowerCase();
      if (lowerDesc.startsWith('caixa:')) return true;
      if (entry.appointment_id && aptIds.has(entry.appointment_id)) return true;
      const saleIdMatch = desc.match(/\[sale:([a-f0-9-]+)\]/i);
      if (saleIdMatch && saleIds.has(saleIdMatch[1])) return true;
      const method = entry.payment_method?.name || '';
      const key = makeKey(entry.paid_date || entry.due_date, Number(entry.amount), method);
      return keys.has(key);
    };

    // Sum mirrored financial entries — these MUST match the cash totals.
    let mirroredReceivables = 0;
    let mirroredPayables = 0;
    entries.forEach((e: any) => {
      if (e.status !== 'paid') return;
      if (e.type === 'receivable' && isMirror(e, incomeKeys, incomeAptIds, incomeSaleIds)) {
        mirroredReceivables += Number(e.amount);
      } else if (e.type === 'payable' && isMirror(e, expenseKeys, expenseAptIds, expenseSaleIds)) {
        mirroredPayables += Number(e.amount);
      }
    });

    const results = [];
    // Only report if there ARE mirrors expected on both sides — avoids
    // false positives when one side is legitimately empty.
    if (cashIncomeTotal > 0 || mirroredReceivables > 0) {
      results.push(
        checkFinancialDivergence({
          financialTotal: mirroredReceivables,
          cashTotal: cashIncomeTotal,
          label: 'Receitas espelhadas (Caixa ↔ Financeiro)',
        })
      );
    }
    if (cashExpenseTotal > 0 || mirroredPayables > 0) {
      results.push(
        checkFinancialDivergence({
          financialTotal: mirroredPayables,
          cashTotal: cashExpenseTotal,
          label: 'Despesas espelhadas (Caixa ↔ Financeiro)',
        })
      );
    }

    return results.filter(r => r.hasDivergence);
  }, [entries, transactions]);

  if (divergences.length === 0) return null;

  return (
    <Alert variant="destructive" className="border-orange-500 bg-orange-50 dark:bg-orange-950/30">
      <AlertCircle className="h-4 w-4 text-orange-600" />
      <AlertTitle className="text-orange-700 dark:text-orange-400 text-sm">
        Divergência detectada entre Financeiro e Caixa
      </AlertTitle>
      <AlertDescription className="text-orange-600 dark:text-orange-300">
        <ul className="list-disc pl-4 mt-1 space-y-1 text-xs">
          {divergences.map((d, i) => (
            <li key={i}>{d.message}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

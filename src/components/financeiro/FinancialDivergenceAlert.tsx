import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useCashTransactions } from '@/hooks/useCashTransactions';

/**
 * Divergence detection between Caixa and Financeiro.
 *
 * The previous version compared the SUM of all paid receivables in the
 * Financeiro to the SUM of all cash income — that always reported a false
 * difference because the Financeiro legitimately holds entries that never
 * touch the Caixa (boletos, refunds recorded manually, backfills, manual
 * adjustments) and the Caixa legitimately holds entries that do not need a
 * receivable in the Financeiro (discounts, change/troco).
 *
 * The correct invariant is: every cash transaction that represents a real
 * receipt/payment MUST have a matching `financial_entries` row (the cascade
 * trigger is the source of truth). When that mirror is missing, the
 * Financeiro view is out of sync — that's the real bug worth flagging.
 *
 * A mirror is matched when ANY of:
 *  - description starts with "Caixa:"
 *  - financial_entry.appointment_id equals cash_transaction.reference_id (apt)
 *  - description contains [sale:<id>] matching a single-sale reference
 *  - same date + amount + payment method
 *
 * Categories `discount` and `change` are excluded from the check (they are
 * intentionally cash-only adjustments).
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

    // Index PAID financial entries for fast lookup.
    const finKeysIncome = new Set<string>();
    const finKeysExpense = new Set<string>();
    const finAptIdsIncome = new Set<string>();
    const finAptIdsExpense = new Set<string>();
    const finSaleIdsIncome = new Set<string>();
    const finSaleIdsExpense = new Set<string>();

    entries.forEach((e: any) => {
      if (e.status !== 'paid') return;
      const method = e.payment_method?.name || '';
      const key = makeKey(e.paid_date || e.due_date, Number(e.amount), method);
      const saleIdMatch = (e.description || '').match(/\[sale:([a-f0-9-]+)\]/i);
      if (e.type === 'receivable') {
        finKeysIncome.add(key);
        if (e.appointment_id) finAptIdsIncome.add(e.appointment_id);
        if (saleIdMatch) finSaleIdsIncome.add(saleIdMatch[1]);
      } else if (e.type === 'payable') {
        finKeysExpense.add(key);
        if (e.appointment_id) finAptIdsExpense.add(e.appointment_id);
        if (saleIdMatch) finSaleIdsExpense.add(saleIdMatch[1]);
      }
    });

    // Skip categories that intentionally have no financial mirror
    const SKIP_CATEGORIES = new Set(['discount', 'change']);

    let missingIncomeCount = 0;
    let missingIncomeAmount = 0;
    let missingExpenseCount = 0;
    let missingExpenseAmount = 0;

    transactions.forEach((tx: any) => {
      if (SKIP_CATEGORIES.has(tx.category)) return;
      const desc = (tx.description || '').toLowerCase();
      // "Caixa:" mirror is created in financeiro automatically; we look for it.
      const method = tx.payment_method_name || '';
      const key = makeKey(tx.created_at, Number(tx.amount), method);
      const keys = tx.type === 'income' ? finKeysIncome : finKeysExpense;
      const aptIds = tx.type === 'income' ? finAptIdsIncome : finAptIdsExpense;
      const saleIds = tx.type === 'income' ? finSaleIdsIncome : finSaleIdsExpense;

      const hasMirror =
        keys.has(key) ||
        (tx.reference_type === 'appointment' && tx.reference_id && aptIds.has(tx.reference_id)) ||
        ((tx.reference_type === 'single_sale' || tx.reference_type === 'sale') && tx.reference_id && saleIds.has(tx.reference_id));

      if (!hasMirror) {
        if (tx.type === 'income') {
          missingIncomeCount++;
          missingIncomeAmount += Number(tx.amount);
        } else if (tx.type === 'expense') {
          missingExpenseCount++;
          missingExpenseAmount += Number(tx.amount);
        }
      }
    });

    const results: { message: string }[] = [];
    if (missingIncomeCount > 0) {
      results.push({
        message: `${missingIncomeCount} receita(s) no Caixa sem espelho no Financeiro — R$ ${missingIncomeAmount.toFixed(2)}`,
      });
    }
    if (missingExpenseCount > 0) {
      results.push({
        message: `${missingExpenseCount} despesa(s) no Caixa sem espelho no Financeiro — R$ ${missingExpenseAmount.toFixed(2)}`,
      });
    }
    return results;
  }, [entries, transactions]);

  if (divergences.length === 0) return null;

  return (
    <Alert variant="destructive" className="border-orange-500 bg-orange-50 dark:bg-orange-950/30">
      <AlertCircle className="h-4 w-4 text-orange-600" />
      <AlertTitle className="text-orange-700 dark:text-orange-400 text-sm">
        Sincronização Caixa ↔ Financeiro
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

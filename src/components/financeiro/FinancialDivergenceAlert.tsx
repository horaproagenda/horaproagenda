import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useCashTransactions } from '@/hooks/useCashTransactions';
import { checkFinancialDivergence } from '@/lib/recurringEntryCalculation';

export function FinancialDivergenceAlert() {
  const { entries } = useFinancialEntries();
  const { transactions } = useCashTransactions();

  const divergences = useMemo(() => {
    // Sum paid receivables from financial_entries
    const paidReceivables = entries
      .filter(e => e.type === 'receivable' && e.status === 'paid')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    // Sum income from cash_transactions
    const cashIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Sum paid payables from financial_entries
    const paidPayables = entries
      .filter(e => e.type === 'payable' && e.status === 'paid')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    // Sum expense from cash_transactions
    const cashExpense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Check net values: cash transactions with fees
    const cashNetTotal = transactions
      .filter(t => t.type === 'income' && t.net_amount !== undefined)
      .reduce((sum, t) => sum + (t.net_amount ?? t.amount), 0);

    const cashGrossTotal = transactions
      .filter(t => t.type === 'income' && t.net_amount !== undefined)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const results = [
      checkFinancialDivergence({
        financialTotal: paidReceivables,
        cashTotal: cashIncome,
        label: 'Receitas pagas',
      }),
      checkFinancialDivergence({
        financialTotal: paidPayables,
        cashTotal: cashExpense,
        label: 'Despesas pagas',
      }),
    ];

    // Only check net divergence if there are transactions with fees
    if (cashGrossTotal > 0 && cashNetTotal > 0 && cashGrossTotal !== cashNetTotal) {
      results.push(
        checkFinancialDivergence({
          financialTotal: cashGrossTotal,
          cashTotal: cashNetTotal,
          label: 'Valor bruto vs líquido no caixa',
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

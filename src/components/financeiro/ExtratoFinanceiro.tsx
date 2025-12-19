import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useBanks } from '@/hooks/useBanks';

export function ExtratoFinanceiro() {
  const { entries } = useFinancialEntries();
  const { banks } = useBanks();

  // Calculate running balance per bank
  const entriesWithBalance = useMemo(() => {
    // Group entries by bank
    const bankBalances: Record<string, number> = {};
    
    // Sort entries by date
    const sortedEntries = [...entries].sort((a, b) => 
      new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    );

    return sortedEntries.map((entry) => {
      const bankId = entry.bank_id || 'sem_banco';
      if (!(bankId in bankBalances)) {
        bankBalances[bankId] = 0;
      }

      if (entry.status === 'paid') {
        if (entry.type === 'receivable') {
          bankBalances[bankId] += Number(entry.amount);
        } else {
          bankBalances[bankId] -= Number(entry.amount);
        }
      }

      return {
        ...entry,
        runningBalance: bankBalances[bankId],
      };
    }).reverse(); // Most recent first
  }, [entries]);

  const getBankName = (bankId: string | null) => {
    if (!bankId) return 'Sem banco';
    const bank = banks.find(b => b.id === bankId);
    return bank?.name || 'Sem banco';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extrato</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Forma de Pagamento</TableHead>
              <TableHead>Parcela</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entriesWithBalance.slice(0, 50).map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{format(parseISO(entry.due_date), 'dd/MM/yyyy')}</TableCell>
                <TableCell className="flex items-center gap-2">
                  {entry.type === 'receivable' ? (
                    <ArrowUpCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <ArrowDownCircle className="h-4 w-4 text-red-500" />
                  )}
                  {entry.description}
                </TableCell>
                <TableCell>{entry.payment_method?.name || '-'}</TableCell>
                <TableCell>{entry.installments || 1}x</TableCell>
                <TableCell className={entry.type === 'receivable' ? 'text-green-600' : 'text-red-600'}>
                  {entry.type === 'receivable' ? '+' : '-'} R$ {Number(entry.amount).toFixed(2)}
                </TableCell>
                <TableCell className={entry.runningBalance >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  R$ {entry.runningBalance.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
            {entriesWithBalance.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum lançamento encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

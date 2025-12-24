import { useMemo, useState } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowUpCircle, ArrowDownCircle, Trash2, Filter } from 'lucide-react';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useBanks } from '@/hooks/useBanks';

export function ExtratoFinanceiro() {
  const { entries, deleteEntry } = useFinancialEntries();
  const { banks } = useBanks();
  const [dateFilterType, setDateFilterType] = useState<'all' | 'today' | 'month'>('month');
  const [typeFilter, setTypeFilter] = useState<'all' | 'receivable' | 'payable'>('payable');

  // Filter entries
  const filteredEntries = useMemo(() => {
    const today = new Date();
    
    return entries.filter((entry) => {
      // Type filter
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
      
      // Date filter
      if (dateFilterType === 'today') {
        const dueDate = parseISO(entry.due_date);
        return isWithinInterval(dueDate, { start: startOfDay(today), end: endOfDay(today) });
      } else if (dateFilterType === 'month') {
        const dueDate = parseISO(entry.due_date);
        return isWithinInterval(dueDate, { start: startOfMonth(today), end: endOfMonth(today) });
      }
      return true;
    });
  }, [entries, dateFilterType, typeFilter]);

  // Calculate running balance per bank
  const entriesWithBalance = useMemo(() => {
    const bankBalances: Record<string, number> = {};
    
    const sortedEntries = [...filteredEntries].sort((a, b) => 
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
    }).reverse();
  }, [filteredEntries]);

  const getBankName = (bankId: string | null) => {
    if (!bankId) return 'Sem banco';
    const bank = banks.find(b => b.id === bankId);
    return bank?.name || 'Sem banco';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
        <CardTitle>Extrato</CardTitle>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={dateFilterType} onValueChange={(v: 'all' | 'today' | 'month') => setDateFilterType(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as datas</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v: 'all' | 'receivable' | 'payable') => setTypeFilter(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="receivable">A Receber</SelectItem>
              <SelectItem value="payable">A Pagar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <div className="min-w-[900px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Forma de Pagamento</TableHead>
                <TableHead>Parcela</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entriesWithBalance.map((entry) => (
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
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => deleteEntry.mutate(entry.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {entriesWithBalance.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhum lançamento encontrado para o período selecionado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useCashTransactions } from '@/hooks/useCashTransactions';
import { useCashRegisters } from '@/hooks/useCashRegisters';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowUpCircle, ArrowDownCircle, Wallet, TrendingUp, Calendar, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ConsolidatedEntry {
  id: string;
  date: string;
  description: string;
  type: 'income' | 'expense';
  amount: number;
  source: 'caixa' | 'financeiro';
  status: string;
}

export function RelatorioConsolidado() {
  const { entries } = useFinancialEntries();
  const { transactions } = useCashTransactions();
  const { cashRegisters } = useCashRegisters();
  const [dateFilter, setDateFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  // Combine and normalize data from both sources
  const consolidatedData: ConsolidatedEntry[] = [
    // From financial entries
    ...entries.map((entry) => ({
      id: `fin-${entry.id}`,
      date: entry.paid_date || entry.due_date,
      description: entry.description,
      type: entry.type === 'receivable' ? 'income' : 'expense' as 'income' | 'expense',
      amount: Number(entry.amount),
      source: 'financeiro' as const,
      status: entry.status,
    })),
    // From cash transactions
    ...transactions.map((tx) => ({
      id: `cash-${tx.id}`,
      date: tx.created_at.split('T')[0],
      description: tx.description || tx.category,
      type: tx.type as 'income' | 'expense',
      amount: Number(tx.amount),
      source: 'caixa' as const,
      status: 'paid',
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Apply filters
  const filteredData = consolidatedData.filter((entry) => {
    if (dateFilter && !entry.date.includes(dateFilter)) return false;
    if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;
    return true;
  });

  // Calculate totals
  const totalIncome = filteredData
    .filter((e) => e.type === 'income')
    .reduce((sum, e) => sum + e.amount, 0);
  const totalExpense = filteredData
    .filter((e) => e.type === 'expense')
    .reduce((sum, e) => sum + e.amount, 0);
  const balance = totalIncome - totalExpense;

  // Cash register summary
  const openCashRegisters = cashRegisters.filter((cr) => cr.status === 'open');
  const totalCashBalance = openCashRegisters.reduce(
    (sum, cr) => sum + Number(cr.opening_balance || 0) + Number(cr.total_received || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Entradas</p>
                <p className="text-2xl font-bold text-green-600">
                  R$ {totalIncome.toFixed(2)}
                </p>
              </div>
              <ArrowUpCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Saídas</p>
                <p className="text-2xl font-bold text-red-600">
                  R$ {totalExpense.toFixed(2)}
                </p>
              </div>
              <ArrowDownCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className={cn(
          "border",
          balance >= 0 
            ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" 
            : "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
        )}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saldo Período</p>
                <p className={cn(
                  "text-2xl font-bold",
                  balance >= 0 ? "text-blue-600" : "text-orange-600"
                )}>
                  R$ {balance.toFixed(2)}
                </p>
              </div>
              <TrendingUp className={cn(
                "h-8 w-8",
                balance >= 0 ? "text-blue-500" : "text-orange-500"
              )} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Caixas Abertos</p>
                <p className="text-2xl font-bold text-purple-600">
                  {openCashRegisters.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  R$ {totalCashBalance.toFixed(2)}
                </p>
              </div>
              <Wallet className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm text-muted-foreground mb-1 block">Data</label>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm text-muted-foreground mb-1 block">Origem</label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder="Todas as origens" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  <SelectItem value="caixa">Caixa</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consolidated Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Movimentações Consolidadas ({filteredData.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhuma movimentação encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.slice(0, 50).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {format(new Date(entry.date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate">
                        {entry.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.source === 'caixa' ? 'secondary' : 'outline'}>
                          {entry.source === 'caixa' ? 'Caixa' : 'Financeiro'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline"
                          className={cn(
                            entry.type === 'income' 
                              ? 'text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30' 
                              : 'text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30'
                          )}
                        >
                          {entry.type === 'income' ? 'Entrada' : 'Saída'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline"
                          className={cn(
                            entry.status === 'paid' 
                              ? 'text-green-600 border-green-300' 
                              : entry.status === 'pending'
                              ? 'text-yellow-600 border-yellow-300'
                              : 'text-gray-600 border-gray-300'
                          )}
                        >
                          {entry.status === 'paid' ? 'Pago' : 
                           entry.status === 'pending' ? 'Pendente' : 
                           entry.status === 'overdue' ? 'Vencido' : 
                           entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-medium",
                        entry.type === 'income' ? 'text-green-600' : 'text-red-600'
                      )}>
                        {entry.type === 'income' ? '+' : '-'} R$ {entry.amount.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredData.length > 50 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Mostrando 50 de {filteredData.length} registros
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

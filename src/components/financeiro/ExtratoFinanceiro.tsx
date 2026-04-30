import { useMemo, useState, useEffect } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
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
import { ArrowUpCircle, ArrowDownCircle, Filter, Search, Lock } from 'lucide-react';
import { useFinancialEntries, FinancialEntry } from '@/hooks/useFinancialEntries';
import { useCashTransactions, CashTransaction } from '@/hooks/useCashTransactions';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface UnifiedEntry {
  id: string;
  date: string;
  description: string;
  category: string;
  type: 'income' | 'expense';
  grossAmount: number;
  discount: number;
  cardFee: number;
  netAmount: number;
  paymentMethod: string;
  status: string;
  source: 'financial' | 'cash' | 'commission' | 'product';
  runningBalance?: number;
}

export function ExtratoFinanceiro() {
  const { entries } = useFinancialEntries();
  const { transactions } = useCashTransactions();
  const queryClient = useQueryClient();
  const [dateFilterType, setDateFilterType] = useState<'all' | 'today' | 'month'>('month');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'financial' | 'cash' | 'commission' | 'product'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Real-time sync for extrato - listen to all relevant tables
  useEffect(() => {
    const channel = supabase
      .channel('extrato-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_entries' }, () => {
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_transactions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'single_sales' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register_entries' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments_audit' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_purchases' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Unify all entries from different sources
  const unifiedEntries = useMemo(() => {
    const unified: UnifiedEntry[] = [];

    // 1. Financial entries (contas a pagar, recebíveis, comissões)
    entries.forEach((entry: FinancialEntry) => {
      const isIncome = entry.type === 'receivable';
      const grossAmount = Number(entry.amount);
      const isCommission = (entry.description || '').toLowerCase().includes('comiss');
      
      unified.push({
        id: `fin-${entry.id}`,
        date: entry.paid_date || entry.due_date,
        description: entry.description,
        category: entry.category?.name || (isCommission ? 'Comissão' : '-'),
        type: isIncome ? 'income' : 'expense',
        grossAmount,
        discount: 0,
        cardFee: 0,
        netAmount: grossAmount,
        paymentMethod: entry.payment_method?.name || '-',
        status: entry.status,
        source: isCommission ? 'commission' : 'financial',
      });
    });

    // 2. Cash transactions (vendas, pagamentos de clientes)
    transactions.forEach((tx: CashTransaction) => {
      const isIncome = tx.type === 'income';
      const grossAmount = Number(tx.amount);
      const cardFee = Number(tx.card_fee_amount || 0);
      const discount = Number(tx.discount_amount || 0);
      const netAmount = grossAmount - cardFee;
      const isProduct = (tx.description || '').toLowerCase().includes('produto') || 
                        tx.category === 'product_sale' || tx.category === 'product_purchase';

      // Avoid duplicating entries already in financial_entries
      const alreadyInFinancial = entries.some(e => 
        e.description === tx.description && 
        Math.abs(Number(e.amount) - grossAmount) < 0.01
      );
      if (alreadyInFinancial) return;

      unified.push({
        id: `cash-${tx.id}`,
        date: tx.created_at,
        description: tx.description || tx.category,
        category: isProduct ? 'Produto' : (tx.category || '-'),
        type: isIncome ? 'income' : 'expense',
        grossAmount,
        discount,
        cardFee,
        netAmount,
        paymentMethod: tx.payment_method_name || '-',
        status: 'paid',
        source: isProduct ? 'product' : 'cash',
      });
    });

    // Sort by date descending
    unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return unified;
  }, [entries, transactions]);

  // Apply filters
  const filteredEntries = useMemo(() => {
    const today = new Date();
    const search = searchTerm.toLowerCase().trim();

    return unifiedEntries.filter((entry) => {
      // Type filter
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
      
      // Source filter  
      if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;

      // Search filter
      if (search && !entry.description.toLowerCase().includes(search) && 
          !entry.category.toLowerCase().includes(search) &&
          !entry.paymentMethod.toLowerCase().includes(search)) return false;

      // Date filter
      if (dateFilterType === 'today') {
        const entryDate = parseISO(entry.date);
        return isWithinInterval(entryDate, { start: startOfDay(today), end: endOfDay(today) });
      } else if (dateFilterType === 'month') {
        const entryDate = parseISO(entry.date);
        return isWithinInterval(entryDate, { start: startOfMonth(today), end: endOfMonth(today) });
      }
      return true;
    });
  }, [unifiedEntries, dateFilterType, typeFilter, sourceFilter, searchTerm]);

  // Calculate running balance
  const entriesWithBalance = useMemo(() => {
    // Sort oldest first for balance calculation
    const sorted = [...filteredEntries].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let balance = 0;
    const withBalance = sorted.map((entry) => {
      if (entry.status === 'paid') {
        if (entry.type === 'income') {
          balance += entry.netAmount;
        } else {
          balance -= entry.netAmount;
        }
      }
      return { ...entry, runningBalance: balance };
    });

    // Return newest first
    return withBalance.reverse();
  }, [filteredEntries]);

  // Summary totals
  const totals = useMemo(() => {
    const paid = entriesWithBalance.filter(e => e.status === 'paid');
    const totalIncome = paid.filter(e => e.type === 'income').reduce((s, e) => s + e.netAmount, 0);
    const totalExpense = paid.filter(e => e.type === 'expense').reduce((s, e) => s + e.netAmount, 0);
    const totalFees = paid.reduce((s, e) => s + e.cardFee, 0);
    const totalDiscounts = paid.reduce((s, e) => s + e.discount, 0);
    return { totalIncome, totalExpense, totalFees, totalDiscounts, balance: totalIncome - totalExpense };
  }, [entriesWithBalance]);

  const sourceLabel = (source: string) => {
    switch (source) {
      case 'financial': return 'Financeiro';
      case 'cash': return 'Caixa';
      case 'commission': return 'Comissão';
      case 'product': return 'Produto';
      default: return source;
    }
  };

  const sourceColor = (source: string) => {
    switch (source) {
      case 'financial': return 'bg-blue-100 text-blue-700';
      case 'cash': return 'bg-green-100 text-green-700';
      case 'commission': return 'bg-purple-100 text-purple-700';
      case 'product': return 'bg-orange-100 text-orange-700';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Extrato</CardTitle>
            <Badge variant="outline" className="text-[10px] gap-1">
              <Lock className="h-3 w-3" /> Somente leitura
            </Badge>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <div className="relative flex-1 min-w-[150px] max-w-[250px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
          </div>
          <Select value={dateFilterType} onValueChange={(v: 'all' | 'today' | 'month') => setDateFilterType(v)}>
            <SelectTrigger className="w-[110px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas datas</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v: 'all' | 'income' | 'expense') => setTypeFilter(v)}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="income">Entradas</SelectItem>
              <SelectItem value="expense">Saídas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={(v: any) => setSourceFilter(v)}>
            <SelectTrigger className="w-[110px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas fontes</SelectItem>
              <SelectItem value="cash">Caixa</SelectItem>
              <SelectItem value="financial">Financeiro</SelectItem>
              <SelectItem value="commission">Comissão</SelectItem>
              <SelectItem value="product">Produto</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
          <div className="bg-green-50 dark:bg-green-950/30 rounded-md p-2 text-center">
            <p className="text-[10px] text-muted-foreground">Entradas</p>
            <p className="text-xs font-bold text-green-600">R$ {totals.totalIncome.toFixed(2)}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-950/30 rounded-md p-2 text-center">
            <p className="text-[10px] text-muted-foreground">Saídas</p>
            <p className="text-xs font-bold text-red-600">R$ {totals.totalExpense.toFixed(2)}</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-md p-2 text-center">
            <p className="text-[10px] text-muted-foreground">Taxas Cartão</p>
            <p className="text-xs font-bold text-yellow-600">R$ {totals.totalFees.toFixed(2)}</p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-950/30 rounded-md p-2 text-center">
            <p className="text-[10px] text-muted-foreground">Descontos</p>
            <p className="text-xs font-bold text-orange-600">R$ {totals.totalDiscounts.toFixed(2)}</p>
          </div>
          <div className="bg-muted/50 rounded-md p-2 text-center col-span-2 sm:col-span-1">
            <p className="text-[10px] text-muted-foreground">Saldo Líquido</p>
            <p className={`text-xs font-bold ${totals.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              R$ {totals.balance.toFixed(2)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[450px]">
          <div className="min-w-[950px]">
            <Table>
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="text-[10px] py-1 px-2">Data</TableHead>
                  <TableHead className="text-[10px] py-1 px-2">Descrição</TableHead>
                  <TableHead className="text-[10px] py-1 px-2">Origem</TableHead>
                  <TableHead className="text-[10px] py-1 px-2">Categoria</TableHead>
                  <TableHead className="text-[10px] py-1 px-2">Pagamento</TableHead>
                  <TableHead className="text-[10px] py-1 px-2 text-right">Bruto</TableHead>
                  <TableHead className="text-[10px] py-1 px-2 text-right">Desc.</TableHead>
                  <TableHead className="text-[10px] py-1 px-2 text-right">Taxa</TableHead>
                  <TableHead className="text-[10px] py-1 px-2 text-right">Líquido</TableHead>
                  <TableHead className="text-[10px] py-1 px-2 text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entriesWithBalance.map((entry) => (
                  <TableRow key={entry.id} className="h-7">
                    <TableCell className="text-[11px] py-1 px-2">
                      {format(parseISO(entry.date), 'dd/MM/yy')}
                    </TableCell>
                    <TableCell className="text-[11px] py-1 px-2">
                      <div className="flex items-center gap-1.5">
                        {entry.type === 'income' ? (
                          <ArrowUpCircle className="h-3 w-3 text-green-500 shrink-0" />
                        ) : (
                          <ArrowDownCircle className="h-3 w-3 text-red-500 shrink-0" />
                        )}
                        <span className="truncate max-w-[200px]">{entry.description}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1 px-2">
                      <Badge variant="outline" className={`text-[9px] h-4 px-1 ${sourceColor(entry.source)}`}>
                        {sourceLabel(entry.source)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[11px] py-1 px-2 truncate max-w-[100px]">{entry.category}</TableCell>
                    <TableCell className="text-[11px] py-1 px-2 truncate max-w-[100px]">{entry.paymentMethod}</TableCell>
                    <TableCell className={`text-[11px] py-1 px-2 text-right ${entry.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      R$ {entry.grossAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-[11px] py-1 px-2 text-right text-orange-600">
                      {entry.discount > 0 ? `- R$ ${entry.discount.toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell className="text-[11px] py-1 px-2 text-right text-yellow-600">
                      {entry.cardFee > 0 ? `- R$ ${entry.cardFee.toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell className={`text-[11px] py-1 px-2 text-right font-medium ${entry.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      R$ {entry.netAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-[11px] py-1 px-2 text-right font-medium ${(entry.runningBalance || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      R$ {(entry.runningBalance || 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                {entriesWithBalance.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8 text-xs">
                      Nenhuma transação encontrada para o período selecionado
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

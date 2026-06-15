import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useCashTransactions } from '@/hooks/useCashTransactions';
import { useCashRegisters } from '@/hooks/useCashRegisters';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowUpCircle, ArrowDownCircle, Wallet, TrendingUp, Calendar, DollarSign, Download, FileText } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { calculateConsolidatedReportTotals, calculateOpenCashRegistersBalance } from '@/lib/financialReports';
import { useState, useMemo } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CLIENT_CREDIT_SOURCE_LABEL, NON_CASH_PAYMENT_LABEL } from '@/lib/clientCreditPayment';
import { exportToCSV } from '@/lib/exportUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ConsolidatedEntry {
  id: string;
  date: string;
  description: string;
  type: 'income' | 'expense' | 'non_cash';
  amount: number;
  source: 'caixa' | 'financeiro' | 'credito_cliente';
  status: string;
}

type PeriodFilter = 'today' | 'week' | 'month' | 'quarter' | 'custom';

export function RelatorioConsolidado() {
  const { entries } = useFinancialEntries();
  const { transactions } = useCashTransactions();
  const { cashRegisters } = useCashRegisters();
  const { data: creditTransactions = [] } = useQuery({
    queryKey: ['client_credit_transactions_report'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('client_credit_transactions')
        .select('id, created_at, transaction_type, amount, description');
      if (error) throw error;
      return data || [];
    },
  });
  
  const [periodFilter, setPeriodFilter] = useLocalStorage<PeriodFilter>('financeiro:relatorio:period', 'today');
  const [customDate, setCustomDate] = useLocalStorage<string>('financeiro:relatorio:customDate', format(new Date(), 'yyyy-MM-dd'));
  const [sourceFilter, setSourceFilter] = useLocalStorage<string>('financeiro:relatorio:source', 'all');
  const [typeFilter, setTypeFilter] = useLocalStorage<string>('financeiro:relatorio:type', 'all');

  // Calculate date range based on period filter
  const dateRange = useMemo(() => {
    const today = new Date();
    switch (periodFilter) {
      case 'week':
        return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
      case 'month':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'quarter':
        return { start: startOfQuarter(today), end: endOfQuarter(today) };
      case 'custom':
        const customParsed = parseISO(customDate);
        return { start: customParsed, end: customParsed };
      default: // today
        return { start: today, end: today };
    }
  }, [periodFilter, customDate]);

  // Combine and normalize data, deduplicating cash vs financial mirrors.
  // STRATEGY: cash_transactions is the canonical source for sales/payments.
  // A financial_entry is considered a mirror (and suppressed) when ANY of:
  //   1. description starts with "Caixa:" (auto-mirror prefix)
  //   2. appointment_id matches a cash transaction reference_id (appointment)
  //   3. description contains [sale:<id>] matching a cash sale reference
  //   4. same date + amount + payment method matches a cash transaction
  const consolidatedData: ConsolidatedEntry[] = useMemo(() => {
    const result: ConsolidatedEntry[] = [];

    const cashKeys = new Set<string>();
    const cashAppointmentIds = new Set<string>();
    const cashSaleIds = new Set<string>();
    const makeKey = (date: string, amount: number, method: string | null | undefined) => {
      const day = (date || '').slice(0, 10);
      const amt = Math.round(Number(amount || 0) * 100);
      const m = (method || '').toLowerCase().trim();
      return `${day}|${amt}|${m}`;
    };

    // Cash transactions (canonical)
    transactions.forEach((tx) => {
      cashKeys.add(makeKey(tx.created_at, Number(tx.amount), tx.payment_method_name));
      if (tx.reference_type === 'appointment' && tx.reference_id) {
        cashAppointmentIds.add(tx.reference_id);
      }
      if ((tx.reference_type === 'single_sale' || tx.reference_type === 'sale') && tx.reference_id) {
        cashSaleIds.add(tx.reference_id);
      }
      result.push({
        id: `cash-${tx.id}`,
        date: tx.created_at.split('T')[0],
        description: tx.description || tx.category,
        type: tx.type as 'income' | 'expense',
        amount: Number(tx.amount),
        source: 'caixa' as const,
        status: 'paid',
      });
    });

    // Financial entries — only realized (paid) ones, skipping mirrors of cash transactions
    entries.forEach((entry) => {
      // Only show movements that were effectively realized/registered
      if (entry.status !== 'paid') return;

      const desc = entry.description || '';
      const lowerDesc = desc.toLowerCase();

      if (lowerDesc.startsWith('caixa:')) return;
      if (entry.appointment_id && cashAppointmentIds.has(entry.appointment_id)) return;
      const saleIdMatch = desc.match(/\[sale:([a-f0-9-]+)\]/i);
      if (saleIdMatch && cashSaleIds.has(saleIdMatch[1])) return;

      const paymentMethodName = entry.payment_method?.name || '';
      const dedupKey = makeKey(entry.paid_date || entry.due_date, Number(entry.amount), paymentMethodName);
      if (cashKeys.has(dedupKey)) return;

      result.push({
        id: `fin-${entry.id}`,
        date: entry.paid_date || entry.due_date,
        description: desc,
        type: entry.type === 'receivable' ? 'income' : 'expense' as 'income' | 'expense',
        amount: Number(entry.amount),
        source: 'financeiro' as const,
        status: entry.status,
      });
    });


    // Client credit transactions (separate source, never duplicated)
    creditTransactions.forEach((tx: any) => {
      result.push({
        id: `credit-${tx.id}`,
        date: tx.created_at.split('T')[0],
        description: tx.description || 'Crédito ao cliente',
        type: 'non_cash' as const,
        amount: Number(tx.amount || 0),
        source: 'credito_cliente' as const,
        status: 'paid',
      });
    });

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [entries, transactions, creditTransactions]);

  // Apply filters
  const filteredData = useMemo(() => consolidatedData.filter((entry) => {
    const entryDate = parseISO(entry.date);
    const inRange = isWithinInterval(entryDate, { start: dateRange.start, end: dateRange.end });
    if (!inRange) return false;
    if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;
    if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
    return true;
  }), [consolidatedData, dateRange, sourceFilter, typeFilter]);

  // Calculate totals
  const { totalIncome, totalExpense, balance } = calculateConsolidatedReportTotals(filteredData);

  // Cash register summary
  const openCashRegisters = cashRegisters.filter((cr) => cr.status === 'open');
  const totalCashBalance = calculateOpenCashRegistersBalance(openCashRegisters);

  const getPeriodLabel = () => {
    switch (periodFilter) {
      case 'week': return 'Esta Semana';
      case 'month': return 'Este Mês';
      case 'quarter': return 'Este Trimestre';
      case 'custom': {
        if (!customDate || !/^\d{4}-\d{2}-\d{2}$/.test(customDate)) return 'Personalizado';
        const d = parseISO(customDate);
        if (isNaN(d.getTime())) return 'Personalizado';
        return format(d, "dd/MM/yyyy", { locale: ptBR });
      }
      default: return 'Hoje';
    }
  };

  const reportExportRows = filteredData.map(entry => [
    format(new Date(entry.date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }),
    entry.description,
    entry.source === 'caixa' ? 'Caixa' : entry.source === 'credito_cliente' ? CLIENT_CREDIT_SOURCE_LABEL : 'Financeiro',
    entry.type === 'income' ? 'Entrada' : entry.type === 'non_cash' ? NON_CASH_PAYMENT_LABEL : 'Saída',
    entry.status === 'paid' ? 'Pago' : entry.status === 'pending' ? 'Pendente' : entry.status === 'overdue' ? 'Vencido' : entry.status,
    formatCurrency(entry.amount),
  ]);

  const handleExportFilteredCSV = () => exportToCSV({
    filename: 'relatorio_consolidado_filtrado',
    headers: ['Data', 'Descrição', 'Origem', 'Tipo', 'Status', 'Valor'],
    rows: reportExportRows,
    successMessage: 'Relatório filtrado exportado em CSV!',
  });

  const handleExportFilteredPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Relatório Consolidado Filtrado', 14, 14);
    doc.setFontSize(9);
    doc.text(`Período: ${getPeriodLabel()} • Origem: ${sourceFilter === 'credito_cliente' ? CLIENT_CREDIT_SOURCE_LABEL : sourceFilter === 'all' ? 'Todas' : sourceFilter} • Tipo: ${typeFilter === 'non_cash' ? NON_CASH_PAYMENT_LABEL : typeFilter === 'all' ? 'Todos' : typeFilter}`, 14, 21);
    autoTable(doc, {
      startY: 28,
      head: [['Data', 'Descrição', 'Origem', 'Tipo', 'Status', 'Valor']],
      body: reportExportRows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [41, 98, 255] },
      columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 104 }, 5: { halign: 'right', cellWidth: 30 } },
    });
    doc.save(`relatorio_consolidado_filtrado_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Os totais de Entradas, Saídas, Saldo do Período e Caixas abertos
          são exibidos pela barra "Caixa em tempo real" no topo da página Financeiro. */}

      {/* Filters */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Filtros · {getPeriodLabel()}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Período</label>
              <div className="flex gap-1 flex-wrap">
                {([
                  ['today', 'Hoje'],
                  ['week', 'Semana'],
                  ['month', 'Mês'],
                  ['quarter', 'Trimestre'],
                  ['custom', 'Data Específica'],
                ] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    variant={periodFilter === value ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setPeriodFilter(value as any)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            {periodFilter === 'custom' && (
              <div className="min-w-[180px]">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Data</label>
                <Input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="max-w-xs h-7 text-xs"
                />
              </div>
            )}
            <div className="flex-1 min-w-[180px]">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Origem</label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="max-w-xs h-7 text-xs">
                  <SelectValue placeholder="Todas as origens" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  <SelectItem value="caixa">Caixa</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                  <SelectItem value="credito_cliente">{CLIENT_CREDIT_SOURCE_LABEL}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Tipo</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="max-w-xs h-7 text-xs">
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="income">Entrada</SelectItem>
                  <SelectItem value="expense">Saída</SelectItem>
                  <SelectItem value="non_cash">{NON_CASH_PAYMENT_LABEL}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consolidated Table */}
      <Card>
        <CardHeader className="py-2 px-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              Movimentações Consolidadas ({filteredData.length})
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={handleExportFilteredCSV} disabled={filteredData.length === 0}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={handleExportFilteredPDF} disabled={filteredData.length === 0}>
                <FileText className="h-3 w-3 mr-1" /> PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="rounded-md border overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 py-1.5 text-[10px] uppercase tracking-wide">Data</TableHead>
                  <TableHead className="h-8 py-1.5 text-[10px] uppercase tracking-wide">Descrição</TableHead>
                  <TableHead className="h-8 py-1.5 text-[10px] uppercase tracking-wide">Origem</TableHead>
                  <TableHead className="h-8 py-1.5 text-[10px] uppercase tracking-wide">Tipo</TableHead>
                  <TableHead className="h-8 py-1.5 text-[10px] uppercase tracking-wide">Status</TableHead>
                  <TableHead className="h-8 py-1.5 text-[10px] uppercase tracking-wide text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                      Nenhuma movimentação encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.slice(0, 50).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="py-1.5 text-xs whitespace-nowrap">
                        {format(new Date(entry.date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs max-w-[260px] truncate">
                        {entry.description}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant={entry.source === 'caixa' ? 'secondary' : 'outline'} className="text-[10px] px-1.5 py-0">
                          {entry.source === 'caixa' ? 'Caixa' : entry.source === 'credito_cliente' ? CLIENT_CREDIT_SOURCE_LABEL : 'Financeiro'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1.5 py-0',
                            entry.type === 'income'
                              ? 'text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30'
                              : entry.type === 'non_cash'
                              ? 'text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30'
                              : 'text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30'
                          )}
                        >
                          {entry.type === 'income' ? 'Entrada' : entry.type === 'non_cash' ? NON_CASH_PAYMENT_LABEL : 'Saída'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1.5 py-0',
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
                        "py-1.5 text-xs text-right font-medium whitespace-nowrap",
                        entry.type === 'income' ? 'text-green-600' : entry.type === 'non_cash' ? 'text-blue-600' : 'text-red-600'
                      )}>
                        {entry.type === 'income' ? '+' : entry.type === 'non_cash' ? '' : '-'} {formatCurrency(entry.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredData.length > 50 && (
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Mostrando 50 de {filteredData.length} registros
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

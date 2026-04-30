import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, CreditCard, AlertTriangle, Clock, DollarSign } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function FinancialDashboard() {
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel('fin_dashboard_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_transactions' }, () =>
        queryClient.invalidateQueries({ queryKey: ['fin_dashboard'] })
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'single_sales' }, () =>
        queryClient.invalidateQueries({ queryKey: ['fin_dashboard'] })
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boleto_installments' }, () =>
        queryClient.invalidateQueries({ queryKey: ['fin_dashboard'] })
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_entries' }, () =>
        queryClient.invalidateQueries({ queryKey: ['fin_dashboard'] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ['fin_dashboard', dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      // Sales with payment method
      const { data: sales } = await supabase
        .from('single_sales')
        .select('id, final_amount, original_amount, payment_method_id, paid_at, sale_date, payment_methods(name)')
        .gte('sale_date', dateRange.from.toISOString())
        .lte('sale_date', dateRange.to.toISOString());

      // Cash transactions
      const { data: cashTx } = await supabase
        .from('cash_transactions')
        .select('id, amount, type, payment_method, created_at')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      // Boleto installments
      const { data: boletos } = await supabase
        .from('boleto_installments')
        .select('id, amount, status, due_date, paid_at, installment_number, total_installments');

      // Financial entries for compensation tracking
      const { data: finEntries } = await supabase
        .from('financial_entries')
        .select('id, amount, type, status, due_date, description, payment_method')
        .gte('due_date', dateRange.from.toISOString())
        .lte('due_date', dateRange.to.toISOString());

      return { sales: sales || [], cashTx: cashTx || [], boletos: boletos || [], finEntries: finEntries || [] };
    },
    staleTime: 0,
  });

  // Payment method totals
  const paymentMethodChart = useMemo(() => {
    if (!data?.sales) return [];
    const map = new Map<string, number>();
    data.sales.forEach((s: any) => {
      const name = s.payment_methods?.name || 'Outros';
      const amt = Number(s.final_amount || s.original_amount || 0);
      map.set(name, (map.get(name) || 0) + amt);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [data?.sales]);

  // Boleto pendencies
  const boletoPendencies = useMemo(() => {
    if (!data?.boletos) return { pending: 0, overdue: 0, paid: 0, pendingAmount: 0, overdueAmount: 0, paidAmount: 0, items: [] };
    const now = new Date();
    let pending = 0, overdue = 0, paid = 0, pendingAmount = 0, overdueAmount = 0, paidAmount = 0;
    const items: any[] = [];
    data.boletos.forEach((b: any) => {
      const amt = Number(b.amount || 0);
      if (b.status === 'paid') {
        paid++;
        paidAmount += amt;
      } else {
        const due = b.due_date ? parseISO(b.due_date + 'T12:00:00') : null;
        if (due && due < now) {
          overdue++;
          overdueAmount += amt;
          items.push({ ...b, isOverdue: true });
        } else {
          pending++;
          pendingAmount += amt;
          items.push({ ...b, isOverdue: false });
        }
      }
    });
    return { pending, overdue, paid, pendingAmount, overdueAmount, paidAmount, items };
  }, [data?.boletos]);

  const boletoChart = useMemo(() => [
    { name: 'Pagos', value: boletoPendencies.paidAmount, count: boletoPendencies.paid },
    { name: 'Pendentes', value: boletoPendencies.pendingAmount, count: boletoPendencies.pending },
    { name: 'Vencidos', value: boletoPendencies.overdueAmount, count: boletoPendencies.overdue },
  ].filter(i => i.value > 0), [boletoPendencies]);

  // Compensations in period
  const compensationChart = useMemo(() => {
    if (!data?.finEntries) return [];
    const received = data.finEntries.filter((e: any) => e.type === 'income' && e.status === 'paid')
      .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const pendingRec = data.finEntries.filter((e: any) => e.type === 'income' && e.status === 'pending')
      .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const expenses = data.finEntries.filter((e: any) => e.type === 'expense' && e.status === 'paid')
      .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const pendingExp = data.finEntries.filter((e: any) => e.type === 'expense' && e.status === 'pending')
      .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    return [
      { name: 'Recebido', value: received },
      { name: 'A Receber', value: pendingRec },
      { name: 'Pago', value: expenses },
      { name: 'A Pagar', value: pendingExp },
    ];
  }, [data?.finEntries]);

  const totalSales = paymentMethodChart.reduce((s, i) => s + i.value, 0);

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 text-xs">
              <CalendarIcon className="h-3.5 w-3.5" />
              {format(dateRange.from, 'dd/MM/yyyy')} - {format(dateRange.to, 'dd/MM/yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => {
                if (range?.from && range?.to) setDateRange({ from: range.from, to: range.to });
              }}
              locale={ptBR}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Vendas</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(totalSales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Boletos Pendentes</p>
            <p className="text-lg font-bold text-amber-600">{formatCurrency(boletoPendencies.pendingAmount)}</p>
            <p className="text-[10px] text-muted-foreground">{boletoPendencies.pending} parcelas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Boletos Vencidos</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(boletoPendencies.overdueAmount)}</p>
            <p className="text-[10px] text-muted-foreground">{boletoPendencies.overdue} parcelas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Boletos Pagos</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(boletoPendencies.paidAmount)}</p>
            <p className="text-[10px] text-muted-foreground">{boletoPendencies.paid} parcelas</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Payment methods pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Total por Forma de Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paymentMethodChart.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Sem dados no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={paymentMethodChart}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {paymentMethodChart.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
            {/* Legend */}
            <div className="flex flex-wrap gap-2 mt-2">
              {paymentMethodChart.map((item, i) => (
                <div key={item.name} className="flex items-center gap-1 text-[10px]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  {item.name}: {formatCurrency(item.value)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Boleto status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Pendências de Boletos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {boletoChart.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Sem boletos registrados</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={boletoChart}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, count }) => `${name} (${count})`}
                  >
                    <Cell fill="#10B981" />
                    <Cell fill="#F59E0B" />
                    <Cell fill="#EF4444" />
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Compensations bar chart */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Compensações no Período
            </CardTitle>
          </CardHeader>
          <CardContent>
            {compensationChart.every(c => c.value === 0) ? (
              <p className="text-xs text-muted-foreground text-center py-8">Sem movimentações no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={compensationChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {compensationChart.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

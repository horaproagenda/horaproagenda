import { DollarSign, TrendingUp, TrendingDown, Calendar, ArrowUpRight, ArrowDownRight, BarChart3, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SalesOverviewProps {
  daily: number;
  monthly: number;
  yearly: number;
  monthlyComparison: number;
  todayAppointments: number;
}

export function SalesOverview({ daily, monthly, yearly, monthlyComparison, todayAppointments }: SalesOverviewProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const isPositive = monthlyComparison >= 0;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="border-l-4 border-l-emerald-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
          <CardTitle className="text-[11px] font-medium text-emerald-600 uppercase tracking-wide">Vendas Hoje</CardTitle>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
            <DollarSign className="h-3 w-3 text-emerald-600" />
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="text-base font-bold text-emerald-700 tabular-nums">{formatCurrency(daily)}</div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Calendar className="h-2.5 w-2.5" />
            {todayAppointments} agendamentos
          </p>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-sky-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
          <CardTitle className="text-[11px] font-medium text-sky-600 uppercase tracking-wide">Vendas do Mês</CardTitle>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-500/10">
            {isPositive ? (
              <TrendingUp className="h-3 w-3 text-sky-600" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-500" />
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="text-base font-bold text-sky-700 tabular-nums">{formatCurrency(monthly)}</div>
          <p className={`text-[10px] flex items-center gap-1 mt-0.5 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
            {Math.abs(monthlyComparison).toFixed(1)}% vs mês anterior
          </p>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-violet-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
          <CardTitle className="text-[11px] font-medium text-violet-600 uppercase tracking-wide">Vendas do Ano</CardTitle>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/10">
            <BarChart3 className="h-3 w-3 text-violet-600" />
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="text-base font-bold text-violet-700 tabular-nums">{formatCurrency(yearly)}</div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Média mensal: {formatCurrency(yearly / 12)}
          </p>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-amber-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
          <CardTitle className="text-[11px] font-medium text-amber-600 uppercase tracking-wide">Ticket Médio</CardTitle>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10">
            <Target className="h-3 w-3 text-amber-600" />
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="text-base font-bold text-amber-700 tabular-nums">
            {todayAppointments > 0 ? formatCurrency(daily / todayAppointments) : formatCurrency(0)}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Baseado em vendas de hoje
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

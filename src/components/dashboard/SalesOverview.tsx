import { DollarSign, TrendingUp, TrendingDown, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
          <CardTitle className="text-[11px] font-medium text-muted-foreground">Vendas Hoje</CardTitle>
          <DollarSign className="h-3 w-3 text-primary" />
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="text-base font-bold text-foreground">{formatCurrency(daily)}</div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Calendar className="h-2.5 w-2.5" />
            {todayAppointments} agendamentos
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
          <CardTitle className="text-[11px] font-medium text-muted-foreground">Vendas do Mês</CardTitle>
          {isPositive ? (
            <TrendingUp className="h-3 w-3 text-green-500" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-500" />
          )}
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="text-base font-bold text-foreground">{formatCurrency(monthly)}</div>
          <p className={`text-[10px] flex items-center gap-1 mt-0.5 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
            {Math.abs(monthlyComparison).toFixed(1)}% vs mês anterior
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
          <CardTitle className="text-[11px] font-medium text-muted-foreground">Vendas do Ano</CardTitle>
          <DollarSign className="h-3 w-3 text-primary" />
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="text-base font-bold text-foreground">{formatCurrency(yearly)}</div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Média mensal: {formatCurrency(yearly / 12)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
          <CardTitle className="text-[11px] font-medium text-muted-foreground">Ticket Médio</CardTitle>
          <DollarSign className="h-3 w-3 text-primary" />
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="text-base font-bold text-foreground">
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

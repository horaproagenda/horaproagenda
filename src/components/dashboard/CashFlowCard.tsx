import { Wallet, ArrowUpCircle, ArrowDownCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface CashFlowCardProps {
  data: {
    opening: number;
    income: number;
    expense: number;
    current: number;
    status: string;
  } | null;
}

export function CashFlowCard({ data }: CashFlowCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (!data) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            Fluxo de Caixa
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <AlertCircle className="h-7 w-7 text-muted-foreground/50 mb-1.5" />
            <p className="text-xs text-muted-foreground">
              Nenhum caixa aberto hoje
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5 text-primary" />
          Fluxo de Caixa
        </CardTitle>
        <Badge variant={data.status === 'open' ? 'default' : 'secondary'} className="h-4 px-1.5 text-[10px]">
          {data.status === 'open' ? 'Aberto' : 'Fechado'}
        </Badge>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Abertura</span>
          <span className="font-medium">{formatCurrency(data.opening)}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1">
            <ArrowUpCircle className="h-3 w-3 text-green-500" />
            Entradas
          </span>
          <span className="font-medium text-green-500">+{formatCurrency(data.income)}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1">
            <ArrowDownCircle className="h-3 w-3 text-red-500" />
            Saídas
          </span>
          <span className="font-medium text-red-500">-{formatCurrency(data.expense)}</span>
        </div>

        <div className="border-t border-border pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Saldo Atual</span>
            <span className="text-base font-bold text-foreground">{formatCurrency(data.current)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

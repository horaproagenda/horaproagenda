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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Fluxo de Caixa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhum caixa aberto hoje
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          Fluxo de Caixa
        </CardTitle>
        <Badge variant={data.status === 'open' ? 'default' : 'secondary'}>
          {data.status === 'open' ? 'Aberto' : 'Fechado'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Abertura</span>
          <span className="font-medium">{formatCurrency(data.opening)}</span>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1">
            <ArrowUpCircle className="h-4 w-4 text-green-500" />
            Entradas
          </span>
          <span className="font-medium text-green-500">+{formatCurrency(data.income)}</span>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1">
            <ArrowDownCircle className="h-4 w-4 text-red-500" />
            Saídas
          </span>
          <span className="font-medium text-red-500">-{formatCurrency(data.expense)}</span>
        </div>
        
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">Saldo Atual</span>
            <span className="text-xl font-bold text-foreground">{formatCurrency(data.current)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

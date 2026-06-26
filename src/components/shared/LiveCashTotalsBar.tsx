import { useLiveCashTotals } from '@/hooks/useLiveCashTotals';
import { Card } from '@/components/ui/card';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  Percent,
  CreditCard,
  TrendingUp,
  Circle,
} from 'lucide-react';
import { format } from 'date-fns';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  /** Compact mode for sidebars / agenda header */
  compact?: boolean;
  className?: string;
}

/**
 * Barra UNIFICADA de totais do caixa em tempo real.
 * Mesmos valores aparecem em Caixa, Agenda e Financeiro — atualizados a cada
 * segundo e via Supabase Realtime.
 */
export function LiveCashTotalsBar({ compact = false, className = '' }: Props) {
  const t = useLiveCashTotals();

  if (!t.isOpen) {
    return (
      <Card className={`p-3 flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
        <Circle className="h-3 w-3 text-muted-foreground/60" />
        Nenhum caixa aberto no momento.
      </Card>
    );
  }

  const items = [
    { label: 'Entradas', value: t.income, Icon: ArrowDownCircle, color: 'text-emerald-600' },
    { label: 'Saídas', value: t.expense, Icon: ArrowUpCircle, color: 'text-destructive' },
    { label: 'Descontos', value: t.discounts, Icon: Percent, color: 'text-amber-600' },
    { label: 'Taxas Cartão', value: t.cardFees, Icon: CreditCard, color: 'text-orange-600' },
    { label: 'Líquido', value: t.net, Icon: TrendingUp, color: 'text-blue-600' },
    { label: 'Saldo Atual', value: t.balance, Icon: Wallet, color: 'text-primary' },
  ];

  return (
    <Card
      className={`p-3 ${className}`}
      role="region"
      aria-label="Totais do caixa em tempo real"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
          Caixa em tempo real
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Atualizado {format(t.lastUpdate, 'HH:mm:ss')}
        </span>
      </div>

      <div
        className={`grid gap-2 ${
          compact
            ? 'grid-cols-2 sm:grid-cols-3'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
        }`}
      >
        {items.map(({ label, value, Icon, color }) => (
          <div
            key={label}
            className="flex flex-col rounded-md border bg-card/50 px-2 py-1.5"
          >
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Icon className={`h-3 w-3 ${color}`} />
              {label}
            </span>
            <span className={`text-sm font-semibold tabular-nums ${color}`}>
              {fmt(value)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

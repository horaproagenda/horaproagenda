import { useMemo, useEffect } from 'react';
import { useLogAccessOnMount } from '@/hooks/useLogAccess';
import { useSearchParams } from 'react-router-dom';
import { startOfMonth, endOfMonth } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { 
  FileText, 
  ArrowDownCircle, 
  
  Tag,
  CreditCard,
  TrendingUp,
  Landmark,
  Percent,
  Target,
  Calculator,
  BarChart3,
} from 'lucide-react';
import { ContasAPagar } from '@/components/financeiro/ContasAPagar';
import { ExtratoFinanceiro } from '@/components/financeiro/ExtratoFinanceiro';

import { CategoriasFinanceiras } from '@/components/financeiro/CategoriasFinanceiras';
import { FormasPagamento } from '@/components/financeiro/FormasPagamento';
import { CommissionsReport } from '@/components/caixa/CommissionsReport';
import { GoalsPanel } from '@/components/financeiro/GoalsPanel';
import { PrecificacaoServicos } from '@/components/financeiro/PrecificacaoServicos';
import { RelatorioConsolidado } from '@/components/financeiro/RelatorioConsolidado';
import { FinancialDashboard } from '@/components/financeiro/FinancialDashboard';

import { PacotesFinanceiro } from '@/components/financeiro/PacotesFinanceiro';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useBanks } from '@/hooks/useBanks';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LiveCashTotalsBar } from '@/components/shared/LiveCashTotalsBar';

export default function Financeiro() {
  useLogAccessOnMount({ module: 'financeiro', action: 'view', fieldsViewed: ['type', 'amount', 'description', 'due_date', 'status', 'client', 'professional', 'category'] });
  const [searchParams, setSearchParams] = useSearchParams();
  const { totalReceivables, totalPayables } = useFinancialEntries();
  const { banks } = useBanks();
  const { appointments } = useAppointments();
  const { professionals } = useProfessionals();
  // Sempre abre na aba Relatório ao entrar na página
  const [activeTab, setActiveTab] = useState('relatorio');

  // Handle URL query params for deep linking from notifications
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      const tabMap: Record<string, string> = {
        'dashboard': 'dashboard',
        'pagar': 'contas-pagar',
        'extrato': 'extrato',
        'caixas': 'caixas',
        'pacotes': 'pacotes',
        'categorias': 'categorias',
        'formas': 'formas-pagamento',
        'comissoes': 'comissoes',
        'relatorio': 'relatorio',
        'metas': 'metas',
        'precificacao': 'precificacao',
      };
      const mappedTab = tabMap[tabParam] || tabParam;
      if (mappedTab) {
        setActiveTab(mappedTab);
        searchParams.delete('tab');
        searchParams.delete('entry');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, setActiveTab, setSearchParams]);

  const balance = totalReceivables - totalPayables;

  // Commission report date range (current month)
  const commissionDateRange = useMemo(() => ({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date())
  }), []);

  return (
    <AppLayout title="Financeiro" subtitle="Gestão financeira completa">
      <div className="space-y-4 page-enter">


        {/* Summary Cards — minimalistas com ícones coloridos */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="card-hover border-l-2 border-l-red-500">
            <CardContent className="p-2 sm:p-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-500/10">
                  <ArrowDownCircle className="h-4 w-4 text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">A Pagar</p>
                  <p className="text-sm sm:text-base font-bold text-red-600 truncate tabular-nums leading-tight">
                    R$ {totalPayables.toFixed(0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={cn("card-hover border-l-2", balance >= 0 ? "border-l-emerald-500" : "border-l-red-500")}>
            <CardContent className="p-2 sm:p-2.5">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  balance >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"
                )}>
                  <TrendingUp className={cn("h-4 w-4", balance >= 0 ? "text-emerald-600" : "text-red-500")} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">Saldo</p>
                  <p className={cn(
                    "text-sm sm:text-base font-bold truncate tabular-nums leading-tight",
                    balance >= 0 ? "text-emerald-600" : "text-red-600"
                  )}>
                    R$ {balance.toFixed(0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover border-l-2 border-l-blue-500">
            <CardContent className="p-2 sm:p-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                  <Landmark className="h-4 w-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">Bancos</p>
                  <p className="text-sm sm:text-base font-bold truncate tabular-nums leading-tight text-blue-600">
                    {banks.filter(b => b.is_active).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Cash Totals (sincronizado em tempo real com Caixa e Agenda) */}
        <LiveCashTotalsBar />

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
          <div className="overflow-x-auto -mx-2 px-2 scrollbar-thin">
          <TabsList className="inline-flex w-max min-w-full h-auto gap-1.5 bg-muted/50 p-1">
            {[
              { v: 'relatorio', label: 'Relatório', Icon: FileText, color: 'text-sky-600', active: 'data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-700 data-[state=active]:border-sky-500/40' },
              { v: 'extrato', label: 'Extratos', Icon: FileText, color: 'text-indigo-600', active: 'data-[state=active]:bg-indigo-500/15 data-[state=active]:text-indigo-700 data-[state=active]:border-indigo-500/40' },
              { v: 'contas-pagar', label: 'A Pagar', Icon: ArrowDownCircle, color: 'text-red-600', active: 'data-[state=active]:bg-red-500/15 data-[state=active]:text-red-700 data-[state=active]:border-red-500/40' },
              { v: 'categorias', label: 'Categorias', Icon: Tag, color: 'text-amber-600', active: 'data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-700 data-[state=active]:border-amber-500/40' },
              { v: 'formas-pagamento', label: 'Pagamento', Icon: CreditCard, color: 'text-emerald-600', active: 'data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-700 data-[state=active]:border-emerald-500/40' },
              { v: 'pacotes', label: 'Pacotes', Icon: Tag, color: 'text-fuchsia-600', active: 'data-[state=active]:bg-fuchsia-500/15 data-[state=active]:text-fuchsia-700 data-[state=active]:border-fuchsia-500/40' },
              { v: 'comissoes', label: 'Comissões', Icon: Percent, color: 'text-violet-600', active: 'data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-700 data-[state=active]:border-violet-500/40' },
              { v: 'metas', label: 'Metas', Icon: Target, color: 'text-rose-600', active: 'data-[state=active]:bg-rose-500/15 data-[state=active]:text-rose-700 data-[state=active]:border-rose-500/40' },
              { v: 'precificacao', label: 'Precificação', Icon: Calculator, color: 'text-orange-600', active: 'data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-700 data-[state=active]:border-orange-500/40' },
              { v: 'dashboard', label: 'Dashboard', Icon: BarChart3, color: 'text-teal-600', active: 'data-[state=active]:bg-teal-500/15 data-[state=active]:text-teal-700 data-[state=active]:border-teal-500/40' },
            ].map(({ v, label, Icon, color, active }) => (
              <TabsTrigger
                key={v}
                value={v}
                title={label}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap text-[11px] tracking-wide h-8 px-2.5 border border-transparent transition-colors",
                  active
                )}
              >
                <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          </div>

          <TabsContent value="dashboard" className="page-enter">
            <FinancialDashboard />
          </TabsContent>

          <TabsContent value="contas-pagar" className="page-enter">
            <ContasAPagar />
          </TabsContent>

          <TabsContent value="extrato" className="page-enter">
            <ExtratoFinanceiro />
          </TabsContent>

          <TabsContent value="pacotes" className="page-enter">
            <PacotesFinanceiro />
          </TabsContent>

          <TabsContent value="categorias" className="page-enter">
            <CategoriasFinanceiras />
          </TabsContent>

          <TabsContent value="formas-pagamento" className="page-enter">
            <FormasPagamento />
          </TabsContent>

          <TabsContent value="comissoes" className="page-enter">
            <CommissionsReport 
              appointments={appointments}
              professionals={professionals}
              dateRange={commissionDateRange}
              dateRangeLabel="Mês Atual"
            />
          </TabsContent>

          <TabsContent value="relatorio" className="page-enter">
            <RelatorioConsolidado />
          </TabsContent>

          <TabsContent value="metas" className="page-enter">
            <GoalsPanel />
          </TabsContent>

          <TabsContent value="precificacao" className="page-enter">
            <PrecificacaoServicos />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

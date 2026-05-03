import { useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { startOfMonth, endOfMonth } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { 
  FileText, 
  ArrowDownCircle, 
  Wallet,
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
import { MeusCaixas } from '@/components/financeiro/MeusCaixas';
import { CategoriasFinanceiras } from '@/components/financeiro/CategoriasFinanceiras';
import { FormasPagamento } from '@/components/financeiro/FormasPagamento';
import { CommissionsReport } from '@/components/caixa/CommissionsReport';
import { GoalsPanel } from '@/components/financeiro/GoalsPanel';
import { PrecificacaoServicos } from '@/components/financeiro/PrecificacaoServicos';
import { RelatorioConsolidado } from '@/components/financeiro/RelatorioConsolidado';
import { FinancialDashboard } from '@/components/financeiro/FinancialDashboard';
import { FinancialDivergenceAlert } from '@/components/financeiro/FinancialDivergenceAlert';
import { PacotesFinanceiro } from '@/components/financeiro/PacotesFinanceiro';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useBanks } from '@/hooks/useBanks';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { cn } from '@/lib/utils';
import { LiveCashTotalsBar } from '@/components/shared/LiveCashTotalsBar';

export default function Financeiro() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { totalReceivables, totalPayables } = useFinancialEntries();
  const { banks } = useBanks();
  const { appointments } = useAppointments();
  const { professionals } = useProfessionals();
  const [activeTab, setActiveTab] = useLocalStorage('financeiro-tab', 'relatorio');

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
        {/* Divergence Alert */}
        <FinancialDivergenceAlert />

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
          <TabsList className="grid grid-cols-6 sm:grid-cols-11 h-auto gap-1 bg-muted/50 p-1 w-full">
            <TabsTrigger value="relatorio" className="gap-1.5 text-[11px] tracking-wide h-9 px-1" title="Relatório">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Relatório</span>
            </TabsTrigger>
            <TabsTrigger value="pacotes" className="gap-1.5 text-[11px] tracking-wide h-9 px-1" title="Pacotes">
              <Tag className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Pacotes</span>
            </TabsTrigger>
            <TabsTrigger value="meus-caixas" className="gap-1.5 text-[11px] tracking-wide h-9 px-1" title="Caixas">
              <Wallet className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Caixas</span>
            </TabsTrigger>
            <TabsTrigger value="extrato" className="gap-1.5 text-[11px] tracking-wide h-9 px-1" title="Extrato">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Extrato</span>
            </TabsTrigger>
            <TabsTrigger value="formas-pagamento" className="gap-1.5 text-[11px] tracking-wide h-9 px-1" title="Formas de Pagamento">
              <CreditCard className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Pagamento</span>
            </TabsTrigger>
            <TabsTrigger value="comissoes" className="gap-1.5 text-[11px] tracking-wide h-9 px-1" title="Comissões">
              <Percent className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Comissões</span>
            </TabsTrigger>
            <TabsTrigger value="metas" className="gap-1.5 text-[11px] tracking-wide h-9 px-1" title="Metas">
              <Target className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Metas</span>
            </TabsTrigger>
            <TabsTrigger value="precificacao" className="gap-1.5 text-[11px] tracking-wide h-9 px-1" title="Precificação">
              <Calculator className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Precificação</span>
            </TabsTrigger>
            <TabsTrigger value="categorias" className="gap-1.5 text-[11px] tracking-wide h-9 px-1" title="Categorias">
              <Tag className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Categorias</span>
            </TabsTrigger>
            <TabsTrigger value="contas-pagar" className="gap-1.5 text-[11px] tracking-wide h-9 px-1" title="A Pagar">
              <ArrowDownCircle className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">A Pagar</span>
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-1.5 text-[11px] tracking-wide h-9 px-1" title="Dashboard">
              <BarChart3 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="page-enter">
            <FinancialDashboard />
          </TabsContent>

          <TabsContent value="contas-pagar" className="page-enter">
            <ContasAPagar />
          </TabsContent>

          <TabsContent value="extrato" className="page-enter">
            <ExtratoFinanceiro />
          </TabsContent>

          <TabsContent value="meus-caixas" className="page-enter">
            <MeusCaixas />
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

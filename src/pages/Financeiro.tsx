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
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useBanks } from '@/hooks/useBanks';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { cn } from '@/lib/utils';

export default function Financeiro() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { totalReceivables, totalPayables } = useFinancialEntries();
  const { banks } = useBanks();
  const { appointments } = useAppointments();
  const { professionals } = useProfessionals();
  const [activeTab, setActiveTab] = useLocalStorage('financeiro-tab', 'contas-pagar');

  // Handle URL query params for deep linking from notifications
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      const tabMap: Record<string, string> = {
        'pagar': 'contas-pagar',
        'extrato': 'extrato',
        'caixas': 'caixas',
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

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="card-hover">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground tracking-wide">A Pagar</p>
                  <p className="text-lg font-bold text-red-600 truncate">
                    R$ {totalPayables.toFixed(0)}
                  </p>
                </div>
                <ArrowDownCircle className="h-6 w-6 text-red-500 shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground tracking-wide">Saldo</p>
                  <p className={cn(
                    "text-lg font-bold truncate",
                    balance >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    R$ {balance.toFixed(0)}
                  </p>
                </div>
                <TrendingUp className="h-6 w-6 text-primary shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground tracking-wide">Bancos</p>
                  <p className="text-lg font-bold truncate">
                    {banks.filter(b => b.is_active).length}
                  </p>
                </div>
                <Landmark className="h-6 w-6 text-primary shrink-0" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
          <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="dashboard" className="gap-1.5 text-xs tracking-wide h-8">
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="contas-pagar" className="gap-1.5 text-xs tracking-wide h-8">
              <ArrowDownCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">A Pagar</span>
            </TabsTrigger>
            <TabsTrigger value="extrato" className="gap-1.5 text-xs tracking-wide h-8">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Extrato</span>
            </TabsTrigger>
            <TabsTrigger value="meus-caixas" className="gap-1.5 text-xs tracking-wide h-8">
              <Wallet className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Caixas</span>
            </TabsTrigger>
            <TabsTrigger value="categorias" className="gap-1.5 text-xs tracking-wide h-8">
              <Tag className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Categorias</span>
            </TabsTrigger>
            <TabsTrigger value="formas-pagamento" className="gap-1.5 text-xs tracking-wide h-8">
              <CreditCard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Pagamento</span>
            </TabsTrigger>
            <TabsTrigger value="comissoes" className="gap-1.5 text-xs tracking-wide h-8">
              <Percent className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Comissões</span>
            </TabsTrigger>
            <TabsTrigger value="relatorio" className="gap-1.5 text-xs tracking-wide h-8">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Relatório</span>
            </TabsTrigger>
            <TabsTrigger value="metas" className="gap-1.5 text-xs tracking-wide h-8">
              <Target className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Metas</span>
            </TabsTrigger>
            <TabsTrigger value="precificacao" className="gap-1.5 text-xs tracking-wide h-8">
              <Calculator className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Precificação</span>
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

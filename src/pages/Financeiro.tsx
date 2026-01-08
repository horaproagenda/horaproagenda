import { useMemo } from 'react';
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
  ArrowUpCircle,
  TrendingUp,
  Landmark,
  Percent,
} from 'lucide-react';
import { ContasAPagar } from '@/components/financeiro/ContasAPagar';
import { ContasAReceber } from '@/components/financeiro/ContasAReceber';
import { ExtratoFinanceiro } from '@/components/financeiro/ExtratoFinanceiro';
import { MeusCaixas } from '@/components/financeiro/MeusCaixas';
import { CategoriasFinanceiras } from '@/components/financeiro/CategoriasFinanceiras';
import { FormasPagamento } from '@/components/financeiro/FormasPagamento';
import { CommissionsReport } from '@/components/caixa/CommissionsReport';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useBanks } from '@/hooks/useBanks';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { cn } from '@/lib/utils';

export default function Financeiro() {
  const { totalReceivables, totalPayables } = useFinancialEntries();
  const { banks } = useBanks();
  const { appointments } = useAppointments();
  const { professionals } = useProfessionals();

  const balance = totalReceivables - totalPayables;

  // Commission report date range (current month)
  const commissionDateRange = useMemo(() => ({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date())
  }), []);

  return (
    <AppLayout title="Financeiro" subtitle="Gestão financeira completa">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">A Receber</p>
                  <p className="text-2xl font-bold text-green-600">
                    R$ {totalReceivables.toFixed(2)}
                  </p>
                </div>
                <ArrowUpCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">A Pagar</p>
                  <p className="text-2xl font-bold text-red-600">
                    R$ {totalPayables.toFixed(2)}
                  </p>
                </div>
                <ArrowDownCircle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saldo</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    balance >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    R$ {balance.toFixed(2)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bancos</p>
                  <p className="text-2xl font-bold">
                    {banks.filter(b => b.is_active).length}
                  </p>
                </div>
                <Landmark className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="contas-pagar" className="space-y-4">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="contas-pagar" className="gap-2">
              <ArrowDownCircle className="h-4 w-4" />
              Contas a Pagar
            </TabsTrigger>
            <TabsTrigger value="a-receber" className="gap-2">
              <ArrowUpCircle className="h-4 w-4" />
              A Receber
            </TabsTrigger>
            <TabsTrigger value="extrato" className="gap-2">
              <FileText className="h-4 w-4" />
              Extrato
            </TabsTrigger>
            <TabsTrigger value="meus-caixas" className="gap-2">
              <Wallet className="h-4 w-4" />
              Meus Caixas
            </TabsTrigger>
            <TabsTrigger value="categorias" className="gap-2">
              <Tag className="h-4 w-4" />
              Categorias
            </TabsTrigger>
            <TabsTrigger value="formas-pagamento" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Formas de Pagamento
            </TabsTrigger>
            <TabsTrigger value="comissoes" className="gap-2">
              <Percent className="h-4 w-4" />
              Comissões
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contas-pagar">
            <ContasAPagar />
          </TabsContent>

          <TabsContent value="a-receber">
            <ContasAReceber />
          </TabsContent>

          <TabsContent value="extrato">
            <ExtratoFinanceiro />
          </TabsContent>

          <TabsContent value="meus-caixas">
            <MeusCaixas />
          </TabsContent>

          <TabsContent value="categorias">
            <CategoriasFinanceiras />
          </TabsContent>

          <TabsContent value="formas-pagamento">
            <FormasPagamento />
          </TabsContent>

          <TabsContent value="comissoes">
            <CommissionsReport 
              appointments={appointments}
              professionals={professionals}
              dateRange={commissionDateRange}
              dateRangeLabel="Mês Atual"
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

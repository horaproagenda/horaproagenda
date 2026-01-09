import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShoppingCart, Wallet, History, AlertTriangle } from 'lucide-react';
import { SaleForm } from '@/components/caixa/SaleForm';
import { CashRegisterPanel } from '@/components/caixa/CashRegisterPanel';
import { CashRegisterHistory } from '@/components/caixa/CashRegisterHistory';
import { PackageConsistencyReport } from '@/components/caixa/PackageConsistencyReport';
import { useCashRegisters } from '@/hooks/useCashRegisters';
import { useLocalStorage } from '@/hooks/useLocalStorage';

export default function Caixa() {
  const { closedRegisters, isLoading } = useCashRegisters();
  const [activeTab, setActiveTab] = useLocalStorage('caixa-tab', 'vendas');

  return (
    <AppLayout title="Caixa" subtitle="Vendas e controle financeiro">
      <div className="space-y-4 page-enter">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="h-9 bg-muted/50">
            <TabsTrigger value="vendas" className="gap-2 text-xs tracking-wide">
              <ShoppingCart className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nova Venda</span>
            </TabsTrigger>
            <TabsTrigger value="caixa" className="gap-2 text-xs tracking-wide">
              <Wallet className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Controle</span>
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-2 text-xs tracking-wide">
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Histórico</span>
            </TabsTrigger>
            <TabsTrigger value="consistencia" className="gap-2 text-xs tracking-wide">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Consistência</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vendas" className="page-enter">
            <SaleForm />
          </TabsContent>

          <TabsContent value="caixa" className="page-enter">
            <CashRegisterPanel />
          </TabsContent>

          <TabsContent value="historico" className="page-enter">
            <CashRegisterHistory 
              closedRegisters={closedRegisters} 
              isLoading={isLoading} 
            />
          </TabsContent>

          <TabsContent value="consistencia" className="page-enter">
            <PackageConsistencyReport />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShoppingCart, Wallet, History } from 'lucide-react';
import { SaleForm } from '@/components/caixa/SaleForm';
import { CashRegisterPanel } from '@/components/caixa/CashRegisterPanel';
import { CashRegisterHistory } from '@/components/caixa/CashRegisterHistory';
import { useCashRegisters } from '@/hooks/useCashRegisters';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { LiveCashTotalsBar } from '@/components/shared/LiveCashTotalsBar';
import { useLogAccessOnMount } from '@/hooks/useLogAccess';

export default function Caixa() {
  useLogAccessOnMount({ module: 'caixa', action: 'view', fieldsViewed: ['sale', 'amount', 'payment_method', 'client', 'opening_balance', 'closing_balance', 'history'] });
  const { closedRegisters, isLoading } = useCashRegisters();
  const [activeTab, setActiveTab] = useLocalStorage('caixa-tab', 'vendas');

  // Migrate old saved tab if user had "consistencia" selected
  const safeTab = activeTab === 'consistencia' ? 'vendas' : activeTab;

  return (
    <AppLayout title="Caixa" subtitle="Vendas e controle financeiro">
      <div className="space-y-4 page-enter">
        <LiveCashTotalsBar />
        <Tabs value={safeTab} onValueChange={setActiveTab} className="space-y-4">
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
        </Tabs>
      </div>
    </AppLayout>
  );
}

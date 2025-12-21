import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShoppingCart, Wallet, History, AlertTriangle } from 'lucide-react';
import { SaleForm } from '@/components/caixa/SaleForm';
import { CashRegisterPanel } from '@/components/caixa/CashRegisterPanel';
import { CashRegisterHistory } from '@/components/caixa/CashRegisterHistory';
import { PackageConsistencyReport } from '@/components/caixa/PackageConsistencyReport';
import { useCashRegisters } from '@/hooks/useCashRegisters';

export default function Caixa() {
  const { closedRegisters, isLoading } = useCashRegisters();

  return (
    <AppLayout title="Caixa" subtitle="Vendas e controle financeiro">
      <div className="space-y-6">
        <Tabs defaultValue="vendas" className="space-y-4">
          <TabsList>
            <TabsTrigger value="vendas" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Nova Venda
            </TabsTrigger>
            <TabsTrigger value="caixa" className="gap-2">
              <Wallet className="h-4 w-4" />
              Controle do Caixa
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
            <TabsTrigger value="consistencia" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Consistência
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vendas">
            <SaleForm />
          </TabsContent>

          <TabsContent value="caixa">
            <CashRegisterPanel />
          </TabsContent>

          <TabsContent value="historico">
            <CashRegisterHistory 
              closedRegisters={closedRegisters} 
              isLoading={isLoading} 
            />
          </TabsContent>

          <TabsContent value="consistencia">
            <PackageConsistencyReport />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

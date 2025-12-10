import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  ShoppingCart, 
  Package, 
  User, 
  CreditCard, 
  Clock, 
  CalendarDays,
  CheckCircle,
  Sparkles
} from 'lucide-react';
import { useServicePackages } from '@/hooks/useServicePackages';
import { useClients } from '@/hooks/useClients';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  cash: 'Dinheiro',
  bank_transfer: 'Transferência',
  installments: 'Parcelado',
};

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'bank_transfer', label: 'Transferência Bancária' },
  { value: 'installments', label: 'Parcelado' },
];

export default function Caixa() {
  const { packages, refetch: refetchPackages } = useServicePackages();
  const { clients } = useClients();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  // Filter packages that don't have a client assigned yet (available for sale)
  const availablePackages = packages.filter(pkg => !pkg.client_id && pkg.is_active);
  
  // Packages that have been sold (have a client)
  const soldPackages = packages.filter(pkg => pkg.client_id && pkg.is_active);

  const currentPackage = availablePackages.find(pkg => pkg.id === selectedPackage);

  const togglePaymentMethod = (method: string) => {
    if (selectedPaymentMethods.includes(method)) {
      setSelectedPaymentMethods(prev => prev.filter(m => m !== method));
    } else {
      setSelectedPaymentMethods(prev => [...prev, method]);
    }
  };

  const handleSale = async () => {
    if (!selectedPackage || !selectedClient || selectedPaymentMethods.length === 0) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('service_packages')
        .update({
          client_id: selectedClient,
          payment_methods: selectedPaymentMethods,
          payment_method: selectedPaymentMethods[0],
        })
        .eq('id', selectedPackage);

      if (error) throw error;

      toast.success('Venda realizada com sucesso!');
      setShowSuccessDialog(true);
      setSelectedPackage(null);
      setSelectedClient('');
      setSelectedPaymentMethods([]);
      refetchPackages();
    } catch (error: any) {
      toast.error('Erro ao processar venda: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetSale = () => {
    setSelectedPackage(null);
    setSelectedClient('');
    setSelectedPaymentMethods([]);
    setShowSuccessDialog(false);
  };

  return (
    <AppLayout title="Caixa" subtitle="Realize vendas de pacotes para clientes">
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Available Packages */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Pacotes Disponíveis
                </CardTitle>
                <CardDescription>
                  Selecione um pacote para vender
                </CardDescription>
              </CardHeader>
              <CardContent>
                {availablePackages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum pacote disponível para venda</p>
                    <p className="text-sm">Crie pacotes na aba Serviços</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {availablePackages.map(pkg => (
                      <Card
                        key={pkg.id}
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          selectedPackage === pkg.id
                            ? 'ring-2 ring-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedPackage(pkg.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold">{pkg.name}</h3>
                            {selectedPackage === pkg.id && (
                              <CheckCircle className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          {pkg.description && (
                            <p className="text-sm text-muted-foreground mb-3">{pkg.description}</p>
                          )}
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <CalendarDays className="h-4 w-4" />
                              <span>{pkg.total_sessions} sessões</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span>{pkg.duration || 60} min cada</span>
                            </div>
                            {pkg.professional && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <User className="h-4 w-4" />
                                <span>{pkg.professional.name}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-3 pt-3 border-t">
                            <span className="text-lg font-bold text-primary">
                              R$ {Number(pkg.total_price).toFixed(2)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Sales */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Vendas Recentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {soldPackages.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Nenhuma venda realizada ainda</p>
                ) : (
                  <div className="space-y-3">
                    {soldPackages.slice(0, 5).map(pkg => (
                      <div
                        key={pkg.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div>
                          <p className="font-medium">{pkg.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {pkg.client?.name} • {pkg.total_sessions} sessões
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">R$ {Number(pkg.total_price).toFixed(2)}</p>
                          <div className="flex gap-1 mt-1">
                            {(pkg.payment_methods || [pkg.payment_method]).filter(Boolean).map((method: string) => (
                              <Badge key={method} variant="secondary" className="text-xs">
                                {PAYMENT_LABELS[method] || method}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sale Panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Finalizar Venda
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentPackage ? (
                  <>
                    <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                      <h3 className="font-semibold">{currentPackage.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {currentPackage.total_sessions} sessões • {currentPackage.duration || 60} min
                      </p>
                      <p className="text-2xl font-bold text-primary mt-2">
                        R$ {Number(currentPackage.total_price).toFixed(2)}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Cliente *</Label>
                      <Select value={selectedClient} onValueChange={setSelectedClient}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map(client => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name} - {client.phone}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Forma de Pagamento *</Label>
                      <div className="flex flex-wrap gap-2">
                        {PAYMENT_METHODS.map(method => (
                          <Badge
                            key={method.value}
                            variant={selectedPaymentMethods.includes(method.value) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => togglePaymentMethod(method.value)}
                          >
                            {method.label}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleSale}
                      disabled={isProcessing || !selectedClient || selectedPaymentMethods.length === 0}
                    >
                      {isProcessing ? 'Processando...' : 'Confirmar Venda'}
                    </Button>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Selecione um pacote para iniciar a venda</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
              Venda Realizada!
            </DialogTitle>
            <DialogDescription>
              O pacote foi vendido com sucesso. O cliente agora pode agendar suas sessões.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={resetSale}>
              Nova Venda
            </Button>
            <Button onClick={() => setShowSuccessDialog(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

import { useState, useMemo, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { User, Package, ShoppingCart, Plus, Trash2, Tag, Check } from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useServices } from '@/hooks/useServices';
import { usePackageTemplates } from '@/hooks/usePackageTemplates';
import { useProducts, Product } from '@/hooks/useProducts';
import { useProfessionals } from '@/hooks/useProfessionals';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useCashRegisters } from '@/hooks/useCashRegisters';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface SaleItem {
  id: string;
  type: 'product' | 'service' | 'package';
  name: string;
  unitPrice: number;
  quantity: number;
  total: number;
  professionalId?: string;
  originalId: string;
}

interface SaleInfo {
  code: string;
  date: Date;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
}

interface PaymentEntry {
  id: string;
  date: string;
  methodId: string;
  amount: number;
}

export function SaleForm() {
  const queryClient = useQueryClient();
  const { clients } = useClients();
  const { activeServices } = useServices();
  const { templates: packageTemplates } = usePackageTemplates();
  const { activeProducts } = useProducts();
  const { professionals } = useProfessionals();
  const { paymentMethods } = usePaymentMethods();
  const { currentOpenRegister } = useCashRegisters();

  // Client selection
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const clientInputRef = useRef<HTMLInputElement>(null);

  // Item selection
  const [itemType, setItemType] = useState<'product' | 'service' | 'package'>('service');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);

  // Sale state
  const [saleInfo, setSaleInfo] = useState<SaleInfo | null>(null);
  const [discount, setDiscount] = useState(0);
  
  // Payment state
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedClient = useMemo(() => 
    clients.find(c => c.id === selectedClientId),
    [clients, selectedClientId]
  );

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return [];
    const search = clientSearch.toLowerCase();
    return clients.filter(c => 
      c.is_active && c.name.toLowerCase().includes(search)
    ).slice(0, 5);
  }, [clients, clientSearch]);

  const availableItems = useMemo(() => {
    switch (itemType) {
      case 'product':
        return activeProducts.map(p => ({
          id: p.id,
          name: p.name,
          price: p.unit_price,
          type: 'product' as const
        }));
      case 'service':
        return activeServices.map(s => ({
          id: s.id,
          name: s.name,
          price: s.price,
          type: 'service' as const
        }));
      case 'package':
        return packageTemplates.map(p => ({
          id: p.id,
          name: p.name,
          price: p.price,
          type: 'package' as const
        }));
      default:
        return [];
    }
  }, [itemType, activeProducts, activeServices, packageTemplates]);

  const selectedItem = useMemo(() => 
    availableItems.find(i => i.id === selectedItemId),
    [availableItems, selectedItemId]
  );

  const itemTotal = useMemo(() => 
    (selectedItem?.price || 0) * quantity,
    [selectedItem, quantity]
  );

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clientInputRef.current && !clientInputRef.current.contains(e.target as Node)) {
        setShowClientSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectClient = (client: typeof clients[0]) => {
    setSelectedClientId(client.id);
    setClientSearch(client.name);
    setShowClientSuggestions(false);
  };

  const handleAddItem = () => {
    if (!selectedItem) {
      toast.error('Selecione um item');
      return;
    }

    const newItem: SaleItem = {
      id: crypto.randomUUID(),
      type: itemType,
      name: selectedItem.name,
      unitPrice: selectedItem.price,
      quantity,
      total: itemTotal,
      professionalId: selectedProfessionalId || undefined,
      originalId: selectedItem.id,
    };

    if (saleInfo) {
      const newItems = [...saleInfo.items, newItem];
      const subtotal = newItems.reduce((sum, item) => sum + item.total, 0);
      setSaleInfo({
        ...saleInfo,
        items: newItems,
        subtotal,
        total: subtotal - saleInfo.discount,
      });
    } else {
      const code = `V${Date.now().toString().slice(-8)}`;
      setSaleInfo({
        code,
        date: new Date(),
        items: [newItem],
        subtotal: itemTotal,
        discount: 0,
        total: itemTotal,
      });
    }

    // Reset item selection
    setSelectedItemId('');
    setQuantity(1);
    setSelectedProfessionalId('');
  };

  const handleRemoveItem = (itemId: string) => {
    if (!saleInfo) return;

    const newItems = saleInfo.items.filter(i => i.id !== itemId);
    if (newItems.length === 0) {
      setSaleInfo(null);
      setPayments([]);
    } else {
      const subtotal = newItems.reduce((sum, item) => sum + item.total, 0);
      setSaleInfo({
        ...saleInfo,
        items: newItems,
        subtotal,
        total: subtotal - saleInfo.discount,
      });
    }
  };

  const handleDiscountChange = (value: number) => {
    if (!saleInfo) return;
    const newDiscount = Math.min(value, saleInfo.subtotal);
    setDiscount(newDiscount);
    setSaleInfo({
      ...saleInfo,
      discount: newDiscount,
      total: saleInfo.subtotal - newDiscount,
    });
  };

  const addPaymentEntry = () => {
    const defaultMethod = paymentMethods.find(m => m.is_active);
    setPayments([
      ...payments,
      {
        id: crypto.randomUUID(),
        date: format(new Date(), 'yyyy-MM-dd'),
        methodId: defaultMethod?.id || '',
        amount: saleInfo ? saleInfo.total - payments.reduce((s, p) => s + p.amount, 0) : 0,
      }
    ]);
  };

  const updatePayment = (id: string, field: keyof PaymentEntry, value: string | number) => {
    setPayments(payments.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const removePayment = (id: string) => {
    setPayments(payments.filter(p => p.id !== id));
  };

  const totalPayments = useMemo(() => 
    payments.reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const handleFinalizeSale = async (paymentId: string) => {
    if (!saleInfo || !selectedClientId) {
      toast.error('Selecione um cliente e adicione itens à venda');
      return;
    }

    const payment = payments.find(p => p.id === paymentId);
    if (!payment || payment.amount <= 0) {
      toast.error('Valor de pagamento inválido');
      return;
    }

    const paymentMethod = paymentMethods.find(m => m.id === payment.methodId);
    if (!paymentMethod) {
      toast.error('Selecione uma forma de pagamento');
      return;
    }

    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Create single_sales record for each item
      for (const item of saleInfo.items) {
        const itemDiscount = saleInfo.discount * (item.total / saleInfo.subtotal);
        const itemFinal = item.total - itemDiscount;

        const saleData: any = {
          client_id: selectedClientId,
          original_amount: item.total,
          discount_amount: itemDiscount,
          final_amount: itemFinal,
          payment_method_id: payment.methodId,
          sale_date: format(new Date(payment.date), 'yyyy-MM-dd'),
          item_type: item.type,
          description: item.name,
          notes: `Venda ${saleInfo.code} - Qtd: ${item.quantity}`,
          paid_at: new Date().toISOString(),
          paid_by: user?.id,
          created_by: user?.id,
        };

        if (item.type === 'service') {
          saleData.service_id = item.originalId;
        } else if (item.type === 'package') {
          saleData.package_id = item.originalId;
        }

        const { data: saleRecord, error: saleError } = await supabase
          .from('single_sales')
          .insert(saleData)
          .select()
          .single();

        if (saleError) throw saleError;

        // Create client_services for services
        if (item.type === 'service') {
          for (let i = 0; i < item.quantity; i++) {
            await supabase.from('client_services').insert({
              client_id: selectedClientId,
              service_id: item.originalId,
              sale_id: saleRecord.id,
              amount_paid: itemFinal / item.quantity,
              status: 'available',
              created_by: user?.id,
            });
          }
        }

        // Create service_packages for packages
        if (item.type === 'package') {
          const template = packageTemplates.find(t => t.id === item.originalId);
          if (template) {
            for (let i = 0; i < item.quantity; i++) {
              await supabase.from('service_packages').insert({
                client_id: selectedClientId,
                template_id: template.id,
                name: template.name,
                description: template.description,
                total_price: template.price,
                total_sessions: template.total_sessions,
                duration: template.duration,
                interval_days: template.interval_days,
                professional_id: item.professionalId || template.professional_id,
                room_id: template.room_id,
                equipment: template.equipment,
                payment_methods: [paymentMethod.name],
                is_active: true,
              });
            }
          }
        }
      }

      // Create financial entry (RECEITA)
      await supabase.from('financial_entries').insert({
        type: 'income',
        description: `Venda ${saleInfo.code} - ${selectedClient?.name}`,
        amount: payment.amount,
        due_date: payment.date,
        paid_date: payment.date,
        status: 'paid',
        payment_method_id: payment.methodId,
        client_id: selectedClientId,
        created_by: user?.id,
      });

      // Create cash transaction if register is open
      if (currentOpenRegister) {
        await supabase.from('cash_transactions').insert({
          cash_register_id: currentOpenRegister.id,
          type: 'income',
          category: 'sale',
          description: `Venda ${saleInfo.code} - ${selectedClient?.name}`,
          amount: payment.amount,
          payment_method: paymentMethod.name,
          created_by: user?.id,
        });
      }

      // Mark payment as processed
      setPayments(payments.filter(p => p.id !== paymentId));

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['client_services'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });

      toast.success('Pagamento lançado no financeiro com sucesso!');

      // If no more payments pending, reset sale
      if (payments.length <= 1) {
        resetSale();
      }
    } catch (error: any) {
      toast.error('Erro ao processar venda: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetSale = () => {
    setSaleInfo(null);
    setDiscount(0);
    setPayments([]);
    setSelectedClientId(null);
    setClientSearch('');
    setSelectedItemId('');
    setQuantity(1);
    setSelectedProfessionalId('');
  };

  return (
    <div className="space-y-4">
      {/* Client Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative" ref={clientInputRef}>
            <Input
              placeholder="Digite o nome do cliente..."
              value={clientSearch}
              onChange={(e) => {
                setClientSearch(e.target.value);
                setShowClientSuggestions(true);
                if (!e.target.value) setSelectedClientId(null);
              }}
              onFocus={() => setShowClientSuggestions(true)}
            />
            {showClientSuggestions && filteredClients.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                {filteredClients.map((client) => (
                  <button
                    key={client.id}
                    className="w-full px-3 py-2 text-left hover:bg-accent flex items-center justify-between"
                    onClick={() => handleSelectClient(client)}
                  >
                    <span>{client.name}</span>
                    <span className="text-xs text-muted-foreground">{client.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedClient && (
            <Badge variant="secondary" className="mt-2">
              <Check className="h-3 w-3 mr-1" />
              {selectedClient.name} selecionado
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Item Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Produtos / Serviços / Pacotes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={itemType === 'product' ? 'default' : 'outline'}
              onClick={() => { setItemType('product'); setSelectedItemId(''); }}
              className="w-full"
            >
              Produtos
            </Button>
            <Button
              variant={itemType === 'service' ? 'default' : 'outline'}
              onClick={() => { setItemType('service'); setSelectedItemId(''); }}
              className="w-full"
            >
              Serviços
            </Button>
            <Button
              variant={itemType === 'package' ? 'default' : 'outline'}
              onClick={() => { setItemType('package'); setSelectedItemId(''); }}
              className="w-full"
            >
              Pacotes
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Item</Label>
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} - R$ {item.price.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={selectedProfessionalId} onValueChange={setSelectedProfessionalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {professionals.filter(p => p.is_active).map((prof) => (
                    <SelectItem key={prof.id} value={prof.id}>
                      {prof.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>

            <div className="space-y-2">
              <Label>Valor Total</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={`R$ ${itemTotal.toFixed(2)}`}
                  className="bg-muted"
                />
                <Button onClick={handleAddItem} disabled={!selectedItemId}>
                  <Plus className="h-4 w-4" />
                  Incluir
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sale Info */}
      {saleInfo && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Informações da Venda
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Código:</span>{' '}
                <span className="font-medium">{saleInfo.code}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Data:</span>{' '}
                <span className="font-medium">
                  {format(saleInfo.date, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </span>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saleInfo.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {item.type === 'product' ? 'Produto' : 
                         item.type === 'service' ? 'Serviço' : 'Pacote'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">R$ {item.unitPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium">R$ {item.total.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex justify-end gap-8 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Label>Desconto:</Label>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">R$</span>
                  <Input
                    type="number"
                    min={0}
                    max={saleInfo.subtotal}
                    value={discount}
                    onChange={(e) => handleDiscountChange(parseFloat(e.target.value) || 0)}
                    className="w-24"
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Subtotal: R$ {saleInfo.subtotal.toFixed(2)}</div>
                <div className="text-xl font-bold">Total: R$ {saleInfo.total.toFixed(2)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Methods */}
      {saleInfo && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Formas de Pagamento
              </CardTitle>
              <Button size="sm" variant="outline" onClick={addPaymentEntry}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Pagamento
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Clique em "Adicionar Pagamento" para registrar as formas de pagamento
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data da Baixa</TableHead>
                    <TableHead>Forma de Pagamento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <Input
                          type="date"
                          value={payment.date}
                          onChange={(e) => updatePayment(payment.id, 'date', e.target.value)}
                          className="w-40"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={payment.methodId}
                          onValueChange={(v) => updatePayment(payment.id, 'methodId', v)}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentMethods.filter(m => m.is_active).map((method) => (
                              <SelectItem key={method.id} value={method.id}>
                                {method.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={payment.amount}
                          onChange={(e) => updatePayment(payment.id, 'amount', parseFloat(e.target.value) || 0)}
                          className="w-32 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleFinalizeSale(payment.id)}
                            disabled={isProcessing || !payment.methodId || payment.amount <= 0}
                          >
                            {isProcessing ? 'Processando...' : 'Lançar no Financeiro'}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removePayment(payment.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            
            {payments.length > 0 && (
              <div className="flex justify-between items-center pt-4 border-t mt-4">
                <div className="text-sm text-muted-foreground">
                  Total a pagar: R$ {saleInfo.total.toFixed(2)}
                </div>
                <div className="text-sm">
                  Lançado: R$ {totalPayments.toFixed(2)} | 
                  Restante: R$ {(saleInfo.total - totalPayments).toFixed(2)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

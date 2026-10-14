import { cardFeePercentage } from '@/lib/cardBrandVariants';
import { useState, useMemo, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Separator } from '@/components/ui/separator';
import { User, Package, ShoppingCart, Plus, Trash2, Check, CreditCard, Calendar, AlertTriangle, Wallet, FileText } from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useServices } from '@/hooks/useServices';
import { usePackageTemplates } from '@/hooks/usePackageTemplates';
import { useProducts, Product } from '@/hooks/useProducts';
import { useProfessionals } from '@/hooks/useProfessionals';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useCardBrands } from '@/hooks/useCardBrands';
import { useBanks } from '@/hooks/useBanks';
import { useCashRegisters } from '@/hooks/useCashRegisters';
import { submitMultiItemSale } from '@/lib/multiItemSale';
import { humanizeError } from '@/lib/humanError';
import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { syncAfter } from '@/lib/domainSync';
import { formatCurrency, normalizeBrazilianCurrency } from '@/lib/utils';
import { getClientCreditPaymentLimit, isClientCreditPaymentMethod, showClientCreditValidationToast, validateClientCreditPayment } from '@/lib/clientCreditPayment';

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

export function SaleForm() {
  const queryClient = useQueryClient();
  const { clients } = useClients();
  const { activeServices } = useServices();
  const { templates: packageTemplates } = usePackageTemplates();
  const { productsForSale } = useProducts();
  const { professionals } = useProfessionals();
  const { activePaymentMethods } = usePaymentMethods();
  const { activeCardBrands } = useCardBrands();
  const { activeBanks } = useBanks();
  const { currentOpenRegister } = useCashRegisters();
  // Pacotes vendidos precisam ficar visíveis para a equipe operar a agenda;
  // quem tem permissão de compartilhar grava 'clinic', senão o banco aplica o padrão.
  const requestRef = useRef<{ payload: string; id: string } | null>(null);
  const processingRef = useRef(false);

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
  
  // Payment state - with card brand support
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [cardBrandId, setCardBrandId] = useState<string>('');
  const [installments, setInstallments] = useState<number>(1);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [cardFeeAmount, setCardFeeAmount] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Boleto installment state
  const [boletoInstallments, setBoletoInstallments] = useState<number>(1);
  const [boletoFirstDueDate, setBoletoFirstDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Cheque state
  const [chequeBank, setChequeBank] = useState('');
  const [chequeCashDate, setChequeCashDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [chequeNumber, setChequeNumber] = useState('');

  // Cash change (troco) state
  const [cashReceived, setCashReceived] = useState<number>(0);
  const [changeMethod, setChangeMethod] = useState<'cash' | 'pix' | 'credit'>('cash');

  // Get selected payment method details
  const selectedPaymentMethod = useMemo(
    () => activePaymentMethods.find(m => m.id === paymentMethodId),
    [activePaymentMethods, paymentMethodId]
  );

  // Determine if it's a card payment
  const isCardPayment = useMemo(() => {
    if (!selectedPaymentMethod) return false;
    const name = selectedPaymentMethod.name.toLowerCase();
    if (isClientCreditPaymentMethod(name)) return false;
    return name.includes('crédito') || name.includes('débito') || name.includes('cartão');
  }, [selectedPaymentMethod]);

  const isCreditCard = useMemo(() => {
    if (!selectedPaymentMethod) return false;
    const name = selectedPaymentMethod.name.toLowerCase();
    if (isClientCreditPaymentMethod(name)) return false;
    return name.includes('crédito');
  }, [selectedPaymentMethod]);

  const isDebitCard = useMemo(() => {
    if (!selectedPaymentMethod) return false;
    return selectedPaymentMethod.name.toLowerCase().includes('débito');
  }, [selectedPaymentMethod]);

  // Detect boleto payment
  const isBoleto = useMemo(() => {
    if (!selectedPaymentMethod) return false;
    const name = selectedPaymentMethod.name.toLowerCase();
    return name.includes('boleto');
  }, [selectedPaymentMethod]);

  // Detect "Crédito ao Cliente" payment method
  const isClientCreditPayment = useMemo(() => {
    if (!selectedPaymentMethod) return false;
    return isClientCreditPaymentMethod(selectedPaymentMethod.name);
  }, [selectedPaymentMethod]);

  // Detect cheque
  const isCheque = useMemo(() => {
    if (!selectedPaymentMethod) return false;
    return selectedPaymentMethod.name.toLowerCase().includes('cheque');
  }, [selectedPaymentMethod]);

  // Detect cash (dinheiro)
  const isDinheiro = useMemo(() => {
    if (!selectedPaymentMethod) return false;
    return selectedPaymentMethod.name.toLowerCase().includes('dinheiro');
  }, [selectedPaymentMethod]);

  // Detect PIX or transfer
  const isPixOrTransfer = useMemo(() => {
    if (!selectedPaymentMethod) return false;
    const name = selectedPaymentMethod.name.toLowerCase();
    return name.includes('pix') || name.includes('transferência') || name.includes('transferencia');
  }, [selectedPaymentMethod]);

  // Cash change amount
  const changeAmount = useMemo(() => {
    if (!isDinheiro || !saleInfo) return 0;
    return Math.max(0, cashReceived - saleInfo.total);
  }, [isDinheiro, cashReceived, saleInfo?.total]);

  // Get applicable card brands
  const applicableCardBrands = useMemo(() => {
    if (isCreditCard) {
      return activeCardBrands.filter(b => b.type === 'credit' || b.type === 'both');
    }
    if (isDebitCard) {
      return activeCardBrands.filter(b => b.type === 'debit' || b.type === 'both');
    }
    return activeCardBrands;
  }, [activeCardBrands, isCreditCard, isDebitCard]);

  // Get selected card brand
  const selectedCardBrand = useMemo(
    () => activeCardBrands.find(b => b.id === cardBrandId),
    [activeCardBrands, cardBrandId]
  );

  // Calculate fee based on card brand and installments
  const feeInfo = useMemo(() => {
    if (!selectedCardBrand || !saleInfo?.total) {
      return { feePercentage: 0, feeAmount: 0, netAmount: saleInfo?.total || 0, totalWithFee: saleInfo?.total || 0 };
    }

    const baseAmount = saleInfo.total;
    const fees = selectedCardBrand.fees || [];
    let feePercentage = 0;

    void fees;
    feePercentage = cardFeePercentage(selectedCardBrand, installments);

    const feeAmount = (baseAmount * feePercentage) / 100;
    
    // If add_to_client, the client pays the fee (total + fee)
    // If deduct_from_provider, the client pays the base amount (total)
    const totalWithFee = selectedCardBrand.fee_behavior === 'add_to_client'
      ? baseAmount + feeAmount
      : baseAmount;
    
    const netAmount = selectedCardBrand.fee_behavior === 'deduct_from_provider'
      ? baseAmount - feeAmount
      : baseAmount;

    return { feePercentage, feeAmount, netAmount, totalWithFee };
  }, [selectedCardBrand, saleInfo?.total, installments]);

  // Update payment amount when fee info changes
  useEffect(() => {
    if (selectedCardBrand && feeInfo.totalWithFee > 0) {
      // Update the payment amount to include the fee when it's added to client
      setPaymentAmount(feeInfo.totalWithFee);
    }
    setCardFeeAmount(feeInfo.feeAmount);
  }, [feeInfo, selectedCardBrand]);

  // Reset card options when payment method changes
  useEffect(() => {
    if (!isCardPayment) {
      setCardBrandId('');
      setInstallments(1);
    }
    if (isDebitCard) {
      setInstallments(1);
    }
  }, [isCardPayment, isDebitCard]);

  // Max installments
  const maxInstallments = useMemo(() => {
    if (!isCardPayment) return 1;
    if (isDebitCard) return 1;
    return selectedPaymentMethod?.max_installments || 12;
  }, [selectedPaymentMethod, isCardPayment, isDebitCard]);

  const selectedClient = useMemo(() => 
    clients.find(c => c.id === selectedClientId),
    [clients, selectedClientId]
  );

  // Client credit balance
  const clientCreditBalance = useMemo(() => {
    return selectedClient?.credit_balance || 0;
  }, [selectedClient]);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return [];
    const search = clientSearch.toLowerCase();
    return clients.filter(c => 
      c.is_active && c.name.toLowerCase().includes(search)
    ).slice(0, 5);
  }, [clients, clientSearch]);

  // Available items based on type - using ALL packages from service_packages
  const availableItems = useMemo(() => {
    switch (itemType) {
      case 'product':
        return productsForSale.map(p => ({
          id: p.id,
          name: p.name,
          price: p.sale_price || p.unit_price,
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
        // Use package_templates for creating new packages
        return packageTemplates.map(p => ({
          id: p.id,
          name: p.name,
          price: p.price,
          type: 'package' as const,
          total_sessions: p.total_sessions,
          duration: p.duration,
          interval_days: p.interval_days,
          professional_id: p.professional_id,
          room_id: p.room_id,
        }));
      default:
        return [];
    }
  }, [itemType, productsForSale, activeServices, packageTemplates]);

  const selectedItem = useMemo(() => 
    availableItems.find(i => i.id === selectedItemId),
    [availableItems, selectedItemId]
  );

  // Auto-fill professional when service or package is selected
  useEffect(() => {
    if (!selectedItemId) {
      setSelectedProfessionalId('');
      return;
    }

    if (itemType === 'service') {
      const service = activeServices.find(s => s.id === selectedItemId);
      if (service?.professional_id) {
        setSelectedProfessionalId(service.professional_id);
      }
    } else if (itemType === 'package') {
      const template = packageTemplates.find(t => t.id === selectedItemId);
      if (template?.professional_id) {
        setSelectedProfessionalId(template.professional_id);
      }
    }
  }, [selectedItemId, itemType, activeServices, packageTemplates]);

  const itemTotal = useMemo(() => 
    (selectedItem?.price || 0) * quantity,
    [selectedItem, quantity]
  );

  // Update payment amount when sale total changes
  useEffect(() => {
    if (saleInfo) {
      setPaymentAmount(saleInfo.total);
    }
  }, [saleInfo?.total]);

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
      setPaymentAmount(0);
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
    const newDiscount = Math.min(normalizeBrazilianCurrency(value), saleInfo.subtotal);
    setDiscount(newDiscount);
    const newTotal = saleInfo.subtotal - newDiscount;
    setSaleInfo({
      ...saleInfo,
      discount: newDiscount,
      total: newTotal,
    });
    setPaymentAmount(newTotal);
  };

  const handleFinalizeSale = async () => {
    if (!saleInfo || !selectedClientId) {
      toast.error('Selecione um cliente e adicione itens à venda');
      return;
    }

    if (!paymentMethodId) {
      toast.error('Selecione uma forma de pagamento');
      return;
    }

    if (paymentAmount <= 0) {
      toast.error('Valor de pagamento inválido');
      return;
    }

    // Validate "Crédito ao Cliente" - only accept up to available balance
    if (isClientCreditPayment) {
      if (clientCreditBalance <= 0) {
        toast.error('Este cliente não possui saldo de crédito disponível!');
        return;
      }
      const creditValidationMessage = validateClientCreditPayment(paymentAmount, clientCreditBalance, saleInfo.total);
      if (showClientCreditValidationToast(creditValidationMessage)) {
        return;
      }
    }

    const paymentMethod = activePaymentMethods.find(m => m.id === paymentMethodId);
    if (!paymentMethod) {
      toast.error('Forma de pagamento inválida');
      return;
    }

    const isClientCredit = isClientCreditPaymentMethod(paymentMethod.name);

    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    try {
      const payload = JSON.stringify({
        client_id: selectedClientId, sale_date: paymentDate,
        payment_method_id: paymentMethodId, discount_amount: saleInfo.discount,
        payment_amount: Math.round(paymentAmount * 100) / 100,
        installments, card_brand_id: cardBrandId || null,
        boleto_installments: boletoInstallments, boleto_first_due_date: boletoFirstDueDate,
        cheque_cash_date: chequeCashDate, cheque_number: chequeNumber, cheque_bank_id: chequeBank || null,
        cash_received: cashReceived, change_method: changeMethod,
        items: saleInfo.items.map(item => ({ type: item.type, source_id: item.originalId,
          quantity: item.quantity, professional_id: item.professionalId || null })),
      });
      if (requestRef.current?.payload !== payload) requestRef.current = { payload, id: crypto.randomUUID() };
      const request = requestRef.current;
      if (!request) throw new Error('Não foi possível preparar a venda.');
      await submitMultiItemSale(JSON.parse(payload), request.id);
      requestRef.current = null;
      syncAfter(queryClient, 'sale');
      toast.success('Venda registrada com sucesso!');
      resetSale();
    } catch (error: unknown) {
      // A lost response can follow a successful commit. Keep the request ID for a safe retry.
      toast.error(humanizeError(error));
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  };

  const resetSale = () => {
    setSaleInfo(null);
    setDiscount(0);
    setSelectedClientId(null);
    setClientSearch('');
    setSelectedItemId('');
    setQuantity(1);
    setSelectedProfessionalId('');
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setPaymentMethodId('');
    setPaymentAmount(0);
    setBoletoInstallments(1);
    setBoletoFirstDueDate(format(new Date(), 'yyyy-MM-dd'));
    setChequeBank('');
    setChequeCashDate(format(new Date(), 'yyyy-MM-dd'));
    setChequeNumber('');
    setCashReceived(0);
    setChangeMethod('cash');
    setCardBrandId('');
    setInstallments(1);
  };

  return (
    <div className="space-y-6">
      {/* Alert when cash register is closed */}
      {!currentOpenRegister && (
        <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <AlertTitle className="text-amber-700 dark:text-amber-400">Caixa Fechado</AlertTitle>
          <AlertDescription className="text-amber-600 dark:text-amber-300">
            Para pagamentos com entrada financeira, abra o caixa primeiro. Pagamentos por crédito ao cliente não entram no caixa.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Sales Form */}
      <Card className={!currentOpenRegister ? 'opacity-90' : ''}>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" />
            Nova Venda
            {!currentOpenRegister && (
              <Badge variant="secondary" className="ml-2 bg-amber-500/20 text-amber-700 dark:text-amber-300">
                <Wallet className="h-3 w-3 mr-1" />
                Caixa fechado
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cliente */}
          <div className="space-y-2">
            <Label className="text-base font-semibold flex items-center gap-2">
              <User className="h-4 w-4" />
              Cliente
            </Label>
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
                className="text-base"
              />
              {showClientSuggestions && filteredClients.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                  {filteredClients.map((client) => (
                    <button
                      key={client.id}
                      className="w-full px-4 py-3 text-left hover:bg-accent flex items-center justify-between"
                      onClick={() => handleSelectClient(client)}
                    >
                      <span className="font-medium">{client.name}</span>
                      <span className="text-sm text-muted-foreground">{client.phone}</span>
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
          </div>

          <Separator />

          {/* Produtos / Serviços / Pacotes */}
          <div className="space-y-4">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Package className="h-4 w-4" />
              Produtos / Serviços / Pacotes
            </Label>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div className="md:col-span-2 space-y-2">
                <Label>Item</Label>
                <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableItems.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Nenhum {itemType === 'product' ? 'produto' : itemType === 'service' ? 'serviço' : 'pacote'} disponível
                      </SelectItem>
                    ) : (
                      availableItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} - {formatCurrency(item.price)}
                        </SelectItem>
                      ))
                    )}
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
                <Label>Valor: {formatCurrency(itemTotal)}</Label>
                <Button onClick={handleAddItem} disabled={!selectedItemId} className="w-full">
                  <Plus className="h-4 w-4 mr-1" />
                  Incluir
                </Button>
              </div>
            </div>
          </div>

          {/* Sale Items Table */}
          {saleInfo && (
            <>
              <Separator />
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Informações da Venda</Label>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Código: <strong className="text-foreground">{saleInfo.code}</strong></span>
                    <span>Data: <strong className="text-foreground">{format(saleInfo.date, "dd/MM/yyyy HH:mm", { locale: ptBR })}</strong></span>
                  </div>
                </div>

                <div className="border rounded-lg">
                  <ResponsiveTable
                    data={saleInfo.items}
                    getRowKey={(item) => item.id}
                    minWidthClassName="min-w-[680px]"
                    emptyMessage="Nenhum item na venda"
                    columns={[
                      {
                        key: 'name',
                        header: 'Item',
                        priority: 'primary',
                        className: 'font-medium',
                        cell: (item) => item.name,
                      },
                      {
                        key: 'type',
                        header: 'Tipo',
                        priority: 'primary',
                        hideLabelOnCard: true,
                        cell: (item) => (
                          <Badge variant="outline">
                            {item.type === 'product' ? 'Produto' : item.type === 'service' ? 'Serviço' : 'Pacote'}
                          </Badge>
                        ),
                      },
                      {
                        key: 'quantity',
                        header: 'Qtd',
                        priority: 'secondary',
                        className: 'text-center',
                        headClassName: 'text-center',
                        cell: (item) => item.quantity,
                      },
                      {
                        key: 'unitPrice',
                        header: 'Unitário',
                        priority: 'secondary',
                        className: 'text-right',
                        headClassName: 'text-right',
                        cell: (item) => formatCurrency(item.unitPrice),
                      },
                      {
                        key: 'total',
                        header: 'Total',
                        priority: 'secondary',
                        className: 'text-right font-medium',
                        headClassName: 'text-right',
                        cell: (item) => formatCurrency(item.total),
                      },
                      {
                        key: 'actions',
                        header: '',
                        priority: 'actions',
                        headClassName: 'w-12',
                        cell: (item) => (
                          <Button size="icon" variant="ghost" onClick={() => handleRemoveItem(item.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        ),
                      },
                    ]}
                  />
                </div>

                <div className="flex justify-between items-center pt-2">
                  <div className="flex items-center gap-4">
                    <Label>Desconto:</Label>
                    <div className="flex items-center gap-1">
                      <CurrencyInput value={discount} onValueChange={handleDiscountChange} className="w-32" />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Subtotal: {formatCurrency(saleInfo.subtotal)}</div>
                    <div className="text-2xl font-bold text-primary">Total: {formatCurrency(saleInfo.total)}</div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Payment Form - With Card Brand Support */}
              <div className="space-y-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Formas de Pagamento
                </Label>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Data da Baixa
                    </Label>
                    <Input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Forma de Pagamento</Label>
                    <Select value={paymentMethodId} onValueChange={(value) => {
                      const methodName = activePaymentMethods.find(m => m.id === value)?.name.toLowerCase() || '';
                      setPaymentMethodId(value);
                      setCardBrandId('');
                      if (isClientCreditPaymentMethod(methodName)) {
                        setPaymentAmount(getClientCreditPaymentLimit(clientCreditBalance, saleInfo.total));
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activePaymentMethods.map((method) => (
                          <SelectItem key={method.id} value={method.id}>
                            {method.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Card Brand Selector - Only show for card payments */}
                  {isCardPayment && (
                    <div className="space-y-2">
                      <Label>Bandeira do Cartão</Label>
                      <Select value={cardBrandId} onValueChange={setCardBrandId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a bandeira..." />
                        </SelectTrigger>
                        <SelectContent>
                          {applicableCardBrands.map((brand) => (
                            <SelectItem key={brand.id} value={brand.id}>
                              {brand.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Installments - Only for credit card */}
                  {isCreditCard && maxInstallments > 1 && (
                    <div className="space-y-2">
                      <Label>Parcelas</Label>
                      <Select 
                        value={installments.toString()} 
                        onValueChange={(v) => setInstallments(parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
                            <SelectItem key={n} value={n.toString()}>
                              {n}x {paymentAmount > 0 && formatCurrency(paymentAmount / n)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Boleto Installments */}
                  {isBoleto && (
                    <>
                      <div className="space-y-2">
                        <Label>Parcelas do Boleto</Label>
                        <Select
                          value={boletoInstallments.toString()}
                          onValueChange={(v) => setBoletoInstallments(parseInt(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                              <SelectItem key={n} value={n.toString()}>
                                {n === 1 ? 'À vista' : `${n}x ${paymentAmount > 0 ? formatCurrency(paymentAmount / n) : ''}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{boletoInstallments > 1 ? '1º Vencimento' : 'Vencimento'}</Label>
                        <Input
                          type="date"
                          value={boletoFirstDueDate}
                          onChange={(e) => setBoletoFirstDueDate(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {/* Cheque Form */}
                  {isCheque && (
                    <>
                      <div className="space-y-2">
                        <Label>Nº do Cheque</Label>
                        <Input
                          placeholder="Número do cheque"
                          value={chequeNumber}
                          onChange={(e) => setChequeNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Banco para Desconto</Label>
                        <Select value={chequeBank} onValueChange={setChequeBank}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o banco..." />
                          </SelectTrigger>
                          <SelectContent>
                            {activeBanks.map((bank) => (
                              <SelectItem key={bank.id} value={bank.id}>
                                {bank.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Data para Descontar</Label>
                        <Input
                          type="date"
                          value={chequeCashDate}
                          onChange={(e) => setChequeCashDate(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {/* Cash (Dinheiro) - Received Amount */}
                  {isDinheiro && saleInfo && (
                    <div className="space-y-2">
                      <Label>Valor Recebido</Label>
                      <CurrencyInput
                        value={cashReceived}
                        onValueChange={(v) => setCashReceived(normalizeBrazilianCurrency(v))}
                      />
                    </div>
                  )}
                </div>

                {/* Boleto Info */}
                {isBoleto && paymentAmount > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-sm p-3 rounded-lg bg-muted/50 border">
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      <FileText className="h-3 w-3 mr-1" />
                      {boletoInstallments === 1 ? 'Boleto à vista' : `${boletoInstallments}x Boleto`}
                    </Badge>
                    {boletoInstallments > 1 && (
                      <span className="text-muted-foreground">
                        Parcela: {formatCurrency(paymentAmount / boletoInstallments)}
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      • {boletoInstallments > 1 ? '1º venc' : 'Venc'}: {format(new Date(boletoFirstDueDate + 'T12:00:00'), 'dd/MM/yyyy')}
                    </span>
                  </div>
                )}

                {/* Cheque Info */}
                {isCheque && chequeBank && (
                  <div className="flex flex-wrap items-center gap-2 text-sm p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <Badge variant="outline" className="border-amber-500/50 text-amber-700">
                      Cheque nº {chequeNumber || 'S/N'}
                    </Badge>
                    <span className="text-muted-foreground">
                      Banco: {activeBanks.find(b => b.id === chequeBank)?.name}
                    </span>
                    <span className="text-muted-foreground">
                      • Descontar em: {format(new Date(chequeCashDate + 'T12:00:00'), 'dd/MM/yyyy')}
                    </span>
                  </div>
                )}

                {/* Cash Change (Troco) */}
                {isDinheiro && saleInfo && changeAmount > 0 && (
                  <div className="p-3 rounded-lg bg-accent/10 border border-accent/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-accent dark:text-accent/80">
                        Troco: {formatCurrency(changeAmount)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={changeMethod === 'cash' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setChangeMethod('cash')}
                      >
                        💵 Dinheiro
                      </Button>
                      <Button
                        type="button"
                        variant={changeMethod === 'pix' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setChangeMethod('pix')}
                      >
                        📱 PIX
                      </Button>
                      <Button
                        type="button"
                        variant={changeMethod === 'credit' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setChangeMethod('credit')}
                      >
                        💳 Crédito ao Cliente
                      </Button>
                    </div>
                  </div>
                )}

                {/* Client Credit Info - when using "Crédito ao Cliente" */}
                {isClientCreditPayment && selectedClient && (
                  <div className={`flex flex-wrap items-center gap-2 text-sm p-3 rounded-lg border ${
                    clientCreditBalance > 0 
                      ? 'bg-primary/10 border-primary/30' 
                      : 'bg-destructive/10 border-destructive/30'
                  }`}>
                    <Badge variant="outline" className={clientCreditBalance > 0 ? 'border-primary/50 text-primary' : 'border-destructive/50 text-destructive'}>
                      <Wallet className="h-3 w-3 mr-1" />
                      Crédito Disponível
                    </Badge>
                    <span className={clientCreditBalance > 0 ? 'text-primary font-medium' : 'text-destructive font-medium'}>
                      {formatCurrency(clientCreditBalance)}
                    </span>
                    {clientCreditBalance > 0 && paymentAmount > clientCreditBalance && (
                      <span className="text-destructive text-xs">
                        ⚠ Valor excede o crédito disponível
                      </span>
                    )}
                  </div>
                )}

                {/* Card Fee Information */}
                {selectedCardBrand && feeInfo.feePercentage > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-sm p-3 rounded-lg bg-muted/50 border">
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      Taxa {selectedCardBrand.name}: {feeInfo.feePercentage.toFixed(2)}%
                    </Badge>
                    <span className="text-muted-foreground">
                      Valor da taxa: {formatCurrency(feeInfo.feeAmount)}
                    </span>
                    {selectedCardBrand.fee_behavior === 'add_to_client' && (
                      <span className="text-foreground font-medium">
                        • Cliente paga: <strong className="text-primary">{formatCurrency(feeInfo.totalWithFee)}</strong>
                      </span>
                    )}
                    {selectedCardBrand.fee_behavior === 'deduct_from_provider' && (
                      <span className="text-muted-foreground">
                        • Valor líquido: <strong className="text-foreground">{formatCurrency(feeInfo.netAmount)}</strong>
                      </span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <div className="space-y-2">
                    <Label>Valor {isClientCreditPayment ? `(máx: ${formatCurrency(clientCreditBalance)})` : ''}</Label>
                    <CurrencyInput
                      value={paymentAmount}
                      onValueChange={(nextValue) => {
                        const normalizedValue = normalizeBrazilianCurrency(nextValue);
                        setPaymentAmount(isClientCreditPayment ? Math.min(normalizedValue, getClientCreditPaymentLimit(clientCreditBalance, saleInfo.total)) : normalizedValue);
                      }}
                    />
                  </div>
                  
                  <Button 
                    onClick={handleFinalizeSale}
                    disabled={isProcessing || !paymentMethodId || paymentAmount <= 0 || (isClientCreditPayment && paymentAmount > clientCreditBalance)}
                    size="lg"
                    className="h-10"
                  >
                    {isProcessing ? 'Processando...' : 'Lançar no Financeiro'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

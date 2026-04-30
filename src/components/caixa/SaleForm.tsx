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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
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

    const sortedFees = [...fees].sort((a, b) => b.installment_number - a.installment_number);
    const matchingFee = sortedFees.find(f => f.installment_number <= installments);
    
    if (matchingFee) {
      feePercentage = matchingFee.fee_percentage;
    }

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

    if (!currentOpenRegister && !isClientCredit) {
      toast.error('É necessário abrir o caixa antes de realizar vendas!');
      return;
    }

    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Create single_sales record for each item
      // Calculate the fee proportion for each item if there's a card fee
      const totalItems = saleInfo.items.length;
      const feePerItem = feeInfo.feeAmount / totalItems;
      const totalWithFeeToUse = selectedCardBrand?.fee_behavior === 'add_to_client' 
        ? feeInfo.totalWithFee 
        : saleInfo.total;
      
      for (const item of saleInfo.items) {
        const itemDiscount = saleInfo.discount * (item.total / saleInfo.subtotal);
        let itemFinal = item.total - itemDiscount;
        
        // If fee should be added to client, include the proportional fee in the item
        if (selectedCardBrand?.fee_behavior === 'add_to_client' && feeInfo.feeAmount > 0) {
          const itemFeeShare = (item.total / saleInfo.subtotal) * feeInfo.feeAmount;
          itemFinal = itemFinal + itemFeeShare;
        }

        const saleData: any = {
          client_id: selectedClientId,
          original_amount: item.total,
          discount_amount: itemDiscount,
          final_amount: itemFinal,
          card_fee_amount: selectedCardBrand ? (item.total / saleInfo.subtotal) * feeInfo.feeAmount : 0,
          installments: installments,
          payment_method_id: paymentMethodId,
          sale_date: paymentDate,
          item_type: item.type,
          description: item.name,
          notes: `Venda ${saleInfo.code} - Qtd: ${item.quantity}${selectedCardBrand ? ` - ${selectedCardBrand.name} ${installments}x` : ''}`,
          paid_at: new Date().toISOString(),
          paid_by: user?.id,
          created_by: user?.id,
        };

        if (item.type === 'service') {
          saleData.service_id = item.originalId;
        }
        // Note: package_id will be set after creating the service_package

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

        // For packages: Create service_package for the client with payment_methods set
        if (item.type === 'package') {
          const template = packageTemplates.find(t => t.id === item.originalId);
          if (template) {
            // Create service_package for the client
            const { data: newPackage, error: pkgError } = await (supabase as any)
              .from('service_packages')
              .insert({
                name: template.name,
                client_id: selectedClientId,
                template_id: template.id,
                total_sessions: template.total_sessions,
                duration: template.duration || 60,
                interval_days: template.interval_days || 7,
                total_price: template.price,
                package_type: template.package_type || 'standard',
                professional_id: template.professional_id,
                room_id: template.room_id,
                equipment: template.equipment || [],
                payment_methods: [paymentMethod.name],
                sessions_scheduled: 0,
                is_active: true,
              })
              .select()
              .single();

            if (pkgError) throw pkgError;

            // Create package_appointments for all sessions
            const templateSteps = template.package_type === 'sequential' && template.steps?.length
              ? template.steps
              : Array.from({ length: template.total_sessions }, (_, i) => ({
                  service_id: null,
                  interval_after_days: template.interval_days || 7,
                  sequence_order: i + 1,
                }));

            const sessions = templateSteps.map((step: any, i: number) => ({
              package_id: newPackage.id,
              service_id: step.service_id || template.service_id || null,
              session_number: i + 1,
              original_session_number: i + 1,
              sequence_order: step.sequence_order || i + 1,
              interval_after_days: i === templateSteps.length - 1 ? 0 : step.interval_after_days || template.interval_days || 7,
              status: 'pending',
            }));

            await (supabase as any).from('package_appointments').insert(sessions);

            // Update single_sales with package_id
            await supabase
              .from('single_sales')
              .update({ package_id: newPackage.id })
              .eq('id', saleRecord.id);

            console.log(`Package created with payment_methods for client ${selectedClientId}:`, newPackage.id);
          }
        }

        // Decrement product stock for product sales
        if (item.type === 'product') {
          const product = productsForSale.find(p => p.id === item.originalId);
          if (product) {
            await supabase.from('products').update({
              current_stock: Math.max(0, product.current_stock - item.quantity),
            }).eq('id', item.originalId);
          }
        }
      }

      // Create financial entry only for real money payments. Client credit is non-cash.
      // Build description with item names for financial entry
      const financialItemNames = saleInfo.items.map(item => item.name).join(', ');
      const financialDescription = isBoleto && boletoInstallments > 1
        ? `Parcelamento Boleto Bancário ${boletoInstallments}x: ${financialItemNames} - ${selectedClient?.name}`
        : `Venda: ${financialItemNames} - ${selectedClient?.name}`;
      
      if (!isClientCredit) {
        if (isBoleto && boletoInstallments > 1) {
          // For boleto installments, create one receivable per installment
          const installmentAmount = Math.round((paymentAmount / boletoInstallments) * 100) / 100;
          const remainder = Math.round((paymentAmount - installmentAmount * boletoInstallments) * 100) / 100;

          for (let i = 0; i < boletoInstallments; i++) {
            const dueDate = new Date(boletoFirstDueDate + 'T12:00:00');
            dueDate.setDate(dueDate.getDate() + i * 30);
            const dueDateStr = format(dueDate, 'yyyy-MM-dd');
            const amt = i === 0 ? installmentAmount + remainder : installmentAmount;

            await supabase.from('financial_entries').insert({
              type: 'receivable',
              description: `Boleto ${i + 1}/${boletoInstallments}: ${financialItemNames} - ${selectedClient?.name} (venc. ${format(dueDate, 'dd/MM/yyyy')})`,
              amount: amt,
              due_date: dueDateStr,
              paid_date: null,
              status: 'pending',
              payment_method_id: paymentMethodId,
              client_id: selectedClientId,
              installments: boletoInstallments,
              created_by: user?.id,
              notes: `Parcelamento no Boleto Bancário ${boletoInstallments}x`,
            });

            // Create reminder for each boleto due date
            await supabase.from('reminders').insert({
              title: `Verificar boleto ${i + 1}/${boletoInstallments}: ${selectedClient?.name}`,
              description: `Boleto de R$ ${amt.toFixed(2)} referente a "${financialItemNames}" vence em ${format(dueDate, 'dd/MM/yyyy')}. Verificar se foi pago e dar baixa no sistema.`,
              reminder_date: dueDateStr,
              reminder_time: '09:00',
              is_recurring: false,
              is_active: true,
              is_completed: false,
              category: 'financeiro',
              priority: 'high',
              created_by: user?.id,
            });
          }
        } else if (isCheque) {
          // Cheque: create receivable as pending until cash date
          await supabase.from('financial_entries').insert({
            type: 'receivable',
            description: `Cheque nº ${chequeNumber || 'S/N'}: ${financialItemNames} - ${selectedClient?.name}`,
            amount: paymentAmount,
            due_date: chequeCashDate,
            paid_date: null,
            status: 'pending',
            payment_method_id: paymentMethodId,
            client_id: selectedClientId,
            created_by: user?.id,
            notes: `Cheque nº ${chequeNumber || 'S/N'} - Banco: ${activeBanks.find(b => b.id === chequeBank)?.name || 'Não informado'} - Descontar em ${format(new Date(chequeCashDate + 'T12:00:00'), 'dd/MM/yyyy')}`,
          });

          // Create reminder for the cash date
          await supabase.from('reminders').insert({
            title: `Descontar cheque: ${selectedClient?.name}`,
            description: `Ir ao banco descontar cheque nº ${chequeNumber || 'S/N'} de R$ ${paymentAmount.toFixed(2)} referente a "${financialItemNames}". Banco: ${activeBanks.find(b => b.id === chequeBank)?.name || 'Não informado'}.`,
            reminder_date: chequeCashDate,
            reminder_time: '08:00',
            is_recurring: false,
            is_active: true,
            is_completed: false,
            category: 'financeiro',
            priority: 'high',
            created_by: user?.id,
          });
        } else if (isBoleto && boletoInstallments === 1) {
          // Boleto à vista: receivable pending until payment confirmed
          await supabase.from('financial_entries').insert({
            type: 'receivable',
            description: `Boleto à vista: ${financialItemNames} - ${selectedClient?.name}`,
            amount: paymentAmount,
            due_date: boletoFirstDueDate,
            paid_date: null,
            status: 'pending',
            payment_method_id: paymentMethodId,
            client_id: selectedClientId,
            created_by: user?.id,
            notes: 'Boleto Bancário à vista',
          });

          // Create reminder
          await supabase.from('reminders').insert({
            title: `Verificar boleto à vista: ${selectedClient?.name}`,
            description: `Boleto à vista de R$ ${paymentAmount.toFixed(2)} referente a "${financialItemNames}" vence em ${format(new Date(boletoFirstDueDate + 'T12:00:00'), 'dd/MM/yyyy')}.`,
            reminder_date: boletoFirstDueDate,
            reminder_time: '09:00',
            is_recurring: false,
            is_active: true,
            is_completed: false,
            category: 'financeiro',
            priority: 'high',
            created_by: user?.id,
          });
        } else {
          // All other methods (Dinheiro, PIX, Transferência, Cartão): immediate paid entry
          const netAmount = selectedCardBrand && selectedCardBrand.fee_behavior === 'deduct_from_provider'
            ? paymentAmount - feeInfo.feeAmount
            : paymentAmount;

          await supabase.from('financial_entries').insert({
            type: 'receivable',
            description: financialDescription,
            amount: netAmount,
            due_date: paymentDate,
            paid_date: paymentDate,
            status: 'paid',
            payment_method_id: paymentMethodId,
            client_id: selectedClientId,
            installments: selectedCardBrand && isCreditCard ? installments : null,
            created_by: user?.id,
            notes: selectedCardBrand ? `Taxa ${selectedCardBrand.name}: ${feeInfo.feePercentage}% = R$ ${feeInfo.feeAmount.toFixed(2)}` : (isDinheiro && changeAmount > 0 ? `Troco: R$ ${changeAmount.toFixed(2)} (${changeMethod === 'cash' ? 'Dinheiro' : changeMethod === 'pix' ? 'PIX' : 'Crédito ao Cliente'})` : null),
          });

          // If card has fee and deducted from provider, register the fee as expense
          if (selectedCardBrand && feeInfo.feeAmount > 0 && selectedCardBrand.fee_behavior === 'deduct_from_provider') {
            await supabase.from('financial_entries').insert({
              type: 'expense',
              description: `Taxa ${selectedCardBrand.name} (${feeInfo.feePercentage}%): ${financialItemNames}`,
              amount: feeInfo.feeAmount,
              due_date: paymentDate,
              paid_date: paymentDate,
              status: 'paid',
              created_by: user?.id,
              notes: `Taxa de cartão descontada do provedor - Venda: ${financialItemNames}`,
            });
          }
        }
      }

      // Create cash transaction if register is open
      // Skip cash transaction for "Crédito ao Cliente" because it uses existing balance.
      // Build description with item names
      const itemNames = saleInfo.items.map(item => item.name).join(', ');
      const saleDescription = isBoleto && boletoInstallments > 1
        ? `Boleto Bancário ${boletoInstallments}x: ${itemNames} - ${selectedClient?.name}`
        : `${itemNames} - ${selectedClient?.name}`;
      
      if (currentOpenRegister && !isClientCredit) {
        // Skip cash entry for boleto/cheque - money not received yet
        if (!isBoleto && !isCheque) {
          await supabase.from('cash_transactions').insert({
            cash_register_id: currentOpenRegister.id,
            type: 'income',
            category: 'sale',
            description: isDinheiro ? `${saleDescription} (Dinheiro físico)` : saleDescription,
            amount: paymentAmount,
            payment_method: paymentMethod.name,
            card_fee_amount: selectedCardBrand ? feeInfo.feeAmount : null,
            installments: selectedCardBrand && isCreditCard ? installments : null,
            created_by: user?.id,
          });

          // Handle cash change (troco) for Dinheiro
          if (isDinheiro && changeAmount > 0) {
            if (changeMethod === 'cash') {
              // Cash change goes out of register
              await supabase.from('cash_transactions').insert({
                cash_register_id: currentOpenRegister.id,
                type: 'expense',
                category: 'change',
                description: `Troco em dinheiro: ${selectedClient?.name}`,
                amount: changeAmount,
                payment_method: 'Dinheiro',
                created_by: user?.id,
              });
            } else if (changeMethod === 'pix') {
              // PIX change - recorded as outgoing PIX transfer
              await supabase.from('cash_transactions').insert({
                cash_register_id: currentOpenRegister.id,
                type: 'expense',
                category: 'change',
                description: `Troco via PIX: ${selectedClient?.name}`,
                amount: changeAmount,
                payment_method: 'PIX',
                created_by: user?.id,
              });
            } else if (changeMethod === 'credit') {
              // Leave as client credit
              const currentCredit = selectedClient?.credit_balance || 0;
              const newBalance = currentCredit + changeAmount;
              await supabase
                .from('clients')
                .update({ credit_balance: newBalance })
                .eq('id', selectedClientId);

              await (supabase as any).from('client_credit_transactions').insert({
                client_id: selectedClientId,
                transaction_type: 'credit_added',
                amount: changeAmount,
                previous_balance: currentCredit,
                new_balance: newBalance,
                description: `Troco deixado como crédito: ${saleDescription}`,
                created_by: user?.id,
              });

              toast.info(`R$ ${changeAmount.toFixed(2)} adicionado como crédito ao cliente`);
            }
          }
        }
      }

      // Deduct credit balance when using "Crédito ao Cliente"
      if (isClientCredit && selectedClientId) {
        const newBalance = Math.max(0, clientCreditBalance - paymentAmount);
        await supabase
          .from('clients')
          .update({ credit_balance: newBalance })
          .eq('id', selectedClientId);

        await (supabase as any).from('client_credit_transactions').insert({
          client_id: selectedClientId,
          transaction_type: 'credit_used',
          amount: paymentAmount,
          previous_balance: clientCreditBalance,
          new_balance: newBalance,
          description: `Uso de crédito ao cliente: ${saleDescription}`,
          created_by: user?.id,
        });
      }

      // Create boleto installments if payment is boleto (à vista or parcelado)
      if (isBoleto && saleInfo.items.length > 0) {
        const { data: lastSales } = await supabase
          .from('single_sales')
          .select('id')
          .eq('client_id', selectedClientId)
          .order('created_at', { ascending: false })
          .limit(1);

        const saleId = lastSales?.[0]?.id;
        if (saleId) {
          const installmentAmount = Math.round((paymentAmount / boletoInstallments) * 100) / 100;
          const remainder = Math.round((paymentAmount - installmentAmount * boletoInstallments) * 100) / 100;

          const records = Array.from({ length: boletoInstallments }, (_, i) => {
            const dueDate = new Date(boletoFirstDueDate + 'T12:00:00');
            dueDate.setDate(dueDate.getDate() + i * 30);
            return {
              sale_id: saleId,
              installment_number: i + 1,
              total_installments: boletoInstallments,
              amount: i === 0 ? installmentAmount + remainder : installmentAmount,
              due_date: format(dueDate, 'yyyy-MM-dd'),
              status: 'pending' as const,
              created_by: user?.id || null,
            };
          });

          await supabase.from('boleto_installments').insert(records);
        }
      }

      // Invalidate all relevant queries for full sync
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['client_services'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-sales'] });
      queryClient.invalidateQueries({ queryKey: ['client'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['boleto_installments'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['boleto_installments_all'] });

      toast.success('Venda lançada no financeiro com sucesso!');
      resetSale();
    } catch (error: any) {
      toast.error('Erro ao processar venda: ' + error.message);
    } finally {
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-center">Qtd</TableHead>
                        <TableHead className="text-right">Unitário</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {saleInfo.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {item.type === 'product' ? 'Produto' : 
                               item.type === 'service' ? 'Serviço' : 'Pacote'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
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
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
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
                      ? 'bg-emerald-500/10 border-emerald-500/30' 
                      : 'bg-destructive/10 border-destructive/30'
                  }`}>
                    <Badge variant="outline" className={clientCreditBalance > 0 ? 'border-emerald-500/50 text-emerald-700' : 'border-destructive/50 text-destructive'}>
                      <Wallet className="h-3 w-3 mr-1" />
                      Crédito Disponível
                    </Badge>
                    <span className={clientCreditBalance > 0 ? 'text-emerald-700 font-medium' : 'text-destructive font-medium'}>
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

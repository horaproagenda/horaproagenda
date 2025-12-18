import { useState, useRef, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarDays, Plus, DollarSign, Percent, Package, Briefcase, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClients } from '@/hooks/useClients';
import { useServices } from '@/hooks/useServices';
import { useServicePackages } from '@/hooks/useServicePackages';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useCardBrands } from '@/hooks/useCardBrands';
import { useSingleSales } from '@/hooks/useSingleSales';
import { ptBR } from 'date-fns/locale';

type SelectedItemType = 'service' | 'package' | null;

export function SingleSaleDialog() {
  const [open, setOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedClientName, setSelectedClientName] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedServiceName, setSelectedServiceName] = useState('');
  const [selectedItemType, setSelectedItemType] = useState<SelectedItemType>(null);
  const [originalAmount, setOriginalAmount] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [selectedCardBrand, setSelectedCardBrand] = useState('');
  const [installments, setInstallments] = useState(1);
  const [saleDate, setSaleDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [showServiceSuggestions, setShowServiceSuggestions] = useState(false);
  
  const clientInputRef = useRef<HTMLDivElement>(null);
  const serviceInputRef = useRef<HTMLDivElement>(null);

  const { clients } = useClients();
  const { services } = useServices();
  const { packages } = useServicePackages();
  const { activePaymentMethods } = usePaymentMethods();
  const { cardBrands, creditBrands, debitBrands } = useCardBrands();
  const { createSale } = useSingleSales();

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientInputRef.current && !clientInputRef.current.contains(event.target as Node)) {
        setShowClientSuggestions(false);
      }
      if (serviceInputRef.current && !serviceInputRef.current.contains(event.target as Node)) {
        setShowServiceSuggestions(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredClients = clients.filter(c => 
    c.is_active && c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const filteredServices = services.filter(s => 
    s.is_active && s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const filteredPackages = packages.filter(p => 
    p.is_active && p.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const handleClientSelect = (client: { id: string; name: string }) => {
    setSelectedClient(client.id);
    setSelectedClientName(client.name);
    setClientSearch(client.name);
    setShowClientSuggestions(false);
  };

  const handleServiceSelect = (service: { id: string; name: string; price: number }) => {
    setSelectedService(service.id);
    setSelectedServiceName(service.name);
    setServiceSearch(service.name);
    setSelectedItemType('service');
    setOriginalAmount(service.price.toString());
    setShowServiceSuggestions(false);
  };

  const handlePackageSelect = (pkg: { id: string; name: string; total_price: number }) => {
    setSelectedService(pkg.id);
    setSelectedServiceName(pkg.name);
    setServiceSearch(pkg.name);
    setSelectedItemType('package');
    setOriginalAmount(pkg.total_price.toString());
    setShowServiceSuggestions(false);
  };

  const handleClientSearchChange = (value: string) => {
    setClientSearch(value);
    setShowClientSuggestions(true);
    if (value !== selectedClientName) {
      setSelectedClient('');
      setSelectedClientName('');
    }
  };

  const handleServiceSearchChange = (value: string) => {
    setServiceSearch(value);
    setShowServiceSuggestions(true);
    if (value !== selectedServiceName) {
      setSelectedService('');
      setSelectedServiceName('');
      setSelectedItemType(null);
    }
  };

  const discount = parseFloat(discountAmount) || 0;
  const original = parseFloat(originalAmount) || 0;

  // Card payment detection
  const selectedPaymentMethodObj = useMemo(() => {
    return activePaymentMethods.find(pm => pm.id === selectedPaymentMethod);
  }, [activePaymentMethods, selectedPaymentMethod]);

  const isCardPayment = useMemo(() => {
    if (!selectedPaymentMethodObj) return false;
    const name = selectedPaymentMethodObj.name.toLowerCase();
    return name.includes('crédito') || name.includes('débito') || name.includes('cartão');
  }, [selectedPaymentMethodObj]);

  const isCreditCard = useMemo(() => {
    if (!selectedPaymentMethodObj) return false;
    return selectedPaymentMethodObj.name.toLowerCase().includes('crédito');
  }, [selectedPaymentMethodObj]);

  const isDebitCard = useMemo(() => {
    if (!selectedPaymentMethodObj) return false;
    return selectedPaymentMethodObj.name.toLowerCase().includes('débito');
  }, [selectedPaymentMethodObj]);

  const availableBrands = useMemo(() => {
    if (isCreditCard) return creditBrands;
    if (isDebitCard) return debitBrands;
    return cardBrands.filter(b => b.is_active);
  }, [isCreditCard, isDebitCard, creditBrands, debitBrands, cardBrands]);

  const maxInstallments = useMemo(() => {
    if (!selectedCardBrand) return 1;
    const brand = cardBrands.find(b => b.id === selectedCardBrand);
    if (!brand || !brand.fees || brand.fees.length === 0) return 1;
    return Math.max(...brand.fees.map(f => f.installment_number));
  }, [selectedCardBrand, cardBrands]);

  const cardFeeAmount = useMemo(() => {
    if (!isCardPayment || !selectedCardBrand) return 0;
    const brand = cardBrands.find(b => b.id === selectedCardBrand);
    if (!brand || !brand.fees) return 0;
    
    const fee = isCreditCard 
      ? brand.fees.find(f => f.installment_number === installments)
      : brand.fees.find(f => f.installment_number === 1) || brand.fees[0];
    
    if (!fee) return 0;
    return original * (fee.fee_percentage / 100);
  }, [isCardPayment, selectedCardBrand, cardBrands, isCreditCard, installments, original]);

  const finalAmount = Math.max(0, original - discount);
  const netAmount = finalAmount - cardFeeAmount;

  const handleSubmit = async () => {
    if (!selectedPaymentMethod) {
      return;
    }

    await createSale.mutateAsync({
      client_id: selectedClient || null,
      service_id: selectedItemType === 'service' ? selectedService : null,
      package_id: selectedItemType === 'package' ? selectedService : null,
      item_type: selectedItemType || 'service',
      description: selectedServiceName || null,
      original_amount: original,
      discount_amount: discount,
      final_amount: finalAmount,
      payment_method_id: selectedPaymentMethod,
      bank_id: null,
      sale_date: format(saleDate, 'yyyy-MM-dd'),
      notes: notes || null,
      created_by: null,
      paid_by: null,
      paid_at: new Date().toISOString(),
      installments: isCreditCard ? installments : 1,
      card_fee_amount: cardFeeAmount,
    });

    resetForm();
    setOpen(false);
  };

  const resetForm = () => {
    setClientSearch('');
    setServiceSearch('');
    setSelectedClient('');
    setSelectedClientName('');
    setSelectedService('');
    setSelectedServiceName('');
    setSelectedItemType(null);
    setOriginalAmount('');
    setDiscountAmount('');
    setSelectedPaymentMethod('');
    setSelectedCardBrand('');
    setInstallments(1);
    setSaleDate(new Date());
    setNotes('');
    setShowClientSuggestions(false);
    setShowServiceSuggestions(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Venda
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Venda Unitária</DialogTitle>
          <DialogDescription>
            Registre uma venda avulsa de serviço ou pacote
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Client Search with Autocomplete */}
          <div className="space-y-2" ref={clientInputRef}>
            <Label>Cliente</Label>
            <div className="relative">
              <Input
                placeholder="Digite o nome do cliente..."
                value={clientSearch}
                onChange={(e) => handleClientSearchChange(e.target.value)}
                onFocus={() => clientSearch && setShowClientSuggestions(true)}
              />
              {showClientSuggestions && clientSearch && filteredClients.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                  {filteredClients.map((client) => (
                    <button
                      key={client.id}
                      className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground text-sm transition-colors"
                      onClick={() => handleClientSelect(client)}
                    >
                      <div className="font-medium">{client.name}</div>
                      {client.phone && (
                        <div className="text-xs text-muted-foreground">{client.phone}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {showClientSuggestions && clientSearch && filteredClients.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg p-3 text-sm text-muted-foreground">
                  Nenhum cliente encontrado
                </div>
              )}
            </div>
          </div>

          {/* Service/Package Search with Autocomplete */}
          <div className="space-y-2" ref={serviceInputRef}>
            <Label>Serviço / Pacote</Label>
            <div className="relative">
              <Input
                placeholder="Digite o nome do serviço ou pacote..."
                value={serviceSearch}
                onChange={(e) => handleServiceSearchChange(e.target.value)}
                onFocus={() => serviceSearch && setShowServiceSuggestions(true)}
              />
              {showServiceSuggestions && serviceSearch && (filteredServices.length > 0 || filteredPackages.length > 0) && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[250px] overflow-y-auto">
                  {filteredServices.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        Serviços
                      </div>
                      {filteredServices.map((service) => (
                        <button
                          key={service.id}
                          className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground text-sm transition-colors"
                          onClick={() => handleServiceSelect(service)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{service.name}</span>
                            <span className="text-xs text-muted-foreground">
                              R$ {service.price}
                            </span>
                          </div>
                          {service.category && (
                            <div className="text-xs text-muted-foreground">{service.category}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {filteredPackages.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        Pacotes
                      </div>
                      {filteredPackages.map((pkg) => (
                        <button
                          key={pkg.id}
                          className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground text-sm transition-colors"
                          onClick={() => handlePackageSelect(pkg)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{pkg.name}</span>
                            <span className="text-xs text-muted-foreground">
                              R$ {pkg.total_price}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {pkg.total_sessions} sessões
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {showServiceSuggestions && serviceSearch && filteredServices.length === 0 && filteredPackages.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg p-3 text-sm text-muted-foreground">
                  Nenhum serviço ou pacote encontrado
                </div>
              )}
            </div>
            {selectedItemType && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {selectedItemType === 'service' ? (
                  <><Briefcase className="h-3 w-3" /> Serviço selecionado</>
                ) : (
                  <><Package className="h-3 w-3" /> Pacote selecionado</>
                )}
              </div>
            )}
          </div>

          {/* Amount Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Valor Original
              </Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={originalAmount}
                onChange={(e) => setOriginalAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Desconto
              </Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Final Amount */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Valor Final:</span>
              <span className="text-xl font-bold text-primary">
                R$ {finalAmount.toFixed(2)}
              </span>
            </div>
            {cardFeeAmount > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Taxa do cartão:</span>
                <span className="text-destructive">- R$ {cardFeeAmount.toFixed(2)}</span>
              </div>
            )}
            {cardFeeAmount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span>Valor líquido:</span>
                <span className="font-medium text-green-600">R$ {netAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Forma de Pagamento *</Label>
            <Select value={selectedPaymentMethod} onValueChange={(v) => { setSelectedPaymentMethod(v); setSelectedCardBrand(''); setInstallments(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a forma de pagamento" />
              </SelectTrigger>
              <SelectContent>
                {activePaymentMethods.map((pm) => (
                  <SelectItem key={pm.id} value={pm.id}>
                    {pm.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Card Brand Selection */}
          {isCardPayment && availableBrands.length > 0 && (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="h-4 w-4" />
                Dados do Cartão
              </div>
              <div className="space-y-2">
                <Label>Bandeira</Label>
                <Select value={selectedCardBrand} onValueChange={(v) => { setSelectedCardBrand(v); setInstallments(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a bandeira" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBrands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isCreditCard && selectedCardBrand && maxInstallments > 1 && (
                <div className="space-y-2">
                  <Label>Parcelas</Label>
                  <Select value={installments.toString()} onValueChange={(v) => setInstallments(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={n.toString()}>
                          {n}x {n === 1 ? 'à vista' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Sale Date */}
          <div className="space-y-2">
            <Label>Data da Venda</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !saleDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {saleDate ? format(saleDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione a data'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={saleDate}
                  onSelect={(date) => date && setSaleDate(date)}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              placeholder="Observações sobre a venda..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Submit Button */}
          <Button 
            className="w-full" 
            onClick={handleSubmit}
            disabled={!selectedPaymentMethod || finalAmount <= 0 || createSale.isPending}
          >
            {createSale.isPending ? 'Registrando...' : 'Registrar Venda'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

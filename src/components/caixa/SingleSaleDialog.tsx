import { useState } from 'react';
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
import { CalendarDays, Plus, DollarSign, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClients } from '@/hooks/useClients';
import { useServices } from '@/hooks/useServices';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useBanks } from '@/hooks/useBanks';
import { useSingleSales } from '@/hooks/useSingleSales';
import { ptBR } from 'date-fns/locale';

export function SingleSaleDialog() {
  const [open, setOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [selectedBank, setSelectedBank] = useState('');
  const [saleDate, setSaleDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');

  const { clients } = useClients();
  const { services } = useServices();
  const { activePaymentMethods } = usePaymentMethods();
  const { banks } = useBanks();
  const { createSale } = useSingleSales();

  const filteredClients = clients.filter(c => 
    c.is_active && c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const filteredServices = services.filter(s => 
    s.is_active && s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const selectedServiceData = services.find(s => s.id === selectedService);

  const handleServiceChange = (serviceId: string) => {
    setSelectedService(serviceId);
    const service = services.find(s => s.id === serviceId);
    if (service) {
      setOriginalAmount(service.price.toString());
    }
  };

  const discount = parseFloat(discountAmount) || 0;
  const original = parseFloat(originalAmount) || 0;
  const finalAmount = Math.max(0, original - discount);

  const handleSubmit = async () => {
    if (!selectedPaymentMethod) {
      return;
    }

    await createSale.mutateAsync({
      client_id: selectedClient || null,
      service_id: selectedService || null,
      description: selectedServiceData?.name || null,
      original_amount: original,
      discount_amount: discount,
      final_amount: finalAmount,
      payment_method_id: selectedPaymentMethod,
      bank_id: selectedBank || null,
      sale_date: format(saleDate, 'yyyy-MM-dd'),
      notes: notes || null,
    });

    resetForm();
    setOpen(false);
  };

  const resetForm = () => {
    setClientSearch('');
    setServiceSearch('');
    setSelectedClient('');
    setSelectedService('');
    setOriginalAmount('');
    setDiscountAmount('');
    setSelectedPaymentMethod('');
    setSelectedBank('');
    setSaleDate(new Date());
    setNotes('');
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
            Registre uma venda avulsa de serviço
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Client Search */}
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Input
              placeholder="Digite para buscar cliente..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {filteredClients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Service Search */}
          <div className="space-y-2">
            <Label>Serviço</Label>
            <Input
              placeholder="Digite para buscar serviço..."
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
            />
            <Select value={selectedService} onValueChange={handleServiceChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o serviço" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {filteredServices.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{service.name}</span>
                      <span className="text-xs text-muted-foreground">
                        R$ {service.price}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-medium">Valor Final:</span>
              <span className="text-xl font-bold text-primary">
                R$ {finalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Forma de Pagamento *</Label>
            <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
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

          {/* Bank */}
          <div className="space-y-2">
            <Label>Banco (opcional)</Label>
            <Select value={selectedBank} onValueChange={setSelectedBank}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o banco" />
              </SelectTrigger>
              <SelectContent>
                {banks.filter(b => b.is_active).map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

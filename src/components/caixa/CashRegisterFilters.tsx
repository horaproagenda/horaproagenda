import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'installments', label: 'Parcelado' },
];

const DATE_RANGES = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last7days', label: 'Últimos 7 dias' },
  { value: 'last30days', label: 'Últimos 30 dias' },
  { value: 'thisMonth', label: 'Este mês' },
  { value: 'custom', label: 'Personalizado' },
];

interface CashRegisterFiltersProps {
  dateRange: string;
  setDateRange: (value: string) => void;
  customStartDate: Date | undefined;
  setCustomStartDate: (date: Date | undefined) => void;
  customEndDate: Date | undefined;
  setCustomEndDate: (date: Date | undefined) => void;
  paymentMethodFilter: string;
  setPaymentMethodFilter: (value: string) => void;
  professionalFilter: string;
  setProfessionalFilter: (value: string) => void;
  clientFilter: string;
  setClientFilter: (value: string) => void;
  professionals: Array<{ id: string; name: string; is_active: boolean }>;
  clients: Array<{ id: string; name: string }>;
}

export function CashRegisterFilters({
  dateRange,
  setDateRange,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  paymentMethodFilter,
  setPaymentMethodFilter,
  professionalFilter,
  setProfessionalFilter,
  clientFilter,
  setClientFilter,
  professionals,
  clients,
}: CashRegisterFiltersProps) {
  const [professionalOpen, setProfessionalOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);

  const activeFiltersCount = [
    paymentMethodFilter !== 'all',
    professionalFilter !== 'all',
    clientFilter !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setPaymentMethodFilter('all');
    setProfessionalFilter('all');
    setClientFilter('all');
    setDateRange('thisMonth');
    setCustomStartDate(undefined);
    setCustomEndDate(undefined);
  };

  const selectedProfessional = professionals.find(p => p.id === professionalFilter);
  const selectedClient = clients.find(c => c.id === clientFilter);

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg">
      {/* Date Range */}
      <Select value={dateRange} onValueChange={setDateRange}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          {DATE_RANGES.map(range => (
            <SelectItem key={range.value} value={range.value}>
              {range.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {dateRange === 'custom' && (
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-8 text-xs justify-start',
                  !customStartDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-1 h-3 w-3" />
                {customStartDate ? format(customStartDate, 'dd/MM/yy', { locale: ptBR }) : 'Início'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={customStartDate}
                onSelect={setCustomStartDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-8 text-xs justify-start',
                  !customEndDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-1 h-3 w-3" />
                {customEndDate ? format(customEndDate, 'dd/MM/yy', { locale: ptBR }) : 'Fim'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={customEndDate}
                onSelect={setCustomEndDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </>
      )}

      {/* Payment Method */}
      <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue placeholder="Pagamento" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas formas</SelectItem>
          {PAYMENT_METHODS.map(method => (
            <SelectItem key={method.value} value={method.value}>
              {method.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Professional Filter */}
      <Popover open={professionalOpen} onOpenChange={setProfessionalOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 text-xs',
              professionalFilter !== 'all' && 'border-primary text-primary'
            )}
          >
            {selectedProfessional ? selectedProfessional.name : 'Profissional'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-2" align="start">
          <div className="space-y-1 max-h-[200px] overflow-auto">
            <Button
              variant={professionalFilter === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              className="w-full justify-start text-xs"
              onClick={() => {
                setProfessionalFilter('all');
                setProfessionalOpen(false);
              }}
            >
              Todos
            </Button>
            {professionals.filter(p => p.is_active).map(prof => (
              <Button
                key={prof.id}
                variant={professionalFilter === prof.id ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => {
                  setProfessionalFilter(prof.id);
                  setProfessionalOpen(false);
                }}
              >
                {prof.name}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Client Filter */}
      <Popover open={clientOpen} onOpenChange={setClientOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 text-xs',
              clientFilter !== 'all' && 'border-primary text-primary'
            )}
          >
            {selectedClient ? selectedClient.name : 'Cliente'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-2" align="start">
          <div className="space-y-1 max-h-[200px] overflow-auto">
            <Button
              variant={clientFilter === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              className="w-full justify-start text-xs"
              onClick={() => {
                setClientFilter('all');
                setClientOpen(false);
              }}
            >
              Todos
            </Button>
            {clients.slice(0, 50).map(client => (
              <Button
                key={client.id}
                variant={clientFilter === client.id ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-start text-xs truncate"
                onClick={() => {
                  setClientFilter(client.id);
                  setClientOpen(false);
                }}
              >
                {client.name}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Clear Filters */}
      {activeFiltersCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={clearFilters}
        >
          <X className="h-3 w-3" />
          Limpar ({activeFiltersCount})
        </Button>
      )}
    </div>
  );
}

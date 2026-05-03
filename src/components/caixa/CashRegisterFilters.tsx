import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { CalendarIcon, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompactFilterTrigger } from '@/components/shared/CompactFilterTrigger';

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
  const [open, setOpen] = useState(false);
  const [profSearch, setProfSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');

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

  const filteredProfs = professionals
    .filter((p) => p.is_active)
    .filter((p) => p.name.toLowerCase().includes(profSearch.toLowerCase()));
  const filteredClients = clients
    .slice(0, 200)
    .filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()));

  const renderList = ({
    title,
    items,
    selected,
    onSelect,
    search,
    setSearch,
    showSearchAfter = 5,
  }: {
    title: string;
    items: { id: string; label: string }[];
    selected: string;
    onSelect: (id: string) => void;
    search?: string;
    setSearch?: (v: string) => void;
    showSearchAfter?: number;
  }) => (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </p>
      {setSearch && items.length > showSearchAfter && (
        <Input
          placeholder={`Buscar ${title.toLowerCase()}...`}
          value={search ?? ''}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-[11px]"
        />
      )}
      <div className="space-y-0.5 max-h-[140px] overflow-y-auto">
        <button
          type="button"
          onClick={() => onSelect('all')}
          className={cn(
            'w-full flex items-center justify-between px-2 py-1 text-[11px] rounded text-left transition-colors',
            selected === 'all' ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
          )}
        >
          <span>Todos</span>
          {selected === 'all' && <Check className="h-3 w-3" />}
        </button>
        {items.map((item) => {
          const isSel = selected === item.id;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                'w-full flex items-center justify-between px-2 py-1 text-[11px] rounded text-left transition-colors',
                isSel ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
              )}
            >
              <span className="truncate">{item.label}</span>
              {isSel && <Check className="h-3 w-3 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/30 rounded-lg">
      {/* Date Range */}
      <Select value={dateRange} onValueChange={setDateRange}>
        <SelectTrigger className="w-[130px] h-7 text-[11px]">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          {DATE_RANGES.map((range) => (
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
                  'h-7 text-[11px] px-2 justify-start',
                  !customStartDate && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="mr-1 h-3 w-3" />
                {customStartDate
                  ? format(customStartDate, 'dd/MM/yy', { locale: ptBR })
                  : 'Início'}
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
                  'h-7 text-[11px] px-2 justify-start',
                  !customEndDate && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="mr-1 h-3 w-3" />
                {customEndDate
                  ? format(customEndDate, 'dd/MM/yy', { locale: ptBR })
                  : 'Fim'}
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

      {/* Filtros (popover unificado) */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <CompactFilterTrigger activeCount={activeFiltersCount} />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <h4 className="text-xs font-semibold text-foreground">Filtros</h4>
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] gap-1"
                onClick={() => {
                  clearFilters();
                  setOpen(false);
                }}
              >
                <X className="h-3 w-3" />
                Limpar
              </Button>
            )}
          </div>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 pr-2 pb-1">
              {renderList({
                title: 'Pagamento',
                items: PAYMENT_METHODS.map((m) => ({
                  id: m.value,
                  label: m.label,
                })),
                selected: paymentMethodFilter,
                onSelect: setPaymentMethodFilter,
              })}
              <Separator />
              {renderList({
                title: 'Profissional',
                items: filteredProfs.map((p) => ({ id: p.id, label: p.name })),
                selected: professionalFilter,
                onSelect: setProfessionalFilter,
                search: profSearch,
                setSearch: setProfSearch,
              })}
              <Separator />
              {renderList({
                title: 'Cliente',
                items: filteredClients.map((c) => ({
                  id: c.id,
                  label: c.name,
                })),
                selected: clientFilter,
                onSelect: setClientFilter,
                search: clientSearch,
                setSearch: setClientSearch,
              })}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

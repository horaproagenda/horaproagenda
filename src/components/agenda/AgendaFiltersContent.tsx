import { useState, useEffect } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

const STORAGE_KEY = 'agenda-filters-visibility-v1';

export type FilterKey =
  | 'professional'
  | 'room'
  | 'status'
  | 'payment'
  | 'equipment';

const ALL_FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'professional', label: 'Profissional' },
  { key: 'room', label: 'Sala' },
  { key: 'status', label: 'Status' },
  { key: 'payment', label: 'Pagamento' },
  { key: 'equipment', label: 'Equipamento' },
];

const DEFAULT_VISIBILITY: Record<FilterKey, boolean> = {
  professional: true,
  room: true,
  status: true,
  payment: true,
  equipment: true,
};

function loadVisibility(): Record<FilterKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBILITY;
    return { ...DEFAULT_VISIBILITY, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_VISIBILITY;
  }
}

interface ProfessionalOpt {
  id: string;
  name: string;
  agenda_color?: string | null;
}
interface RoomOpt { id: string; name: string }
interface EquipmentOpt { id: string; name: string }

export interface AgendaFiltersContentProps {
  professionalFilter: string;
  setProfessionalFilter: (v: string) => void;
  roomFilter: string;
  setRoomFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  paymentFilter: string;
  setPaymentFilter: (v: string) => void;
  equipmentFilter: string;
  setEquipmentFilter: (v: string) => void;
  hideSunday?: boolean;
  setHideSunday?: (v: boolean) => void;
  professionals: ProfessionalOpt[];
  rooms: RoomOpt[];
  equipment: EquipmentOpt[];
  hasActiveFilters: boolean;
  onClear: () => void;
  clientCreditLabel: string;
  nonCashLabel: string;
  /** Altura máxima da área rolável. Default: 60vh (popover) */
  maxHeightClass?: string;
}

/**
 * Conteúdo padronizado dos filtros da agenda.
 *
 * - Layout compacto (h-7, text-[11px]).
 * - Scroll vertical interno (ScrollArea) para nunca cortar conteúdo.
 * - Permite ao usuário escolher quais filtros ficam visíveis
 *   (persistido em localStorage).
 */
export function AgendaFiltersContent(props: AgendaFiltersContentProps) {
  const {
    professionalFilter, setProfessionalFilter,
    roomFilter, setRoomFilter,
    statusFilter, setStatusFilter,
    paymentFilter, setPaymentFilter,
    equipmentFilter, setEquipmentFilter,
    hideSunday, setHideSunday,
    professionals, rooms, equipment,
    hasActiveFilters, onClear,
    clientCreditLabel, nonCashLabel,
    maxHeightClass = 'max-h-[60vh]',
  } = props;

  const [visibility, setVisibility] = useState<Record<FilterKey, boolean>>(loadVisibility);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
    } catch {
      /* noop */
    }
  }, [visibility]);

  const toggle = (key: FilterKey) =>
    setVisibility((v) => ({ ...v, [key]: !v[key] }));

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <h4 className="text-xs font-semibold text-foreground">Filtros</h4>
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] gap-1"
                title="Selecionar quais filtros mostrar"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Mostrar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="end">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2 px-1">
                Filtros visíveis
              </p>
              <div className="space-y-1">
                {ALL_FILTERS.map((f) => (
                  <label
                    key={f.key}
                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer text-xs"
                  >
                    <Checkbox
                      checked={visibility[f.key]}
                      onCheckedChange={() => toggle(f.key)}
                      className="h-3.5 w-3.5"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-6 px-2 text-[10px] gap-1"
            >
              <X className="h-3 w-3" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Conteúdo rolável */}
      <ScrollArea className={maxHeightClass}>
        <div className="grid grid-cols-2 gap-2 pr-2 pb-1">
          {visibility.professional && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Profissional
              </label>
              <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {professionals.map((prof) => (
                    <SelectItem key={prof.id} value={prof.id}>
                      <div className="flex items-center gap-1.5">
                        {prof.agenda_color && (
                          <div
                            className="h-2 w-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: prof.agenda_color }}
                          />
                        )}
                        <span className="truncate text-xs">{prof.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {visibility.room && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Sala
              </label>
              <Select value={roomFilter} onValueChange={setRoomFilter}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="text-xs">{r.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {visibility.status && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Status
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="scheduled">Agendado</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                  <SelectItem value="missed">Faltou</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {visibility.payment && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Pagamento
              </label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="partial">Parcial</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="client_credit">{clientCreditLabel}</SelectItem>
                  <SelectItem value="non_cash">{nonCashLabel}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {visibility.equipment && (
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Equipamento
              </label>
              <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {equipment.map((eq) => (
                    <SelectItem key={eq.id} value={eq.id}>
                      <span className="text-xs">{eq.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {setHideSunday && (
            <div className="col-span-2">
              <Separator className="my-2" />
              <div className="flex items-center gap-2">
                <Switch
                  id="hide-sunday-shared"
                  checked={!!hideSunday}
                  onCheckedChange={setHideSunday}
                />
                <Label htmlFor="hide-sunday-shared" className="text-xs">
                  Ocultar Domingo
                </Label>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

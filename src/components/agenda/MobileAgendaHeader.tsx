import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus,
  Filter,
  Search,
  X,
  UserX,
  List,
  MoreVertical,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export type MobileViewType = 'day' | 'week' | 'month';

interface MobileAgendaHeaderProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onNewAppointment: () => void;
  onFilterClick: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  activeFiltersCount: number;
  dayStats: {
    total: number;
    confirmed: number;
    pending: number;
  };
  mobileView: MobileViewType;
  onMobileViewChange: (view: MobileViewType) => void;
  onNewAbsence?: () => void;
  onManageAbsences?: () => void;
  onToday?: () => void;
  onOpenAutomations?: () => void;
}

export function MobileAgendaHeader({
  selectedDate,
  onDateChange,
  onNewAppointment,
  onFilterClick,
  searchTerm,
  onSearchChange,
  activeFiltersCount,
  dayStats,
  mobileView,
  onMobileViewChange,
  onNewAbsence,
  onManageAbsences,
  onToday,
  onOpenAutomations,
  onSendWhatsappReminders,
  sendingReminders = false,
}: MobileAgendaHeaderProps) {
  const [showSearch, setShowSearch] = useState(false);
  
  const goToPrev = () => {
    if (mobileView === 'day') onDateChange(subDays(selectedDate, 1));
    else if (mobileView === 'week') onDateChange(subWeeks(selectedDate, 1));
    else onDateChange(subMonths(selectedDate, 1));
  };
  
  const goToNext = () => {
    if (mobileView === 'day') onDateChange(addDays(selectedDate, 1));
    else if (mobileView === 'week') onDateChange(addWeeks(selectedDate, 1));
    else onDateChange(addMonths(selectedDate, 1));
  };
  
  const goToToday = () => onDateChange(new Date());
  
  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  const getDateLabel = () => {
    if (mobileView === 'day') {
      return format(selectedDate, "d MMM, EEE", { locale: ptBR });
    } else if (mobileView === 'week') {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const we = endOfWeek(selectedDate, { weekStartsOn: 1 });
      return `${format(ws, "d", { locale: ptBR })} - ${format(we, "d MMM", { locale: ptBR })}`;
    } else {
      return format(selectedDate, "MMM yyyy", { locale: ptBR });
    }
  };
  
  return (
    <div className="space-y-1.5 px-4 pl-safe pr-safe pt-1.5 pb-1 bg-card border-b border-border/50">
      {/* Row 1: View tabs */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex bg-muted/60 rounded-md p-0.5 gap-0.5">
          {(['day', 'week', 'month'] as MobileViewType[]).map(v => (
            <button
              key={v}
              onClick={() => onMobileViewChange(v)}
              className={cn(
                "px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
                mobileView === v
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSearch(!showSearch)}
            className="h-7 w-7"
          >
            {showSearch ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={onFilterClick}
            className="h-7 w-7 relative"
          >
            <Filter className="h-3.5 w-3.5" />
            {activeFiltersCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 bg-primary rounded-full text-[8px] text-primary-foreground flex items-center justify-center font-bold">
                {activeFiltersCount}
              </span>
            )}
          </Button>
          
          <Button
            size="sm"
            onClick={onNewAppointment}
            className="h-7 px-2 text-[11px] gap-0.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo
          </Button>

          {(onNewAbsence || onManageAbsences || onToday || onOpenAutomations || onSendWhatsappReminders) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Mais ações da agenda"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 bg-popover z-50">
                <DropdownMenuLabel className="text-[11px]">Ações</DropdownMenuLabel>
                {onToday && (
                  <DropdownMenuItem onClick={onToday} className="text-xs gap-2">
                    <ChevronLeft className="h-3.5 w-3.5 opacity-0" />
                    Ir para hoje
                  </DropdownMenuItem>
                )}
                {(onOpenAutomations || onSendWhatsappReminders) && <DropdownMenuSeparator />}
                {onOpenAutomations && (
                  <DropdownMenuItem onClick={onOpenAutomations} className="text-xs gap-2">
                    <Bot className="h-3.5 w-3.5" />
                    Lista de espera, encaixe, ocupação, recorrência
                  </DropdownMenuItem>
                )}
                {onSendWhatsappReminders && (
                  <DropdownMenuItem
                    onClick={onSendWhatsappReminders}
                    disabled={sendingReminders}
                    className="text-xs gap-2"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    {sendingReminders ? 'Enviando lembretes...' : 'Enviar lembretes WhatsApp'}
                  </DropdownMenuItem>
                )}
                {(onNewAbsence || onManageAbsences) && <DropdownMenuSeparator />}
                {onNewAbsence && (
                  <DropdownMenuItem onClick={onNewAbsence} className="text-xs gap-2">
                    <Plus className="h-3.5 w-3.5" />
                    Registrar ausência
                  </DropdownMenuItem>
                )}
                {onManageAbsences && (
                  <DropdownMenuItem onClick={onManageAbsences} className="text-xs gap-2">
                    <List className="h-3.5 w-3.5" />
                    Ausências registradas
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Row 2: Date nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={goToPrev} className="h-7 w-7">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <button
          onClick={goToToday}
          className={cn(
            "text-[12px] font-semibold px-3 py-0.5 rounded-md transition-colors capitalize",
            isToday ? "bg-primary/10 text-primary" : "text-foreground"
          )}
        >
          {getDateLabel()}
        </button>
        
        <Button variant="ghost" size="icon" onClick={goToNext} className="h-7 w-7">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Search input - collapsible */}
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar cliente ou serviço..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-7 text-[11px] pl-7 pr-2"
            autoFocus
          />
        </div>
      )}
      
      {/* Stats row */}
      <div className="flex items-center justify-center gap-3 text-[10px] pb-0.5">
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">{dayStats.total}</span> agend.
        </span>
        <span className="text-success">
          <span className="font-semibold">{dayStats.confirmed}</span> conf.
        </span>
        <span className="text-warning">
          <span className="font-semibold">{dayStats.pending}</span> pend.
        </span>
      </div>
    </div>
  );
}

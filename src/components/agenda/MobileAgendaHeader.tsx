import { format, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus,
  Filter,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useState } from 'react';

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
}: MobileAgendaHeaderProps) {
  const [showSearch, setShowSearch] = useState(false);
  
  const goToPrev = () => onDateChange(subDays(selectedDate, 1));
  const goToNext = () => onDateChange(addDays(selectedDate, 1));
  const goToToday = () => onDateChange(new Date());
  
  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  
  return (
    <div className="space-y-2 px-2 py-2 bg-card border-b border-border/50">
      {/* Row 1: Navigation and actions */}
      <div className="flex items-center justify-between gap-1">
        {/* Date navigation */}
        <div className="flex items-center gap-0.5">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={goToPrev}
            className="h-7 w-7"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <button
            onClick={goToToday}
            className={cn(
              "text-xs font-medium px-2 py-1 rounded-md transition-colors min-w-[90px] text-center",
              isToday ? "bg-primary/10 text-primary" : "text-foreground"
            )}
          >
            {format(selectedDate, "d MMM", { locale: ptBR })}
          </button>
          
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={goToNext}
            className="h-7 w-7"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1">
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
              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-primary rounded-full text-[8px] text-primary-foreground flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </Button>
          
          <Button
            size="sm"
            onClick={onNewAppointment}
            className="h-7 px-2 text-[10px]"
          >
            <Plus className="h-3 w-3 mr-0.5" />
            Novo
          </Button>
        </div>
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
      
      {/* Stats row - ultra compact */}
      <div className="flex items-center justify-center gap-3 text-[10px]">
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

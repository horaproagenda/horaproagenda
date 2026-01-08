import { useState } from 'react';
import { Filter, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface FilterGroup {
  id: string;
  label: string;
  options: FilterOption[];
  multiSelect?: boolean;
}

interface AdvancedFiltersProps {
  groups: FilterGroup[];
  selectedFilters: Record<string, string[]>;
  onFilterChange: (groupId: string, values: string[]) => void;
  onClearAll?: () => void;
  className?: string;
}

export function AdvancedFilters({
  groups,
  selectedFilters,
  onFilterChange,
  onClearAll,
  className,
}: AdvancedFiltersProps) {
  const [open, setOpen] = useState(false);

  const totalActiveFilters = Object.values(selectedFilters).reduce(
    (acc, values) => acc + values.filter(v => v !== 'all').length,
    0
  );

  const handleOptionToggle = (groupId: string, value: string, multiSelect: boolean) => {
    const currentValues = selectedFilters[groupId] || [];
    
    if (multiSelect) {
      if (value === 'all') {
        onFilterChange(groupId, ['all']);
      } else {
        const newValues = currentValues.includes(value)
          ? currentValues.filter(v => v !== value && v !== 'all')
          : [...currentValues.filter(v => v !== 'all'), value];
        onFilterChange(groupId, newValues.length > 0 ? newValues : ['all']);
      }
    } else {
      onFilterChange(groupId, [value]);
    }
  };

  const getActiveFiltersForGroup = (groupId: string): string[] => {
    const values = selectedFilters[groupId] || ['all'];
    return values.filter(v => v !== 'all');
  };

  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll();
    } else {
      groups.forEach(group => {
        onFilterChange(group.id, ['all']);
      });
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-2 h-10 relative",
            totalActiveFilters > 0 && "border-primary",
            className
          )}
        >
          <Filter className="h-4 w-4" />
          Filtros
          {totalActiveFilters > 0 && (
            <Badge 
              variant="default" 
              className="h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full absolute -top-2 -right-2"
            >
              {totalActiveFilters}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Filtros Avançados</h4>
            {totalActiveFilters > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleClearAll}
              >
                <X className="h-3 w-3 mr-1" />
                Limpar tudo
              </Button>
            )}
          </div>
        </div>
        
        <ScrollArea className="max-h-[400px]">
          <div className="p-3 space-y-4">
            {groups.map((group, index) => (
              <div key={group.id}>
                {index > 0 && <Separator className="mb-4" />}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </Label>
                  <div className="space-y-1.5">
                    {/* All option */}
                    <div
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                        (selectedFilters[group.id]?.includes('all') || 
                         !selectedFilters[group.id] || 
                         selectedFilters[group.id].length === 0) 
                          ? "bg-primary/10 text-primary" 
                          : "hover:bg-muted"
                      )}
                      onClick={() => handleOptionToggle(group.id, 'all', group.multiSelect || false)}
                    >
                      <Checkbox 
                        checked={
                          selectedFilters[group.id]?.includes('all') || 
                          !selectedFilters[group.id] || 
                          selectedFilters[group.id].length === 0
                        }
                        className="pointer-events-none"
                      />
                      <span className="text-sm">Todos</span>
                    </div>
                    
                    {group.options.map((option) => {
                      const isSelected = selectedFilters[group.id]?.includes(option.value);
                      return (
                        <div
                          key={option.value}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                            isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                          )}
                          onClick={() => handleOptionToggle(group.id, option.value, group.multiSelect || false)}
                        >
                          <Checkbox 
                            checked={isSelected} 
                            className="pointer-events-none"
                          />
                          {option.icon && (
                            <span className="text-muted-foreground">{option.icon}</span>
                          )}
                          <span className="text-sm">{option.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Active Filters Summary */}
        {totalActiveFilters > 0 && (
          <>
            <Separator />
            <div className="p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground mb-2">Filtros ativos:</p>
              <div className="flex flex-wrap gap-1">
                {groups.map(group => {
                  const activeFilters = getActiveFiltersForGroup(group.id);
                  return activeFilters.map(value => {
                    const option = group.options.find(o => o.value === value);
                    if (!option) return null;
                    return (
                      <Badge
                        key={`${group.id}-${value}`}
                        variant="secondary"
                        className="text-xs gap-1 cursor-pointer hover:bg-secondary/80"
                        onClick={() => handleOptionToggle(group.id, value, group.multiSelect || false)}
                      >
                        {option.label}
                        <X className="h-3 w-3" />
                      </Badge>
                    );
                  });
                })}
              </div>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

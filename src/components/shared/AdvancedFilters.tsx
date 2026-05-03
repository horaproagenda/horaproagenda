import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { CompactFilterTrigger } from '@/components/shared/CompactFilterTrigger';
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
  /** Texto do botão. Default: "Filtros" */
  label?: string;
}

/**
 * Filtro padrão do app — segue o mesmo visual do filtro da Agenda:
 * botão compacto (h-7, text-[11px]) que abre um popover com header
 * "Filtros" + "Limpar" e lista rolável de opções.
 */
export function AdvancedFilters({
  groups,
  selectedFilters,
  onFilterChange,
  onClearAll,
  className,
  label = 'Filtros',
}: AdvancedFiltersProps) {
  const [open, setOpen] = useState(false);

  const totalActiveFilters = Object.values(selectedFilters).reduce(
    (acc, values) => acc + values.filter((v) => v !== 'all').length,
    0,
  );

  const handleOptionToggle = (
    groupId: string,
    value: string,
    multiSelect: boolean,
  ) => {
    const currentValues = selectedFilters[groupId] || [];

    if (multiSelect) {
      if (value === 'all') {
        onFilterChange(groupId, ['all']);
      } else {
        const newValues = currentValues.includes(value)
          ? currentValues.filter((v) => v !== value && v !== 'all')
          : [...currentValues.filter((v) => v !== 'all'), value];
        onFilterChange(groupId, newValues.length > 0 ? newValues : ['all']);
      }
    } else {
      onFilterChange(groupId, [value]);
    }
  };

  const getActiveFiltersForGroup = (groupId: string): string[] => {
    const values = selectedFilters[groupId] || ['all'];
    return values.filter((v) => v !== 'all');
  };

  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll();
    } else {
      groups.forEach((group) => {
        onFilterChange(group.id, ['all']);
      });
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <CompactFilterTrigger
          activeCount={totalActiveFilters}
          label={label}
          className={className}
        />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        {/* Header padrão Agenda */}
        <div className="flex items-center justify-between mb-2 px-1">
          <h4 className="text-xs font-semibold text-foreground">Filtros</h4>
          {totalActiveFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-6 px-2 text-[10px] gap-1"
            >
              <X className="h-3 w-3" />
              Limpar
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 pr-2 pb-1">
            {groups.map((group, index) => (
              <div key={group.id}>
                {index > 0 && <Separator className="mb-3" />}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {/* All option */}
                    <button
                      type="button"
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-left transition-colors',
                        selectedFilters[group.id]?.includes('all') ||
                          !selectedFilters[group.id] ||
                          selectedFilters[group.id].length === 0
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted',
                      )}
                      onClick={() =>
                        handleOptionToggle(
                          group.id,
                          'all',
                          group.multiSelect || false,
                        )
                      }
                    >
                      <Checkbox
                        checked={
                          selectedFilters[group.id]?.includes('all') ||
                          !selectedFilters[group.id] ||
                          selectedFilters[group.id].length === 0
                        }
                        className="h-3.5 w-3.5 pointer-events-none"
                      />
                      <span>Todos</span>
                    </button>

                    {group.options.map((option) => {
                      const isSelected = selectedFilters[group.id]?.includes(
                        option.value,
                      );
                      return (
                        <button
                          type="button"
                          key={option.value}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-left transition-colors',
                            isSelected
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-muted',
                          )}
                          onClick={() =>
                            handleOptionToggle(
                              group.id,
                              option.value,
                              group.multiSelect || false,
                            )
                          }
                        >
                          <Checkbox
                            checked={isSelected}
                            className="h-3.5 w-3.5 pointer-events-none"
                          />
                          {option.icon && (
                            <span className="text-muted-foreground">
                              {option.icon}
                            </span>
                          )}
                          <span className="truncate">{option.label}</span>
                        </button>
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
            <Separator className="my-2" />
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">
                Ativos
              </p>
              <div className="flex flex-wrap gap-1">
                {groups.map((group) => {
                  const activeFilters = getActiveFiltersForGroup(group.id);
                  return activeFilters.map((value) => {
                    const option = group.options.find(
                      (o) => o.value === value,
                    );
                    if (!option) return null;
                    return (
                      <Badge
                        key={`${group.id}-${value}`}
                        variant="secondary"
                        className="h-5 text-[10px] gap-1 cursor-pointer hover:bg-secondary/80"
                        onClick={() =>
                          handleOptionToggle(
                            group.id,
                            value,
                            group.multiSelect || false,
                          )
                        }
                      >
                        {option.label}
                        <X className="h-2.5 w-2.5" />
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

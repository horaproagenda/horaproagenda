import React, { useState, useMemo } from 'react';
import { Filter, Search, X, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface FilterOption {
  id: string;
  name: string;
}

interface UnifiedServiceFiltersProps {
  type: 'services' | 'packages';
  categories: string[];
  professionals: FilterOption[];
  rooms: FilterOption[];
  clients: FilterOption[];
  // Filter states
  selectedCategory: string | null;
  selectedProfessional: string | null;
  selectedRoom: string | null;
  selectedClient: string | null;
  selectedStatus: string | null;
  selectedSessions?: string | null;
  searchTerm: string;
  sortBy: string;
  hideSearch?: boolean;
  // Callbacks
  onCategoryChange: (category: string | null) => void;
  onProfessionalChange: (professionalId: string | null) => void;
  onRoomChange: (roomId: string | null) => void;
  onClientChange: (clientId: string | null) => void;
  onStatusChange: (status: string | null) => void;
  onSessionsChange?: (sessions: string | null) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: string) => void;
  onClearFilters: () => void;
}

export function UnifiedServiceFilters({
  type,
  categories,
  professionals,
  rooms,
  clients,
  selectedCategory,
  selectedProfessional,
  selectedRoom,
  selectedClient,
  selectedStatus,
  selectedSessions,
  searchTerm,
  sortBy,
  hideSearch,
  onCategoryChange,
  onProfessionalChange,
  onRoomChange,
  onClientChange,
  onStatusChange,
  onSessionsChange,
  onSearchChange,
  onSortChange,
  onClearFilters,
}: UnifiedServiceFiltersProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState({
    category: '',
    professional: '',
    room: '',
    client: '',
  });

  const hasActiveFilters = !!(selectedCategory || selectedProfessional || selectedRoom || selectedStatus);

  const activeFilterCount = [
    selectedCategory,
    selectedProfessional,
    selectedRoom,
    selectedStatus,
  ].filter(Boolean).length;

  const filteredCategories = useMemo(() => 
    categories.filter(c => c.toLowerCase().includes(localSearch.category.toLowerCase())),
    [categories, localSearch.category]
  );

  const filteredProfessionals = useMemo(() => 
    professionals.filter(p => p.name.toLowerCase().includes(localSearch.professional.toLowerCase())),
    [professionals, localSearch.professional]
  );

  const filteredRooms = useMemo(() => 
    rooms.filter(r => r.name.toLowerCase().includes(localSearch.room.toLowerCase())),
    [rooms, localSearch.room]
  );

  const filteredClients = useMemo(() => 
    clients.filter(c => c.name.toLowerCase().includes(localSearch.client.toLowerCase())),
    [clients, localSearch.client]
  );

  const sessionsOptions = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10+'];

  const sortOptions = type === 'services' ? [
    { value: 'name-asc', label: 'Nome A-Z' },
    { value: 'name-desc', label: 'Nome Z-A' },
    { value: 'price-asc', label: 'Preço ↑' },
    { value: 'price-desc', label: 'Preço ↓' },
    { value: 'date-asc', label: 'Mais antigo' },
    { value: 'date-desc', label: 'Mais recente' },
  ] : [
    { value: 'name-asc', label: 'Nome A-Z' },
    { value: 'name-desc', label: 'Nome Z-A' },
    { value: 'price-asc', label: 'Preço ↑' },
    { value: 'price-desc', label: 'Preço ↓' },
    { value: 'sessions-asc', label: 'Aplicações ↑' },
    { value: 'sessions-desc', label: 'Aplicações ↓' },
    { value: 'date-asc', label: 'Mais antigo' },
    { value: 'date-desc', label: 'Mais recente' },
  ];

  const FilterSection = ({ 
    title, 
    searchKey, 
    options, 
    selectedValue, 
    onSelect, 
    renderOption 
  }: { 
    title: string; 
    searchKey?: keyof typeof localSearch; 
    options: { id: string; label: string }[]; 
    selectedValue: string | null; 
    onSelect: (value: string | null) => void;
    renderOption?: (option: { id: string; label: string }) => React.ReactNode;
  }) => (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      {searchKey && options.length > 5 && (
        <Input
          placeholder={`Buscar ${title.toLowerCase()}...`}
          value={localSearch[searchKey]}
          onChange={(e) => setLocalSearch(prev => ({ ...prev, [searchKey]: e.target.value }))}
          className="h-7 text-xs"
        />
      )}
      <ScrollArea className={cn("pr-2", options.length > 5 ? "h-[120px]" : "")}>
        <div className="space-y-0.5">
          <button
            onClick={() => onSelect(null)}
            className={cn(
              "w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left",
              !selectedValue && "bg-muted font-medium"
            )}
          >
            <span>Todos</span>
            {!selectedValue && <Check className="h-3 w-3 text-primary" />}
          </button>
          {options.map(option => (
            <button
              key={option.id}
              onClick={() => onSelect(option.id)}
              className={cn(
                "w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left",
                selectedValue === option.id && "bg-muted font-medium"
              )}
            >
              {renderOption ? renderOption(option) : <span className="truncate">{option.label}</span>}
              {selectedValue === option.id && <Check className="h-3 w-3 text-primary flex-shrink-0" />}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      {/* Filter button */}
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className={cn(
              "h-8 gap-1.5",
              hasActiveFilters && "border-primary text-primary"
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="text-xs">Filtros</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px] min-w-4 justify-center">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Filtros</p>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      onClearFilters();
                      setFilterOpen(false);
                    }}
                  >
                    Limpar
                  </Button>
                )}
              </div>

              <Separator />

              <ScrollArea className="h-[420px] pr-2">
                <div className="space-y-3">
                  {/* Status */}
                  <FilterSection
                    title="Status"
                    options={[
                      { id: 'active', label: 'Ativo' },
                      { id: 'inactive', label: 'Inativo' },
                    ]}
                    selectedValue={selectedStatus}
                    onSelect={onStatusChange}
                  />

                  <Separator />

                  {/* Category */}
                  <FilterSection
                    title="Categoria"
                    searchKey="category"
                    options={filteredCategories.map(c => ({ id: c, label: c }))}
                    selectedValue={selectedCategory}
                    onSelect={onCategoryChange}
                  />

                  <Separator />

                  {/* Professional */}
                  <FilterSection
                    title="Profissional"
                    searchKey="professional"
                    options={filteredProfessionals.map(p => ({ id: p.id, label: p.name }))}
                    selectedValue={selectedProfessional}
                    onSelect={onProfessionalChange}
                  />

                  <Separator />

                  {/* Room */}
                  <FilterSection
                    title="Sala"
                    searchKey="room"
                    options={filteredRooms.map(r => ({ id: r.id, label: r.name }))}
                    selectedValue={selectedRoom}
                    onSelect={onRoomChange}
                  />
                </div>
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex items-center gap-1 overflow-x-auto">
          {selectedStatus && (
            <Badge variant="secondary" className="h-6 text-[10px] gap-1 shrink-0">
              {selectedStatus === 'active' ? 'Ativo' : 'Inativo'}
              <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => onStatusChange(null)} />
            </Badge>
          )}
          {selectedCategory && (
            <Badge variant="secondary" className="h-6 text-[10px] gap-1 shrink-0">
              {selectedCategory}
              <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => onCategoryChange(null)} />
            </Badge>
          )}
          {selectedProfessional && (
            <Badge variant="secondary" className="h-6 text-[10px] gap-1 shrink-0">
              {professionals.find(p => p.id === selectedProfessional)?.name}
              <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => onProfessionalChange(null)} />
            </Badge>
          )}
          {selectedRoom && (
            <Badge variant="secondary" className="h-6 text-[10px] gap-1 shrink-0">
              {rooms.find(r => r.id === selectedRoom)?.name}
              <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => onRoomChange(null)} />
            </Badge>
          )}
          {selectedClient && (
            <Badge variant="secondary" className="h-6 text-[10px] gap-1 shrink-0">
              {clients.find(c => c.id === selectedClient)?.name}
              <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => onClientChange(null)} />
            </Badge>
          )}
          {type === 'packages' && selectedSessions && (
            <Badge variant="secondary" className="h-6 text-[10px] gap-1 shrink-0">
              {selectedSessions} aplicações
              <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => onSessionsChange?.(null)} />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

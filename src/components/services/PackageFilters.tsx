import React, { useState, useMemo } from 'react';
import { X, Search, Download, ArrowUpDown, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { CompactFilterTrigger } from '@/components/shared/CompactFilterTrigger';
import { cn } from '@/lib/utils';

interface PackageFiltersProps {
  categories: string[];
  professionals: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  selectedCategory: string | null;
  selectedProfessional: string | null;
  selectedRoom: string | null;
  selectedClient: string | null;
  selectedSessions: string | null;
  selectedStatus: string | null;
  searchTerm: string;
  sortBy: string;
  onCategoryChange: (category: string | null) => void;
  onProfessionalChange: (professionalId: string | null) => void;
  onRoomChange: (roomId: string | null) => void;
  onClientChange: (clientId: string | null) => void;
  onSessionsChange: (sessions: string | null) => void;
  onStatusChange: (status: string | null) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: string) => void;
  onClearFilters: () => void;
  onExport: () => void;
}

export function PackageFilters({
  categories,
  professionals,
  rooms,
  clients,
  selectedCategory,
  selectedProfessional,
  selectedRoom,
  selectedClient,
  selectedSessions,
  selectedStatus,
  searchTerm,
  sortBy,
  onCategoryChange,
  onProfessionalChange,
  onRoomChange,
  onClientChange,
  onSessionsChange,
  onStatusChange,
  onSearchChange,
  onSortChange,
  onClearFilters,
  onExport,
}: PackageFiltersProps) {
  const [open, setOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [professionalSearch, setProfessionalSearch] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');

  const activeCount = [
    selectedCategory,
    selectedProfessional,
    selectedRoom,
    selectedClient,
    selectedSessions,
    selectedStatus,
  ].filter(Boolean).length;

  const hasActiveFilters = activeCount > 0 || !!searchTerm;

  const filteredCategories = useMemo(
    () =>
      categories.filter((c) =>
        c.toLowerCase().includes(categorySearch.toLowerCase()),
      ),
    [categories, categorySearch],
  );
  const filteredProfessionals = useMemo(
    () =>
      professionals.filter((p) =>
        p.name.toLowerCase().includes(professionalSearch.toLowerCase()),
      ),
    [professionals, professionalSearch],
  );
  const filteredRooms = useMemo(
    () =>
      rooms.filter((r) =>
        r.name.toLowerCase().includes(roomSearch.toLowerCase()),
      ),
    [rooms, roomSearch],
  );
  const filteredClients = useMemo(
    () =>
      clients.filter((c) =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase()),
      ),
    [clients, clientSearch],
  );

  const renderSection = <T,>({
    title,
    items,
    selected,
    onSelect,
    getId,
    getLabel,
    search,
    setSearch,
    showSearchAfter = 5,
  }: {
    title: string;
    items: T[];
    selected: string | null;
    onSelect: (v: string | null) => void;
    getId: (item: T) => string;
    getLabel: (item: T) => string;
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
          onClick={() => onSelect(null)}
          className={cn(
            'w-full flex items-center justify-between px-2 py-1 text-[11px] rounded text-left transition-colors',
            !selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
          )}
        >
          <span>Todos</span>
          {!selected && <Check className="h-3 w-3" />}
        </button>
        {items.map((item) => {
          const id = getId(item);
          const isSel = selected === id;
          return (
            <button
              type="button"
              key={id}
              onClick={() => onSelect(id)}
              className={cn(
                'w-full flex items-center justify-between px-2 py-1 text-[11px] rounded text-left transition-colors',
                isSel ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
              )}
            >
              <span className="truncate">{getLabel(item)}</span>
              {isSel && <Check className="h-3 w-3 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-[180px] max-w-[260px] flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-7 text-[11px]"
          />
        </div>

        {/* Filtros (popover unificado) */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <CompactFilterTrigger activeCount={activeCount} />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <div className="flex items-center justify-between mb-2 px-1">
              <h4 className="text-xs font-semibold text-foreground">Filtros</h4>
              {activeCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => {
                    onClearFilters();
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
                {renderSection({
                  title: 'Status',
                  items: [
                    { id: 'active', name: 'Ativo' },
                    { id: 'inactive', name: 'Inativo' },
                  ],
                  selected: selectedStatus,
                  onSelect: onStatusChange,
                  getId: (i) => i.id,
                  getLabel: (i) => i.name,
                })}
                <Separator />
                {renderSection({
                  title: 'Categoria',
                  items: filteredCategories.map((c) => ({ id: c, name: c })),
                  selected: selectedCategory,
                  onSelect: onCategoryChange,
                  getId: (i) => i.id,
                  getLabel: (i) => i.name,
                  search: categorySearch,
                  setSearch: setCategorySearch,
                })}
                <Separator />
                {renderSection({
                  title: 'Profissional',
                  items: filteredProfessionals,
                  selected: selectedProfessional,
                  onSelect: onProfessionalChange,
                  getId: (i) => i.id,
                  getLabel: (i) => i.name,
                  search: professionalSearch,
                  setSearch: setProfessionalSearch,
                })}
                <Separator />
                {renderSection({
                  title: 'Sala',
                  items: filteredRooms,
                  selected: selectedRoom,
                  onSelect: onRoomChange,
                  getId: (i) => i.id,
                  getLabel: (i) => i.name,
                  search: roomSearch,
                  setSearch: setRoomSearch,
                })}
                <Separator />
                {renderSection({
                  title: 'Cliente',
                  items: filteredClients,
                  selected: selectedClient,
                  onSelect: onClientChange,
                  getId: (i) => i.id,
                  getLabel: (i) => i.name,
                  search: clientSearch,
                  setSearch: setClientSearch,
                })}
                <Separator />
                {renderSection({
                  title: 'Sessões',
                  items: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10+'].map(
                    (v) => ({ id: v, name: v === '10+' ? '10+ sessões' : `${v} sessões` }),
                  ),
                  selected: selectedSessions,
                  onSelect: onSessionsChange,
                  getId: (i) => i.id,
                  getLabel: (i) => i.name,
                })}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {/* Sort */}
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="w-[140px] h-7 text-[11px]">
            <ArrowUpDown className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name-asc">Nome A-Z</SelectItem>
            <SelectItem value="name-desc">Nome Z-A</SelectItem>
            <SelectItem value="price-asc">Preço ↑</SelectItem>
            <SelectItem value="price-desc">Preço ↓</SelectItem>
            <SelectItem value="sessions-asc">Sessões ↑</SelectItem>
            <SelectItem value="sessions-desc">Sessões ↓</SelectItem>
            <SelectItem value="date-asc">Mais antigo</SelectItem>
            <SelectItem value="date-desc">Mais recente</SelectItem>
          </SelectContent>
        </Select>

        {/* Export */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] px-2"
          onClick={onExport}
        >
          <Download className="h-3 w-3 mr-1" />
          Exportar
        </Button>

        {/* Clear */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] px-2"
            onClick={onClearFilters}
          >
            <X className="h-3 w-3 mr-1" />
            Limpar
          </Button>
        )}
      </div>

      {/* Active badges */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {selectedStatus && (
            <Badge variant="secondary" className="h-5 text-[10px] gap-1">
              {selectedStatus === 'active' ? 'Ativo' : 'Inativo'}
              <X
                className="h-2.5 w-2.5 cursor-pointer"
                onClick={() => onStatusChange(null)}
              />
            </Badge>
          )}
          {selectedCategory && (
            <Badge variant="secondary" className="h-5 text-[10px] gap-1">
              {selectedCategory}
              <X
                className="h-2.5 w-2.5 cursor-pointer"
                onClick={() => onCategoryChange(null)}
              />
            </Badge>
          )}
          {selectedProfessional && (
            <Badge variant="secondary" className="h-5 text-[10px] gap-1">
              {professionals.find((p) => p.id === selectedProfessional)?.name}
              <X
                className="h-2.5 w-2.5 cursor-pointer"
                onClick={() => onProfessionalChange(null)}
              />
            </Badge>
          )}
          {selectedRoom && (
            <Badge variant="secondary" className="h-5 text-[10px] gap-1">
              {rooms.find((r) => r.id === selectedRoom)?.name}
              <X
                className="h-2.5 w-2.5 cursor-pointer"
                onClick={() => onRoomChange(null)}
              />
            </Badge>
          )}
          {selectedClient && (
            <Badge variant="secondary" className="h-5 text-[10px] gap-1">
              {clients.find((c) => c.id === selectedClient)?.name}
              <X
                className="h-2.5 w-2.5 cursor-pointer"
                onClick={() => onClientChange(null)}
              />
            </Badge>
          )}
          {selectedSessions && (
            <Badge variant="secondary" className="h-5 text-[10px] gap-1">
              {selectedSessions === '10+'
                ? '10+ sessões'
                : `${selectedSessions} sessões`}
              <X
                className="h-2.5 w-2.5 cursor-pointer"
                onClick={() => onSessionsChange(null)}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

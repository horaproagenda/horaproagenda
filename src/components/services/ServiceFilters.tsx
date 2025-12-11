import React, { useState, useMemo } from 'react';
import { Filter, X, Search, Download, ArrowUpDown } from 'lucide-react';
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
import { cn } from '@/lib/utils';

interface ServiceFiltersProps {
  categories: string[];
  professionals: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  selectedCategory: string | null;
  selectedProfessional: string | null;
  selectedRoom: string | null;
  selectedClient: string | null;
  searchTerm: string;
  sortBy: string;
  onCategoryChange: (category: string | null) => void;
  onProfessionalChange: (professionalId: string | null) => void;
  onRoomChange: (roomId: string | null) => void;
  onClientChange: (clientId: string | null) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: string) => void;
  onClearFilters: () => void;
  onExport: () => void;
}

export function ServiceFilters({
  categories,
  professionals,
  rooms,
  clients,
  selectedCategory,
  selectedProfessional,
  selectedRoom,
  selectedClient,
  searchTerm,
  sortBy,
  onCategoryChange,
  onProfessionalChange,
  onRoomChange,
  onClientChange,
  onSearchChange,
  onSortChange,
  onClearFilters,
  onExport,
}: ServiceFiltersProps) {
  const [professionalSearch, setProfessionalSearch] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');

  const hasActiveFilters = selectedCategory || selectedProfessional || selectedRoom || selectedClient || searchTerm;

  const filteredProfessionals = useMemo(() => 
    professionals.filter(p => p.name.toLowerCase().includes(professionalSearch.toLowerCase())),
    [professionals, professionalSearch]
  );

  const filteredRooms = useMemo(() => 
    rooms.filter(r => r.name.toLowerCase().includes(roomSearch.toLowerCase())),
    [rooms, roomSearch]
  );

  const filteredClients = useMemo(() => 
    clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())),
    [clients, clientSearch]
  );

  return (
    <div className="space-y-4">
      {/* Search and Sort */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="w-[180px]">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name-asc">Nome A-Z</SelectItem>
            <SelectItem value="name-desc">Nome Z-A</SelectItem>
            <SelectItem value="price-asc">Preço ↑</SelectItem>
            <SelectItem value="price-desc">Preço ↓</SelectItem>
            <SelectItem value="date-asc">Mais antigo</SelectItem>
            <SelectItem value="date-desc">Mais recente</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </div>

      {/* Category filter as badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Badge
          variant="outline"
          className={cn(
            'cursor-pointer transition-colors',
            !selectedCategory && 'bg-primary text-primary-foreground border-primary'
          )}
          onClick={() => onCategoryChange(null)}
        >
          Todas
        </Badge>
        {categories.map(category => (
          <Badge
            key={category}
            variant="outline"
            className={cn(
              'cursor-pointer transition-colors',
              selectedCategory === category && 'bg-primary text-primary-foreground border-primary'
            )}
            onClick={() => onCategoryChange(category)}
          >
            {category}
          </Badge>
        ))}
      </div>

      {/* Additional filters with search */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Professional filter with search */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[180px] justify-start">
              {selectedProfessional 
                ? professionals.find(p => p.id === selectedProfessional)?.name 
                : 'Profissional'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-2">
            <Input
              placeholder="Buscar profissional..."
              value={professionalSearch}
              onChange={(e) => setProfessionalSearch(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              <Button
                variant={!selectedProfessional ? "secondary" : "ghost"}
                className="w-full justify-start text-sm"
                onClick={() => {
                  onProfessionalChange(null);
                  setProfessionalSearch('');
                }}
              >
                Todos profissionais
              </Button>
              {filteredProfessionals.map(prof => (
                <Button
                  key={prof.id}
                  variant={selectedProfessional === prof.id ? "secondary" : "ghost"}
                  className="w-full justify-start text-sm"
                  onClick={() => {
                    onProfessionalChange(prof.id);
                    setProfessionalSearch('');
                  }}
                >
                  {prof.name}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Room filter with search */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[180px] justify-start">
              {selectedRoom 
                ? rooms.find(r => r.id === selectedRoom)?.name 
                : 'Sala'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-2">
            <Input
              placeholder="Buscar sala..."
              value={roomSearch}
              onChange={(e) => setRoomSearch(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              <Button
                variant={!selectedRoom ? "secondary" : "ghost"}
                className="w-full justify-start text-sm"
                onClick={() => {
                  onRoomChange(null);
                  setRoomSearch('');
                }}
              >
                Todas salas
              </Button>
              {filteredRooms.map(room => (
                <Button
                  key={room.id}
                  variant={selectedRoom === room.id ? "secondary" : "ghost"}
                  className="w-full justify-start text-sm"
                  onClick={() => {
                    onRoomChange(room.id);
                    setRoomSearch('');
                  }}
                >
                  {room.name}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Client filter with search */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[180px] justify-start">
              {selectedClient 
                ? clients.find(c => c.id === selectedClient)?.name 
                : 'Cliente'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-2">
            <Input
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              <Button
                variant={!selectedClient ? "secondary" : "ghost"}
                className="w-full justify-start text-sm"
                onClick={() => {
                  onClientChange(null);
                  setClientSearch('');
                }}
              >
                Todos clientes
              </Button>
              {filteredClients.map(client => (
                <Button
                  key={client.id}
                  variant={selectedClient === client.id ? "secondary" : "ghost"}
                  className="w-full justify-start text-sm"
                  onClick={() => {
                    onClientChange(client.id);
                    setClientSearch('');
                  }}
                >
                  {client.name}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}

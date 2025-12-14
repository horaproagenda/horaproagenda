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
  const [professionalSearch, setProfessionalSearch] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [sessionsSearch, setSessionsSearch] = useState('');

  const hasActiveFilters = selectedCategory || selectedProfessional || selectedRoom || selectedClient || selectedSessions || selectedStatus || searchTerm;

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
    <div className="space-y-3">
      {/* All Filters - Compact Layout */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-[180px] max-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Status filter badges */}
        <div className="flex items-center gap-1 border rounded-md px-2 py-1 bg-background">
          <Badge
            variant="outline"
            className={cn(
              'cursor-pointer transition-colors text-xs px-2 py-0.5',
              !selectedStatus && 'bg-primary text-primary-foreground border-primary'
            )}
            onClick={() => onStatusChange(null)}
          >
            Todos
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              'cursor-pointer transition-colors text-xs px-2 py-0.5',
              selectedStatus === 'active' && 'bg-green-500 text-white border-green-500'
            )}
            onClick={() => onStatusChange('active')}
          >
            Ativos
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              'cursor-pointer transition-colors text-xs px-2 py-0.5',
              selectedStatus === 'inactive' && 'bg-muted-foreground text-white border-muted-foreground'
            )}
            onClick={() => onStatusChange('inactive')}
          >
            Inativos
          </Badge>
        </div>

        {/* Category dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1">
              <Filter className="h-3.5 w-3.5" />
              {selectedCategory || 'Categoria'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2">
            <div className="space-y-1 max-h-[250px] overflow-y-auto">
              <Button
                variant={!selectedCategory ? "secondary" : "ghost"}
                className="w-full justify-start text-sm h-8"
                onClick={() => onCategoryChange(null)}
              >
                Todas categorias
              </Button>
              {categories.map(category => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "secondary" : "ghost"}
                  className="w-full justify-start text-sm h-8"
                  onClick={() => onCategoryChange(category)}
                >
                  {category}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Professional filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 max-w-[150px] truncate">
              {selectedProfessional 
                ? professionals.find(p => p.id === selectedProfessional)?.name 
                : 'Profissional'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-2">
            <Input
              placeholder="Buscar..."
              value={professionalSearch}
              onChange={(e) => setProfessionalSearch(e.target.value)}
              className="mb-2 h-8"
            />
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              <Button
                variant={!selectedProfessional ? "secondary" : "ghost"}
                className="w-full justify-start text-sm h-8"
                onClick={() => {
                  onProfessionalChange(null);
                  setProfessionalSearch('');
                }}
              >
                Todos
              </Button>
              {filteredProfessionals.map(prof => (
                <Button
                  key={prof.id}
                  variant={selectedProfessional === prof.id ? "secondary" : "ghost"}
                  className="w-full justify-start text-sm h-8"
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

        {/* Room filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 max-w-[130px] truncate">
              {selectedRoom 
                ? rooms.find(r => r.id === selectedRoom)?.name 
                : 'Sala'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2">
            <Input
              placeholder="Buscar..."
              value={roomSearch}
              onChange={(e) => setRoomSearch(e.target.value)}
              className="mb-2 h-8"
            />
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              <Button
                variant={!selectedRoom ? "secondary" : "ghost"}
                className="w-full justify-start text-sm h-8"
                onClick={() => {
                  onRoomChange(null);
                  setRoomSearch('');
                }}
              >
                Todas
              </Button>
              {filteredRooms.map(room => (
                <Button
                  key={room.id}
                  variant={selectedRoom === room.id ? "secondary" : "ghost"}
                  className="w-full justify-start text-sm h-8"
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

        {/* Client filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 max-w-[130px] truncate">
              {selectedClient 
                ? clients.find(c => c.id === selectedClient)?.name 
                : 'Cliente'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-2">
            <Input
              placeholder="Buscar..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="mb-2 h-8"
            />
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              <Button
                variant={!selectedClient ? "secondary" : "ghost"}
                className="w-full justify-start text-sm h-8"
                onClick={() => {
                  onClientChange(null);
                  setClientSearch('');
                }}
              >
                Todos
              </Button>
              {filteredClients.map(client => (
                <Button
                  key={client.id}
                  variant={selectedClient === client.id ? "secondary" : "ghost"}
                  className="w-full justify-start text-sm h-8"
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

        {/* Sessions filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              {selectedSessions 
                ? selectedSessions === '10+' ? '10+ sessões' : `${selectedSessions} sess.`
                : 'Sessões'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[180px] p-2">
            <Input
              placeholder="Número..."
              value={sessionsSearch}
              onChange={(e) => setSessionsSearch(e.target.value)}
              type="number"
              min="1"
              className="mb-2 h-8"
            />
            <div className="space-y-1">
              <Button
                variant={!selectedSessions ? "secondary" : "ghost"}
                className="w-full justify-start text-sm h-8"
                onClick={() => {
                  onSessionsChange(null);
                  setSessionsSearch('');
                }}
              >
                Todas
              </Button>
              {sessionsSearch && (
                <Button
                  variant="ghost"
                  className="w-full justify-start text-sm h-8"
                  onClick={() => {
                    onSessionsChange(sessionsSearch);
                    setSessionsSearch('');
                  }}
                >
                  {sessionsSearch} sessão(ões)
                </Button>
              )}
              {['1', '5', '10', '10+'].map(val => (
                <Button
                  key={val}
                  variant={selectedSessions === val ? "secondary" : "ghost"}
                  className="w-full justify-start text-sm h-8"
                  onClick={() => onSessionsChange(val)}
                >
                  {val === '1' ? '1 sessão' : val === '10+' ? '10+ sessões' : `${val} sessões`}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort */}
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="w-[140px] h-9">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
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
        <Button variant="outline" size="sm" className="h-9" onClick={onExport}>
          <Download className="h-3.5 w-3.5 mr-1" />
          Exportar
        </Button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9" onClick={onClearFilters}>
            <X className="h-3.5 w-3.5 mr-1" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}

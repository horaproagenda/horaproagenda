import React from 'react';
import { Filter, X } from 'lucide-react';
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
  onCategoryChange: (category: string | null) => void;
  onProfessionalChange: (professionalId: string | null) => void;
  onRoomChange: (roomId: string | null) => void;
  onClientChange: (clientId: string | null) => void;
  onSessionsChange: (sessions: string | null) => void;
  onStatusChange: (status: string | null) => void;
  onClearFilters: () => void;
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
  onCategoryChange,
  onProfessionalChange,
  onRoomChange,
  onClientChange,
  onSessionsChange,
  onStatusChange,
  onClearFilters,
}: PackageFiltersProps) {
  const hasActiveFilters = selectedCategory || selectedProfessional || selectedRoom || selectedClient || selectedSessions || selectedStatus;

  return (
    <div className="space-y-4">
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

      {/* Additional filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={selectedProfessional || 'all'}
          onValueChange={(value) => onProfessionalChange(value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Profissional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos profissionais</SelectItem>
            {professionals.map(prof => (
              <SelectItem key={prof.id} value={prof.id}>
                {prof.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedRoom || 'all'}
          onValueChange={(value) => onRoomChange(value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sala" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas salas</SelectItem>
            {rooms.map(room => (
              <SelectItem key={room.id} value={room.id}>
                {room.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedClient || 'all'}
          onValueChange={(value) => onClientChange(value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos clientes</SelectItem>
            {clients.map(client => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedSessions || 'all'}
          onValueChange={(value) => onSessionsChange(value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sessões" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas sessões</SelectItem>
            <SelectItem value="1">1 sessão</SelectItem>
            <SelectItem value="5">5 sessões</SelectItem>
            <SelectItem value="10">10 sessões</SelectItem>
            <SelectItem value="10+">10+ sessões</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={selectedStatus || 'all'}
          onValueChange={(value) => onStatusChange(value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>

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

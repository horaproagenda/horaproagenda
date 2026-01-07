import React, { useState, useMemo } from 'react';
import { Filter, X, Search, Download, ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
interface ServiceFiltersProps {
  categories: string[];
  professionals: {
    id: string;
    name: string;
  }[];
  rooms: {
    id: string;
    name: string;
  }[];
  clients: {
    id: string;
    name: string;
  }[];
  selectedCategory: string | null;
  selectedProfessional: string | null;
  selectedRoom: string | null;
  selectedClient: string | null;
  selectedStatus: string | null;
  searchTerm: string;
  sortBy: string;
  onCategoryChange: (category: string | null) => void;
  onProfessionalChange: (professionalId: string | null) => void;
  onRoomChange: (roomId: string | null) => void;
  onClientChange: (clientId: string | null) => void;
  onStatusChange: (status: string | null) => void;
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
  selectedStatus,
  searchTerm,
  sortBy,
  onCategoryChange,
  onProfessionalChange,
  onRoomChange,
  onClientChange,
  onStatusChange,
  onSearchChange,
  onSortChange,
  onClearFilters,
  onExport
}: ServiceFiltersProps) {
  const [professionalSearch, setProfessionalSearch] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const hasActiveFilters = selectedCategory || selectedProfessional || selectedRoom || selectedClient || selectedStatus || searchTerm;
  const filteredProfessionals = useMemo(() => professionals.filter(p => p.name.toLowerCase().includes(professionalSearch.toLowerCase())), [professionals, professionalSearch]);
  const filteredRooms = useMemo(() => rooms.filter(r => r.name.toLowerCase().includes(roomSearch.toLowerCase())), [rooms, roomSearch]);
  const filteredClients = useMemo(() => clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())), [clients, clientSearch]);
  return <div className="space-y-3">
      {/* Search, Sort and Filters - Compact Layout */}
      
    </div>;
}
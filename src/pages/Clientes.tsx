import { useState, useMemo, useEffect } from 'react';
import { useLogAccessOnMount } from '@/hooks/useLogAccess';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useListPosition } from '@/hooks/useListPosition';
import { ResumePositionBanner } from '@/components/shared/ResumePositionBanner';
import { Search, Users, Loader2, UserCheck, UserX, Upload, Download, Plus, LayoutGrid, List, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, UserPlus, Link2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientCard } from '@/components/clients/ClientCard';
import { NewClientDialog } from '@/components/clients/NewClientDialog';
import { GenerateRegistrationLinkDialog } from '@/components/clients/GenerateRegistrationLinkDialog';
import { BulkImportClientsDialog } from '@/components/clients/BulkImportClientsDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useClients } from '@/hooks/useClients';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AdvancedFilters, type FilterGroup } from '@/components/shared/AdvancedFilters';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SortField = 'name' | 'created_at' | 'status';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

const Clientes = () => {
  useLogAccessOnMount({ module: 'clientes', action: 'view', fieldsViewed: ['name', 'phone', 'email', 'cpf', 'birthdate', 'address', 'tags', 'last_appointment'] });
  const [searchTerm, setSearchTerm] = useLocalStorage<string>('clientes:searchTerm', '');
  const [viewMode, setViewMode] = useLocalStorage<'grid' | 'list'>('clientes:viewMode', 'grid');
  const [selectedFilters, setSelectedFilters] = useLocalStorage<Record<string, string[]>>('clientes:filters', {
    status: ['all'],
    professional: ['all'],
  });
  const [sortField, setSortField] = useLocalStorage<SortField>('clientes:sortField', 'name');
  const [sortDirection, setSortDirection] = useLocalStorage<SortDirection>('clientes:sortDirection', 'asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useLocalStorage<number>('clientes:itemsPerPage', 25);
  
  const { clients, isLoading, refetch } = useClients();
  const { professionals } = useProfessionals();
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  
  const isAdmin = hasRole('admin');
  const isReceptionist = hasRole('receptionist');

  // Resume position system
  const { savedState, savePosition, restore, dismiss } = useListPosition({ key: 'clientes' });

  // Restaura page/search/letter automaticamente quando o banner é aceito,
  // mas mantém o banner visível enquanto o usuário não decide.
  const handleResume = () => {
    if (savedState?.page) setCurrentPage(savedState.page);
    if (savedState?.search) setSearchTerm(savedState.search);
    restore();
  };

  // Salva mudanças relevantes
  useEffect(() => {
    savePosition({ page: currentPage, search: searchTerm });
  }, [currentPage, searchTerm, savePosition]);

  // Invalida "Continuar em [cliente]" se o registro foi apagado/desativado,
  // evitando banner com link morto.
  useEffect(() => {
    if (!savedState?.lastItemId || isLoading) return;
    const stillExists = clients.some((c) => c.id === savedState.lastItemId);
    if (!stillExists) {
      // limpa do storage e do estado em memória para sumir o banner com link morto
      dismiss();
    }
  }, [clients, isLoading, savedState?.lastItemId, dismiss]);

  const activeClients = clients.filter(c => c.is_active);
  const inactiveClients = clients.filter(c => !c.is_active);

  // Build filter groups - all filters together
  const filterGroups: FilterGroup[] = useMemo(() => {
    const groups: FilterGroup[] = [
      {
        id: 'status',
        label: 'Status',
        options: [
          { value: 'active', label: 'Ativos' },
          { value: 'inactive', label: 'Inativos' },
        ],
        multiSelect: false,
      },
      {
        id: 'hasProfessional',
        label: 'Profissional Vinculado',
        options: [
          { value: 'with', label: 'Com profissional' },
          { value: 'without', label: 'Sem profissional' },
        ],
        multiSelect: false,
      },
    ];

    if (isAdmin || isReceptionist) {
      groups.push({
        id: 'professional',
        label: 'Profissional Específico',
        options: professionals.filter(p => p.is_active).map(pro => ({
          value: pro.id,
          label: pro.name,
        })),
        multiSelect: true,
      });
    }

    return groups;
  }, [professionals, isAdmin, isReceptionist]);

  const handleFilterChange = (groupId: string, values: string[]) => {
    setSelectedFilters(prev => ({ ...prev, [groupId]: values }));
    setCurrentPage(1); // Reset to first page on filter change
  };

  const handleClearFilters = () => {
    setSelectedFilters({
      status: ['all'],
      professional: ['all'],
      hasProfessional: ['all'],
    });
    setCurrentPage(1);
  };

  const hasActiveFilters = useMemo(() => {
    return Object.values(selectedFilters).some(values => 
      values.length > 0 && !values.includes('all')
    );
  }, [selectedFilters]);

  const filteredAndSortedClients = useMemo(() => {
    // First, filter
    const filtered = clients.filter(client => {
      const matchesSearch = 
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        client.phone.includes(searchTerm) ||
        (client.cpf && client.cpf.includes(searchTerm));
      
      // Status filter
      const statusFilter = selectedFilters.status || ['all'];
      const matchesStatus = 
        statusFilter.includes('all') ||
        (statusFilter.includes('active') && client.is_active) ||
        (statusFilter.includes('inactive') && !client.is_active);

      // Has professional filter
      const hasProfessionalFilter = selectedFilters.hasProfessional || ['all'];
      const matchesHasProfessional = 
        hasProfessionalFilter.includes('all') ||
        (hasProfessionalFilter.includes('with') && client.assigned_professional_id) ||
        (hasProfessionalFilter.includes('without') && !client.assigned_professional_id);

      // Specific professional filter
      const professionalFilter = selectedFilters.professional || ['all'];
      const matchesProfessional = 
        professionalFilter.includes('all') ||
        professionalFilter.includes(client.assigned_professional_id || '');

      return matchesSearch && matchesStatus && matchesHasProfessional && matchesProfessional;
    });

    // Then, sort
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'pt-BR');
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'status':
          comparison = (a.is_active === b.is_active) ? 0 : a.is_active ? -1 : 1;
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [clients, searchTerm, selectedFilters, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedClients.length / itemsPerPage);
  const paginatedClients = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedClients.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedClients, currentPage, itemsPerPage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1" /> 
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const handleExport = () => {
    const csvContent = [
      ['Nome', 'Telefone', 'Email', 'CPF', 'Status', 'Data de Cadastro'].join(','),
      ...filteredAndSortedClients.map(client => [
        `"${client.name}"`,
        client.phone,
        client.email || '',
        client.cpf || '',
        client.is_active ? 'Ativo' : 'Inativo',
        new Date(client.created_at).toLocaleDateString('pt-BR'),
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const getProfessionalName = (professionalId: string | null) => {
    if (!professionalId) return '-';
    const professional = professionals.find(p => p.id === professionalId);
    return professional?.name || '-';
  };

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  return (
    <AppLayout 
      title="Clientes" 
      subtitle="Gerencie sua base de clientes"
    >
      <div className="space-y-4 animate-fade-in">
        {/* Resume position banner */}
        <ResumePositionBanner
          state={savedState}
          onResume={handleResume}
          onDismiss={dismiss}
        />

        {/* Search - Full width on top */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome, email, telefone ou CPF..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Actions Row - Filters, Import/Export on left, View Toggle and New Client on right */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* All Filters Together */}
            <AdvancedFilters
              groups={filterGroups}
              selectedFilters={selectedFilters}
              onFilterChange={handleFilterChange}
              onClearAll={handleClearFilters}
            />

            {/* Import/Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Importar</span>
                  /
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Exportar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <BulkImportClientsDialog onImported={refetch}>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar Clientes
                  </DropdownMenuItem>
                </BulkImportClientsDialog>
                <DropdownMenuItem onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar Clientes
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex items-center border border-border rounded-md">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-2 rounded-r-none"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-2 rounded-l-none"
                onClick={() => setViewMode('list')}
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* New Client Button - dropdown: manual ou link */}
            <NewClientButtonGroup onRefetch={refetch} />

          </div>
        </div>

        {/* Compact Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2 transition-all duration-200 hover:shadow-sm">
            <div className="rounded-md bg-primary/10 p-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-none">{clients.length}</p>
              <p className="text-[10px] text-muted-foreground truncate">Total</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2 transition-all duration-200 hover:shadow-sm">
            <div className="rounded-md bg-success/10 p-1.5">
              <UserCheck className="h-3.5 w-3.5 text-success" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-none">{activeClients.length}</p>
              <p className="text-[10px] text-muted-foreground truncate">Ativos</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2 transition-all duration-200 hover:shadow-sm">
            <div className="rounded-md bg-destructive/10 p-1.5">
              <UserX className="h-3.5 w-3.5 text-destructive" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-none">{inactiveClients.length}</p>
              <p className="text-[10px] text-muted-foreground truncate">Inativos</p>
            </div>
          </div>
        </div>

        {/* Clients View */}
        <div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredAndSortedClients.length > 0 ? (
            <>
              {viewMode === 'grid' ? (
                /* Grid View */
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {paginatedClients.map((client, index) => (
                    <div
                      key={client.id}
                      style={{ animationDelay: `${index * 30}ms` }}
                      className="animate-scale-in"
                      onClickCapture={() =>
                        savePosition({
                          lastItemId: client.id,
                          lastItemLabel: client.name,
                          letter: client.name?.charAt(0).toUpperCase(),
                        })
                      }
                    >
                      <ClientCard client={client} />
                    </div>
                  ))}
                </div>
              ) : (
                /* Table/List View */
                <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead 
                          className="text-xs font-medium cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('name')}
                        >
                          <span className="flex items-center">
                            Nome
                            <SortIcon field="name" />
                          </span>
                        </TableHead>
                        <TableHead className="text-xs font-medium">Telefone</TableHead>
                        <TableHead className="text-xs font-medium hidden sm:table-cell">Email</TableHead>
                        <TableHead className="text-xs font-medium hidden md:table-cell">Profissional</TableHead>
                        <TableHead 
                          className="text-xs font-medium cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('status')}
                        >
                          <span className="flex items-center">
                            Status
                            <SortIcon field="status" />
                          </span>
                        </TableHead>
                        <TableHead 
                          className="text-xs font-medium hidden lg:table-cell cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('created_at')}
                        >
                          <span className="flex items-center">
                            Desde
                            <SortIcon field="created_at" />
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedClients.map((client, index) => (
                        <TableRow 
                          key={client.id}
                          className="cursor-pointer transition-colors hover:bg-muted/50"
                          onClick={() => {
                            savePosition({
                              lastItemId: client.id,
                              lastItemLabel: client.name,
                              letter: client.name?.charAt(0).toUpperCase(),
                            });
                            navigate(`/clientes/${client.id}`);
                          }}
                          style={{ animationDelay: `${index * 20}ms` }}
                        >
                          <TableCell className="text-sm font-medium py-2">
                            {client.name}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground py-2">
                            {client.phone}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground py-2 hidden sm:table-cell">
                            {client.email || '-'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground py-2 hidden md:table-cell">
                            {getProfessionalName(client.assigned_professional_id)}
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge 
                              variant={client.is_active ? "default" : "secondary"}
                              className="text-[9px] px-1.5 py-0 h-4"
                            >
                              {client.is_active ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground py-2 hidden lg:table-cell">
                            {format(new Date(client.created_at), "dd/MM/yy", { locale: ptBR })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">Exibindo</span>
                  <Select
                    value={String(itemsPerPage)}
                    onValueChange={(value) => {
                      setItemsPerPage(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-7 w-16 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ITEMS_PER_PAGE_OPTIONS.map(option => (
                        <SelectItem key={option} value={String(option)} className="text-xs">
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>de {filteredAndSortedClients.length}</span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  
                  <div className="flex items-center gap-1 px-2">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "ghost"}
                          size="sm"
                          className="h-7 w-7 p-0 text-xs"
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
              <Users className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">
                {searchTerm || hasActiveFilters
                  ? 'Nenhum cliente encontrado' 
                  : 'Nenhum cliente cadastrado'}
              </p>
              <NewClientDialog onClientCreated={refetch}>
                <Button className="mt-3" variant="secondary" size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Cadastrar Cliente
                </Button>
              </NewClientDialog>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Clientes;

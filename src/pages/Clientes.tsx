import { useState, useMemo } from 'react';
import { Search, Users, Loader2, UserCheck, UserX, Upload, Download, Plus } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientCard } from '@/components/clients/ClientCard';
import { NewClientDialog } from '@/components/clients/NewClientDialog';
import { BulkImportClientsDialog } from '@/components/clients/BulkImportClientsDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useClients } from '@/hooks/useClients';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useAuth } from '@/contexts/AuthContext';
import { AdvancedFilters, type FilterGroup } from '@/components/shared/AdvancedFilters';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const Clientes = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
    status: ['all'],
    professional: ['all'],
  });
  const { clients, isLoading, refetch } = useClients();
  const { professionals } = useProfessionals();
  const { hasRole } = useAuth();
  
  const isAdmin = hasRole('admin');
  const isReceptionist = hasRole('receptionist');

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
  };

  const handleClearFilters = () => {
    setSelectedFilters({
      status: ['all'],
      professional: ['all'],
      hasProfessional: ['all'],
    });
  };

  const hasActiveFilters = useMemo(() => {
    return Object.values(selectedFilters).some(values => 
      values.length > 0 && !values.includes('all')
    );
  }, [selectedFilters]);

  const filteredClients = useMemo(() => {
    return clients.filter(client => {
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
  }, [clients, searchTerm, selectedFilters]);

  const handleExport = () => {
    const csvContent = [
      ['Nome', 'Telefone', 'Email', 'CPF', 'Status', 'Data de Cadastro'].join(','),
      ...filteredClients.map(client => [
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

  return (
    <AppLayout 
      title="Clientes" 
      subtitle="Gerencie sua base de clientes"
    >
      <div className="space-y-4 animate-fade-in">
        {/* Search - Full width on top */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome, email, telefone ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Actions Row - Filters, Import/Export on left, New Client on right */}
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

          {/* New Client Button - Right Side */}
          <NewClientDialog onClientCreated={refetch}>
            <Button size="sm" className="h-9 gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              <span>Novo Cliente</span>
            </Button>
          </NewClientDialog>
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

        {/* Clients Grid */}
        <div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredClients.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredClients.map((client, index) => (
                <div
                  key={client.id}
                  style={{ animationDelay: `${index * 30}ms` }}
                  className="animate-scale-in"
                >
                  <ClientCard client={client} />
                </div>
              ))}
            </div>
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

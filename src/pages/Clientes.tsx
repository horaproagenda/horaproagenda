import { useState } from 'react';
import { Search, Users, Loader2, UserCheck, UserX, Filter, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientCard } from '@/components/clients/ClientCard';
import { NewClientDialog } from '@/components/clients/NewClientDialog';
import { BulkImportClientsDialog } from '@/components/clients/BulkImportClientsDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useClients } from '@/hooks/useClients';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useAuth } from '@/contexts/AuthContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type StatusFilter = 'all' | 'active' | 'inactive';

const Clientes = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [professionalFilter, setProfessionalFilter] = useState<string>('all');
  const { clients, isLoading, refetch } = useClients();
  const { professionals } = useProfessionals();
  const { hasRole } = useAuth();
  
  const isAdmin = hasRole('admin');
  const isReceptionist = hasRole('receptionist');

  const activeClients = clients.filter(c => c.is_active);
  const inactiveClients = clients.filter(c => !c.is_active);

  const filteredClients = clients.filter(client => {
    const matchesSearch = 
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      client.phone.includes(searchTerm) ||
      (client.cpf && client.cpf.includes(searchTerm));
    
    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'active' && client.is_active) ||
      (statusFilter === 'inactive' && !client.is_active);

    const matchesProfessional = 
      professionalFilter === 'all' ||
      client.assigned_professional_id === professionalFilter ||
      (professionalFilter === 'unassigned' && !client.assigned_professional_id);

    return matchesSearch && matchesStatus && matchesProfessional;
  });

  return (
    <AppLayout 
      title="Clientes" 
      subtitle="Gerencie sua base de clientes"
    >
      {/* Header Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap flex-1 gap-2 items-center">
          {/* Search - Larger */}
          <div className="relative flex-1 min-w-[250px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar por nome, email, telefone ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          
          {/* Combined Filters */}
          <div className="flex items-center gap-1 border rounded-md px-2 py-1 bg-background">
            <Badge
              variant="outline"
              className={`cursor-pointer transition-colors text-xs px-2 py-0.5 ${statusFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              Todos
            </Badge>
            <Badge
              variant="outline"
              className={`cursor-pointer transition-colors text-xs px-2 py-0.5 ${statusFilter === 'active' ? 'bg-green-500 text-white border-green-500' : ''}`}
              onClick={() => setStatusFilter('active')}
            >
              Ativos
            </Badge>
            <Badge
              variant="outline"
              className={`cursor-pointer transition-colors text-xs px-2 py-0.5 ${statusFilter === 'inactive' ? 'bg-muted-foreground text-white border-muted-foreground' : ''}`}
              onClick={() => setStatusFilter('inactive')}
            >
              Inativos
            </Badge>
          </div>
          
          {/* Professional Filter */}
          {(isAdmin || isReceptionist) && (
            <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
              <SelectTrigger className="w-[180px] h-10">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Profissional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Profissionais</SelectItem>
                <SelectItem value="unassigned">Sem profissional</SelectItem>
                {professionals.filter(p => p.is_active).map(pro => (
                  <SelectItem key={pro.id} value={pro.id}>{pro.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex gap-2">
          <BulkImportClientsDialog onImported={refetch}>
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Importar
            </Button>
          </BulkImportClientsDialog>
          <NewClientDialog onClientCreated={refetch} />
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="rounded-lg bg-primary/10 p-2">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-display font-semibold">{clients.length}</p>
            <p className="text-xs text-muted-foreground">Total de clientes</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="rounded-lg bg-green-500/10 p-2">
            <UserCheck className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <p className="text-2xl font-display font-semibold">{activeClients.length}</p>
            <p className="text-xs text-muted-foreground">Clientes ativos</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="rounded-lg bg-destructive/10 p-2">
            <UserX className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <p className="text-2xl font-display font-semibold">{inactiveClients.length}</p>
            <p className="text-xs text-muted-foreground">Clientes inativos</p>
          </div>
        </div>
      </div>

      {/* Clients Grid */}
      <div className="mt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredClients.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClients.map((client, index) => (
              <div
                key={client.id}
                style={{ animationDelay: `${index * 50}ms` }}
                className="animate-slide-up"
              >
                <ClientCard client={client} />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-muted-foreground">
              {searchTerm || statusFilter !== 'all'
                ? 'Nenhum cliente encontrado para sua busca' 
                : 'Nenhum cliente cadastrado'}
            </p>
            <NewClientDialog onClientCreated={refetch}>
              <Button className="mt-4" variant="secondary">
                Cadastrar Cliente
              </Button>
            </NewClientDialog>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Clientes;

import { useState } from 'react';
import { Search, Plus, Users, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientCard } from '@/components/clients/ClientCard';
import { NewClientDialog } from '@/components/clients/NewClientDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useClients } from '@/hooks/useClients';

const Clientes = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const { clients, isLoading, refetch } = useClients();

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    client.phone.includes(searchTerm)
  );

  return (
    <AppLayout 
      title="Clientes" 
      subtitle="Gerencie sua base de clientes"
    >
      {/* Header Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome, email ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <NewClientDialog onClientCreated={refetch} />
      </div>

      {/* Stats */}
      <div className="mt-6 flex items-center gap-6 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-display font-semibold">{clients.length}</p>
            <p className="text-xs text-muted-foreground">Total de clientes</p>
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
              {searchTerm 
                ? 'Nenhum cliente encontrado para sua busca' 
                : 'Nenhum cliente cadastrado'}
            </p>
            <NewClientDialog onClientCreated={refetch}>
              <Button className="mt-4" variant="secondary">
                <Plus className="h-4 w-4 mr-2" />
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

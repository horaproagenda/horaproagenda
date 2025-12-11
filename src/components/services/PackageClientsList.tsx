import React, { useState, useEffect } from 'react';
import { User, Calendar, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface PackageClient {
  id: string;
  client_id: string;
  client_name: string;
  sessions_scheduled: number;
  total_sessions: number;
  created_at: string;
  is_active: boolean;
}

interface PackageClientsListProps {
  packageName: string;
}

export function PackageClientsList({ packageName }: PackageClientsListProps) {
  const [clients, setClients] = useState<PackageClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchClients();
  }, [packageName]);

  const fetchClients = async () => {
    setIsLoading(true);
    try {
      // Get packages with this name that have client_id
      const { data: packages, error } = await supabase
        .from('service_packages')
        .select('id, client_id, sessions_scheduled, total_sessions, created_at, is_active')
        .eq('name', packageName)
        .not('client_id', 'is', null);

      if (error) throw error;

      if (packages && packages.length > 0) {
        const clientIds = packages.map(p => p.client_id).filter(Boolean);
        
        const { data: clientsData, error: clientsError } = await supabase
          .from('clients')
          .select('id, name')
          .in('id', clientIds);

        if (clientsError) throw clientsError;

        const clientMap = new Map(clientsData?.map(c => [c.id, c.name]) || []);

        const formattedClients: PackageClient[] = packages.map(pkg => ({
          id: pkg.id,
          client_id: pkg.client_id!,
          client_name: clientMap.get(pkg.client_id!) || 'Cliente não encontrado',
          sessions_scheduled: pkg.sessions_scheduled,
          total_sessions: pkg.total_sessions,
          created_at: pkg.created_at,
          is_active: pkg.is_active,
        }));

        setClients(formattedClients);
      } else {
        setClients([]);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        Nenhum cliente utilizando este pacote
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[200px]">
      <div className="space-y-2">
        {clients.map(client => (
          <div 
            key={client.id} 
            className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{client.client_name}</p>
                <p className="text-xs text-muted-foreground">
                  Desde {new Date(client.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right mr-2">
                <p className="text-xs text-muted-foreground">Sessões</p>
                <p className="text-sm font-medium">
                  {client.sessions_scheduled}/{client.total_sessions}
                </p>
              </div>
              <Badge variant={client.is_active ? 'default' : 'secondary'} className="text-xs">
                {client.is_active ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

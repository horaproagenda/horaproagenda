import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Client } from '@/types';
import { toast } from 'sonner';
import { collectClientFilePaths, removeClientFiles, invalidateAfterPurge } from '@/lib/deletionCleanup';

export function useClients() {
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading, error } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Client[];
    },
  });

  const deleteClient = useMutation({
    mutationFn: async (clientId: string) => {
      const files = await collectClientFilePaths(clientId);
      const { error } = await supabase.rpc('delete_client_registration_only' as any, { _client_id: clientId });
      if (error) throw error;
      await removeClientFiles(files);
    },
    onSuccess: () => {
      invalidateAfterPurge(queryClient);
      toast.success('Cliente excluído com sucesso!');
    },
    onError: (error: any) => {
      const msg = String(error?.message || '');
      if (/APPLICATION_LOCKED/.test(msg)) {
        toast.error('Este cliente tem fichas finalizadas. Use "Excluir cliente e TODOS os registros".');
        return;
      }
      toast.error(error.message || 'Erro ao excluir cliente');
    },
  });

  const forceDeleteClient = useMutation({
    mutationFn: async (clientId: string) => {
      const files = await collectClientFilePaths(clientId);
      const { error } = await supabase.rpc('force_delete_client' as any, { _client_id: clientId });
      if (error) throw error;
      await removeClientFiles(files);
    },
    onSuccess: () => {
      invalidateAfterPurge(queryClient);
      toast.success('Cliente e todos os registros excluídos com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao excluir cliente e registros');
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  return { clients, isLoading, error, refetch, deleteClient, forceDeleteClient };
}

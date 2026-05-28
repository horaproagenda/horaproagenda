import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Client } from '@/types';
import { toast } from 'sonner';

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
      // Check for appointments
      const { data: appointments } = await supabase
        .from('appointments')
        .select('id')
        .eq('client_id', clientId)
        .limit(1);
      
      if (appointments && appointments.length > 0) {
        throw new Error('Cliente possui agendamentos vinculados. Remova os agendamentos primeiro.');
      }

      // Check for documents
      const { data: documents } = await supabase
        .from('client_documents')
        .select('id')
        .eq('client_id', clientId)
        .limit(1);
      
      if (documents && documents.length > 0) {
        // Delete documents first
        await supabase.from('client_documents').delete().eq('client_id', clientId);
      }

      // Check for photos
      const { data: photos } = await supabase
        .from('treatment_photos')
        .select('id')
        .eq('client_id', clientId)
        .limit(1);
      
      if (photos && photos.length > 0) {
        await supabase.from('treatment_photos').delete().eq('client_id', clientId);
      }

      // Check for quotes
      const { data: quotes } = await supabase
        .from('quotes')
        .select('id')
        .eq('client_id', clientId)
        .limit(1);
      
      if (quotes && quotes.length > 0) {
        await supabase.from('quotes').delete().eq('client_id', clientId);
      }

      // Delete the client
      const { error } = await supabase.from('clients').delete().eq('id', clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Cliente excluído com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao excluir cliente');
    },
  });

  const forceDeleteClient = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.rpc('force_delete_client' as any, { _client_id: clientId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
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

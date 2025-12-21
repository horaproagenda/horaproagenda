import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ClientService {
  id: string;
  client_id: string;
  service_id: string;
  sale_id: string | null;
  amount_paid: number;
  status: 'available' | 'used' | 'expired';
  appointment_id: string | null;
  used_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  service?: {
    id: string;
    name: string;
    price: number;
    duration: number;
    category: string;
  };
}

export function useClientServices(clientId: string | null) {
  const queryClient = useQueryClient();

  const { data: clientServices = [], isLoading } = useQuery({
    queryKey: ['client_services', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase
        .from('client_services')
        .select(`
          *,
          service:services(id, name, price, duration, category)
        `)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ClientService[];
    },
    enabled: !!clientId,
  });

  const availableServices = clientServices.filter(s => s.status === 'available');
  const usedServices = clientServices.filter(s => s.status === 'used');

  const createClientService = useMutation({
    mutationFn: async (data: {
      clientId: string;
      serviceId: string;
      saleId?: string;
      amountPaid: number;
      expiresAt?: string;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: newService, error } = await supabase
        .from('client_services')
        .insert({
          client_id: data.clientId,
          service_id: data.serviceId,
          sale_id: data.saleId,
          amount_paid: data.amountPaid,
          expires_at: data.expiresAt,
          notes: data.notes,
          status: 'available',
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return newService;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_services'] });
    },
    onError: (error) => {
      toast.error('Erro ao criar serviço do cliente: ' + error.message);
    },
  });

  const markServiceAsUsed = useMutation({
    mutationFn: async ({ serviceId, appointmentId }: { serviceId: string; appointmentId: string }) => {
      // Get the client service details first
      const { data: clientService, error: fetchError } = await supabase
        .from('client_services')
        .select('*, service:services(id, name, price)')
        .eq('id', serviceId)
        .single();

      if (fetchError) throw fetchError;

      // Update the client service to mark as used
      const { data, error } = await supabase
        .from('client_services')
        .update({
          status: 'used',
          appointment_id: appointmentId,
          used_at: new Date().toISOString(),
        })
        .eq('id', serviceId)
        .select()
        .single();

      if (error) throw error;

      // Update the appointment to reflect the paid status and amount
      const amountPaid = clientService.amount_paid || clientService.service?.price || 0;
      const { error: aptError } = await supabase
        .from('appointments')
        .update({
          amount_paid: amountPaid,
          payment_status: 'paid',
        })
        .eq('id', appointmentId);

      if (aptError) {
        console.error('Error updating appointment payment status:', aptError);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_services'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  return {
    clientServices,
    availableServices,
    usedServices,
    isLoading,
    createClientService,
    markServiceAsUsed,
  };
}

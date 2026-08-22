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

      // Recupera a forma de pagamento e a data do pagamento da venda de
      // origem, para que o agendamento fique rastreável (e não apenas
      // "pago" sem evidência).
      let paymentMethods: string[] = [];
      let paymentDate: string | null = null;
      if (clientService.sale_id) {
        const { data: sale } = await supabase
          .from('single_sales')
          .select('paid_at, sale_date, payment_method:payment_methods(name)')
          .eq('id', clientService.sale_id)
          .maybeSingle();
        const methodName = (sale as any)?.payment_method?.name as string | undefined;
        if (methodName) paymentMethods = [methodName];
        paymentDate = ((sale as any)?.paid_at || (sale as any)?.sale_date || null) as string | null;
      }

      // Update the appointment to reflect the paid status and amount
      const amountPaid = clientService.amount_paid || clientService.service?.price || 0;
      const updatePayload: Record<string, unknown> = {
        amount_paid: amountPaid,
        payment_status: 'paid',
      };
      if (paymentMethods.length > 0) updatePayload.payment_methods = paymentMethods;
      if (paymentDate) updatePayload.payment_date = paymentDate;

      const { error: aptError } = await supabase
        .from('appointments')
        .update(updatePayload)
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
    onError: (error: any) => {
      toast.error('Não foi possível marcar o serviço como utilizado: ' + (error?.message ?? ''));
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

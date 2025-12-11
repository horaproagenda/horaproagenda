import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Appointment, PaymentStatus } from '@/types';

export interface AppointmentInsert {
  client_id: string;
  service_id: string;
  start_time: string;
  end_time: string;
  notes?: string;
}

export interface PaymentUpdate {
  payment_methods: string[];
  amount_paid: number;
  payment_status: PaymentStatus;
  client_credit?: number;
  client_id?: string;
}

export interface AppointmentUpdate {
  start_time?: string;
  end_time?: string;
  professional_id?: string | null;
  room_id?: string | null;
  notes?: string;
  status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
}

export function useAppointments() {
  const queryClient = useQueryClient();

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          client:clients(*),
          service:services(
            *,
            room:rooms(*),
            professional:professionals(*)
          ),
          room:rooms(*)
        `)
        .order('start_time', { ascending: true });

      if (error) throw error;
      return data as Appointment[];
    },
  });

  const createAppointment = useMutation({
    mutationFn: async (appointment: AppointmentInsert) => {
      const { data, error } = await supabase
        .from('appointments')
        .insert(appointment)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast.success('Agendamento criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar agendamento: ' + error.message);
    },
  });

  const updatePayment = useMutation({
    mutationFn: async ({ id, payment }: { id: string; payment: PaymentUpdate }) => {
      // Update the appointment payment
      const { data, error } = await supabase
        .from('appointments')
        .update({
          payment_methods: payment.payment_methods,
          amount_paid: payment.amount_paid,
          payment_status: payment.payment_status,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // If there's client credit to add, update the client's credit balance
      if (payment.client_credit && payment.client_credit > 0 && payment.client_id) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('credit_balance')
          .eq('id', payment.client_id)
          .single();

        const currentBalance = clientData?.credit_balance || 0;
        const newBalance = Number(currentBalance) + payment.client_credit;

        const { error: clientError } = await supabase
          .from('clients')
          .update({ credit_balance: newBalance })
          .eq('id', payment.client_id);

        if (clientError) throw clientError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Pagamento registrado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao registrar pagamento: ' + error.message);
    },
  });

  const updateAppointment = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: AppointmentUpdate }) => {
      const { data, error } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast.success('Agendamento atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar agendamento: ' + error.message);
    },
  });

  return {
    appointments,
    isLoading,
    createAppointment,
    updatePayment,
    updateAppointment,
  };
}

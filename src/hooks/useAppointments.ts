import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Appointment, PaymentStatus, AppointmentStatus } from '@/types';

const SUPABASE_URL = "https://nsgcllrbswodjoadybsj.supabase.co";

export interface AppointmentInsert {
  client_id: string;
  service_id?: string | null;
  start_time: string;
  end_time: string;
  notes?: string;
  professional_id?: string | null;
  room_id?: string | null;
  payment_status?: PaymentStatus;
}

export interface PaymentUpdate {
  payment_methods: string[];
  amount_paid: number;
  payment_status: PaymentStatus;
  client_credit?: number;
  client_id?: string;
  cash_register_id?: string;
  card_fee_amount?: number;
  installments?: number;
}

export interface AppointmentUpdate {
  start_time?: string;
  end_time?: string;
  professional_id?: string | null;
  room_id?: string | null;
  notes?: string;
  status?: AppointmentStatus;
}

interface EdgeFunctionError {
  field: string;
  message: string;
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
          room:rooms(*),
          package_appointment:package_appointments!appointments_package_appointment_id_fkey(
            *,
            package:service_packages(*)
          )
        `)
        .order('start_time', { ascending: true });

      if (error) throw error;
      
      // Fetch profile info for created_by and updated_by separately
      const appointmentsWithProfiles = await Promise.all(
        (data || []).map(async (apt) => {
          let created_by_profile = null;
          let updated_by_profile = null;
          
          if (apt.created_by) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', apt.created_by)
              .single();
            created_by_profile = profile;
          }
          
          if (apt.updated_by) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', apt.updated_by)
              .single();
            updated_by_profile = profile;
          }
          
          return {
            ...apt,
            created_by_profile,
            updated_by_profile,
          };
        })
      );
      
      return appointmentsWithProfiles as Appointment[];
    },
  });

  const createAppointment = useMutation({
    mutationFn: async (appointment: AppointmentInsert) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Não autenticado');
      }

      // Use Edge Function for server-side validation
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-appointment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          client_id: appointment.client_id,
          service_id: appointment.service_id,
          professional_id: appointment.professional_id,
          room_id: appointment.room_id,
          start_time: appointment.start_time,
          end_time: appointment.end_time,
          notes: appointment.notes,
          status: 'scheduled',
        }),
      });

      const result = await response.json();

      if (!result.success) {
        if (result.errors && Array.isArray(result.errors)) {
          const errorMessages = result.errors.map((e: EdgeFunctionError) => e.message).join(', ');
          throw new Error(errorMessages);
        }
        throw new Error(result.error || 'Erro ao criar agendamento');
      }

      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });
      toast.success('Agendamento criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar agendamento: ' + error.message);
    },
  });

  const updatePayment = useMutation({
    mutationFn: async ({ id, payment }: { id: string; payment: PaymentUpdate }) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Não autenticado');
      }

      // Use Edge Function for server-side validation
      const response = await fetch(`${SUPABASE_URL}/functions/v1/process-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          appointment_id: id,
          payment_methods: payment.payment_methods,
          amount_paid: payment.amount_paid,
          payment_status: payment.payment_status,
          client_credit: payment.client_credit,
          cash_register_id: payment.cash_register_id,
          card_fee_amount: payment.card_fee_amount,
          installments: payment.installments,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        if (result.errors && Array.isArray(result.errors)) {
          const errorMessages = result.errors.map((e: EdgeFunctionError) => e.message).join(', ');
          throw new Error(errorMessages);
        }
        throw new Error(result.error || 'Erro ao processar pagamento');
      }

      return result.data;
    },
    onSuccess: (data) => {
      console.log('Payment mutation success, invalidating queries');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });
      toast.success('Pagamento registrado com sucesso!');
    },
    onError: (error) => {
      console.error('Payment mutation error:', error);
      toast.error('Erro ao registrar pagamento: ' + error.message);
    },
  });

  const updateAppointment = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: AppointmentUpdate }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('appointments')
        .update({
          ...updates,
          updated_by: user?.id,
        })
        .eq('id', id)
        .select('*, package_appointment_id')
        .single();

      if (error) throw error;

      // If status changed to completed and this appointment is linked to a package session,
      // update the package_appointment status as well
      if (updates.status === 'completed' && data.package_appointment_id) {
        const { error: pkgError } = await supabase
          .from('package_appointments')
          .update({ status: 'completed' })
          .eq('id', data.package_appointment_id);
        
        if (pkgError) {
          console.error('Error updating package appointment status:', pkgError);
        }
      }

      // If status changed to cancelled/missed and this is a package appointment,
      // reset the package session so it can be rescheduled
      if ((updates.status === 'cancelled' || updates.status === 'missed') && data.package_appointment_id) {
        // Get current package info
        const { data: pkgAppointment } = await supabase
          .from('package_appointments')
          .select('package_id')
          .eq('id', data.package_appointment_id)
          .single();

        // Reset the session to pending so it can be rescheduled
        const { error: pkgError } = await supabase
          .from('package_appointments')
          .update({ 
            status: 'pending',
            appointment_id: null,
            scheduled_date: null
          })
          .eq('id', data.package_appointment_id);
        
        if (pkgError) {
          console.error('Error resetting package appointment:', pkgError);
        }

        // Decrement the sessions_scheduled counter on the package
        if (pkgAppointment?.package_id) {
          const { data: pkg } = await supabase
            .from('service_packages')
            .select('sessions_scheduled')
            .eq('id', pkgAppointment.package_id)
            .single();

          if (pkg && pkg.sessions_scheduled > 0) {
            await supabase
              .from('service_packages')
              .update({ sessions_scheduled: pkg.sessions_scheduled - 1 })
              .eq('id', pkgAppointment.package_id);
          }
        }

        // Remove the link from the cancelled appointment
        await supabase
          .from('appointments')
          .update({ package_appointment_id: null })
          .eq('id', id);
        
        // Return with flag indicating session was released
        return { ...data, sessionReleased: true, status: updates.status };
      }

      return { ...data, sessionReleased: false };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['package_details'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      
      if (data.sessionReleased) {
        const statusLabel = data.status === 'cancelled' ? 'cancelado' : 'marcado como falta';
        toast.success(`Agendamento ${statusLabel}! A sessão do pacote foi liberada para reagendamento.`);
      } else {
        toast.success('Agendamento atualizado!');
      }
    },
    onError: (error) => {
      toast.error('Erro ao atualizar agendamento: ' + error.message);
    },
  });

  const deleteAppointment = useMutation({
    mutationFn: async (id: string) => {
      // First, check if this appointment is linked to a package session and has payments
      const { data: appointment } = await supabase
        .from('appointments')
        .select('package_appointment_id, amount_paid, payment_status, client:clients(name), service:services(name)')
        .eq('id', id)
        .single();

      const hadPayment = (appointment?.amount_paid || 0) > 0;

      // Delete related financial entries for this appointment
      const { error: finEntryDeleteError } = await supabase
        .from('financial_entries')
        .delete()
        .eq('appointment_id', id);

      if (finEntryDeleteError) {
        console.error('Error deleting financial entries:', finEntryDeleteError);
      }

      // Delete related cash transactions for this appointment
      const { error: cashDeleteError } = await supabase
        .from('cash_transactions')
        .delete()
        .eq('reference_id', id)
        .eq('reference_type', 'appointment');

      if (cashDeleteError) {
        console.error('Error deleting cash transactions:', cashDeleteError);
      }

      // If linked to a package, release the session first
      if (appointment?.package_appointment_id) {
        // Get the package_id from the package_appointment
        const { data: pkgAppointment } = await supabase
          .from('package_appointments')
          .select('package_id')
          .eq('id', appointment.package_appointment_id)
          .single();

        // Reset the session to pending
        await supabase
          .from('package_appointments')
          .update({ 
            status: 'pending',
            appointment_id: null,
            scheduled_date: null
          })
          .eq('id', appointment.package_appointment_id);

        // Decrement sessions_scheduled on the package
        if (pkgAppointment?.package_id) {
          const { data: pkg } = await supabase
            .from('service_packages')
            .select('sessions_scheduled')
            .eq('id', pkgAppointment.package_id)
            .single();

          if (pkg && pkg.sessions_scheduled > 0) {
            await supabase
              .from('service_packages')
              .update({ sessions_scheduled: pkg.sessions_scheduled - 1 })
              .eq('id', pkgAppointment.package_id);
          }
        }
      }

      // Now delete the appointment
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return { 
        hadPackageSession: !!appointment?.package_appointment_id,
        hadPayment,
        amountDeleted: appointment?.amount_paid || 0
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['package_details'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      
      if (result.hadPayment) {
        toast.success(`Agendamento excluído! O valor de R$ ${result.amountDeleted.toFixed(2)} foi removido do caixa e financeiro.`);
      } else if (result.hadPackageSession) {
        toast.success('Agendamento excluído! A sessão do pacote foi liberada para reagendamento.');
      } else {
        toast.success('Agendamento excluído com sucesso!');
      }
    },
    onError: (error) => {
      toast.error('Erro ao excluir agendamento: ' + error.message);
    },
  });

  const deletePackageAppointments = useMutation({
    mutationFn: async (packageId: string) => {
      // Get all appointments linked to this package
      const { data: packageAppointments, error: fetchError } = await supabase
        .from('package_appointments')
        .select('appointment_id')
        .eq('package_id', packageId)
        .not('appointment_id', 'is', null);

      if (fetchError) throw fetchError;

      const appointmentIds = packageAppointments
        ?.map(pa => pa.appointment_id)
        .filter((id): id is string => id !== null) || [];

      if (appointmentIds.length > 0) {
        // Delete all appointments
        const { error: deleteError } = await supabase
          .from('appointments')
          .delete()
          .in('id', appointmentIds);

        if (deleteError) throw deleteError;
      }

      // Reset package sessions to pending
      const { error: resetError } = await supabase
        .from('package_appointments')
        .update({ 
          appointment_id: null, 
          status: 'pending',
          scheduled_date: null 
        })
        .eq('package_id', packageId);

      if (resetError) throw resetError;

      // Reset sessions_scheduled counter
      const { error: packageError } = await supabase
        .from('service_packages')
        .update({ sessions_scheduled: 0 })
        .eq('id', packageId);

      if (packageError) throw packageError;

      return appointmentIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });
      toast.success(`${count} agendamento(s) do pacote excluído(s) com sucesso!`);
    },
    onError: (error) => {
      toast.error('Erro ao excluir agendamentos do pacote: ' + error.message);
    },
  });

  return {
    appointments,
    isLoading,
    createAppointment,
    updatePayment,
    updateAppointment,
    deleteAppointment,
    deletePackageAppointments,
  };
}

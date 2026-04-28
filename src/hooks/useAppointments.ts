import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Appointment, PaymentStatus, AppointmentStatus } from '@/types';
import { findNextAvailablePackageSlot } from '@/lib/packageScheduling';

// Use environment variable for URL - ensures consistency between preview and production
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

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
  client_credit?: number; // Saldo: troco em dinheiro que fica como crédito (registrado no caixa/financeiro)
  courtesy_credit?: number; // Cortesia: brinde/presente sem entrada de dinheiro
  used_client_credit?: number;
  client_id?: string;
  cash_register_id?: string;
  card_fee_amount?: number;
  installments?: number;
  discount_amount?: number; // Desconto aplicado
  payment_method_name?: string; // Nome da forma de pagamento principal
}

export interface AppointmentUpdate {
  start_time?: string;
  end_time?: string;
  service_id?: string | null;
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
          client:clients(id, name, phone, email),
          service:services(
            id, name, price, duration, category,
            room:rooms(id, name),
            professional:professionals(id, name)
          ),
          room:rooms(id, name),
          package_appointment:package_appointments!appointments_package_appointment_id_fkey(
            id, session_number, original_session_number, status,
            package:service_packages(id, name, total_sessions)
          )
        `)
        .order('start_time', { ascending: true });

      if (error) throw error;
      
      // Return directly without additional profile fetches for performance
      return (data || []) as Appointment[];
    },
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: true, // Refetch when user returns to window
    refetchInterval: 60000, // Poll every 60 seconds as fallback
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
    onMutate: async (newAppointment) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['appointments'] });

      // Snapshot the previous value
      const previousAppointments = queryClient.getQueryData(['appointments']);

      // Optimistically update with a temporary appointment
      const optimisticAppointment = {
        id: `temp-${Date.now()}`,
        ...newAppointment,
        status: 'scheduled' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client: null,
        service: null,
        room: null,
        package_appointment: null,
      };

      queryClient.setQueryData(['appointments'], (old: Appointment[] | undefined) => {
        return [...(old || []), optimisticAppointment];
      });

      return { previousAppointments };
    },
    onSuccess: () => {
      // Refetch to get the real data with relationships
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });
      toast.success('Agendamento criado com sucesso!');
    },
    onError: (error, _, context) => {
      // Rollback on error
      if (context?.previousAppointments) {
        queryClient.setQueryData(['appointments'], context.previousAppointments);
      }
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
          courtesy_credit: payment.courtesy_credit,
          used_client_credit: payment.used_client_credit,
          cash_register_id: payment.cash_register_id,
          card_fee_amount: payment.card_fee_amount,
          installments: payment.installments,
          discount_amount: payment.discount_amount,
          payment_method_name: payment.payment_method_name,
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

      return { ...result.data, appointmentId: id, payment };
    },
    onMutate: async ({ id, payment }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['appointments'] });

      // Snapshot the previous value
      const previousAppointments = queryClient.getQueryData(['appointments']);

      // Optimistically update the appointment with payment info
      queryClient.setQueryData(['appointments'], (old: Appointment[] | undefined) => {
        if (!old) return old;
        return old.map(apt => {
          if (apt.id === id) {
            return {
              ...apt,
              amount_paid: payment.amount_paid,
              payment_status: payment.payment_status,
              payment_methods: payment.payment_methods,
            };
          }
          return apt;
        });
      });

      return { previousAppointments };
    },
    onSuccess: () => {
      // Refetch all related queries to ensure consistency
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
    onError: (error, _, context) => {
      // Rollback on error
      if (context?.previousAppointments) {
        queryClient.setQueryData(['appointments'], context.previousAppointments);
      }
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

      if ((updates.start_time || updates.end_time || updates.status === 'scheduled' || updates.status === 'confirmed') && data.package_appointment_id && updates.status !== 'completed') {
        const { error: pkgScheduleError } = await supabase
          .from('package_appointments')
          .update({
            status: updates.status === 'confirmed' ? 'scheduled' : 'scheduled',
            scheduled_date: updates.start_time || data.start_time,
          })
          .eq('id', data.package_appointment_id);

        if (pkgScheduleError) {
          console.error('Error preserving package session schedule:', pkgScheduleError);
        }

        if (updates.start_time) {
          const { data: currentSession } = await (supabase as any)
            .from('package_appointments')
            .select('*, package:service_packages(id, package_type, duration)')
            .eq('id', data.package_appointment_id)
            .single();

          if (currentSession?.package?.package_type === 'sequential') {
            const { data: packageSessions } = await (supabase as any)
              .from('package_appointments')
              .select('*, service:services(duration)')
              .eq('package_id', currentSession.package_id)
              .order('sequence_order', { ascending: true });

            const { data: packageInfo } = await (supabase as any)
              .from('service_packages')
              .select('professional_id, room_id')
              .eq('id', currentSession.package_id)
              .single();

            const { data: existingAppointments } = await supabase
              .from('appointments')
              .select('id, start_time, end_time, professional_id, room_id, status')
              .not('status', 'eq', 'cancelled')
              .gte('start_time', new Date(new Date(updates.start_time).getTime() - 24 * 60 * 60 * 1000).toISOString());

            const orderedSessions = (packageSessions || []).sort((a: any, b: any) => (a.sequence_order || a.session_number) - (b.sequence_order || b.session_number));
            const currentIndex = orderedSessions.findIndex((session: any) => session.id === data.package_appointment_id);
            let nextStart = new Date(updates.start_time);
            const ignoredAppointmentIds = orderedSessions.slice(currentIndex).map((session: any) => session.appointment_id);

            for (let index = currentIndex; index >= 0 && index < orderedSessions.length; index += 1) {
              const session = orderedSessions[index];
              if (index > currentIndex) {
                const previousSession = orderedSessions[index - 1];
                nextStart = new Date(nextStart.getTime() + Number(previousSession.interval_after_days || 0) * 24 * 60 * 60 * 1000);
              }

              const duration = Number((Array.isArray(session.service) ? session.service[0]?.duration : session.service?.duration) || currentSession.package.duration || 60);
              nextStart = findNextAvailablePackageSlot(nextStart, duration, existingAppointments || [], {
                professional_id: packageInfo?.professional_id || data.professional_id,
                room_id: packageInfo?.room_id || data.room_id,
                ignoreAppointmentIds: ignoredAppointmentIds,
              });

              await supabase
                .from('package_appointments')
                .update({ scheduled_date: nextStart.toISOString(), status: session.status === 'completed' ? 'completed' : 'scheduled' })
                .eq('id', session.id);

              if (session.appointment_id && session.status !== 'completed' && session.status !== 'missed') {
                await supabase
                  .from('appointments')
                  .update({
                    start_time: nextStart.toISOString(),
                    end_time: new Date(nextStart.getTime() + duration * 60 * 1000).toISOString(),
                    status: index === currentIndex ? (updates.status || data.status) : 'scheduled',
                  })
                  .eq('id', session.appointment_id);
              }
            }
          }
        }
      }

      // If status changed to cancelled/missed/rescheduled, clean up financial entries
      // and reset package session if applicable
      if (updates.status === 'cancelled' || updates.status === 'missed' || updates.status === 'rescheduled') {
        // Delete related financial entries for this appointment (same as delete does)
        const { error: finEntryDeleteError } = await supabase
          .from('financial_entries')
          .delete()
          .eq('appointment_id', id);

        if (finEntryDeleteError) {
          console.error('Error deleting financial entries on status change:', finEntryDeleteError);
        }

        // Delete related cash transactions for this appointment
        const { error: cashDeleteError } = await supabase
          .from('cash_transactions')
          .delete()
          .eq('reference_id', id)
          .eq('reference_type', 'appointment');

        if (cashDeleteError) {
          console.error('Error deleting cash transactions on status change:', cashDeleteError);
        }
      }
      
      // Package history must remain intact: status changes are mirrored to the session,
      // but the session number, appointment link and scheduled date are preserved.
      if ((updates.status === 'cancelled' || updates.status === 'missed' || updates.status === 'rescheduled') && data.package_appointment_id) {
        const { error: pkgError } = await supabase
          .from('package_appointments')
          .update({ status: updates.status as any })
          .eq('id', data.package_appointment_id);
        
        if (pkgError) {
          console.error('Error updating package appointment status:', pkgError);
        }
        
        return { ...data, sessionReleased: false, status: updates.status };
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
      // Invalidate financial queries when status changes (cancelled/missed/rescheduled)
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      
      toast.success('Agendamento atualizado!');
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
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });
      
      let message = 'Agendamento excluído!';
      if (result.hadPackageSession) {
        message = 'Agendamento excluído! A sessão do pacote foi liberada.';
      }
      if (result.hadPayment) {
        message += ` R$ ${result.amountDeleted.toFixed(2)} removido dos registros.`;
      }
      toast.success(message);
    },
    onError: (error) => {
      toast.error('Erro ao excluir agendamento: ' + error.message);
    },
  });

  // Function to delete all appointments for a specific package
  const deletePackageAppointments = useMutation({
    mutationFn: async (packageId: string) => {
      // First, get all package_appointments for this package
      const { data: pkgAppointments, error: fetchError } = await supabase
        .from('package_appointments')
        .select('appointment_id')
        .eq('package_id', packageId)
        .not('appointment_id', 'is', null);

      if (fetchError) throw fetchError;

      const appointmentIds = pkgAppointments?.map(p => p.appointment_id).filter(Boolean) || [];

      if (appointmentIds.length > 0) {
        // Delete related financial entries
        await supabase
          .from('financial_entries')
          .delete()
          .in('appointment_id', appointmentIds);

        // Delete related cash transactions
        await supabase
          .from('cash_transactions')
          .delete()
          .in('reference_id', appointmentIds)
          .eq('reference_type', 'appointment');

        // Delete the appointments
        const { error: deleteError } = await supabase
          .from('appointments')
          .delete()
          .in('id', appointmentIds);

        if (deleteError) throw deleteError;
      }

      // Reset all package_appointments for this package
      const { error: resetError } = await supabase
        .from('package_appointments')
        .update({ 
          appointment_id: null, 
          scheduled_date: null, 
          status: 'pending' 
        })
        .eq('package_id', packageId);

      if (resetError) throw resetError;

      // Reset sessions_scheduled counter on the package
      const { error: pkgUpdateError } = await supabase
        .from('service_packages')
        .update({ sessions_scheduled: 0 })
        .eq('id', packageId);

      if (pkgUpdateError) throw pkgUpdateError;

      return appointmentIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['package_details'] });
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

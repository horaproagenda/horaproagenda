import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Appointment, PaymentStatus, AppointmentStatus } from '@/types';
import { logAccess } from '@/hooks/useLogAccess';
import { broadcastDataChange } from '@/hooks/useCrossDeviceSync';

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
  payment_delta?: number;
  payment_status: PaymentStatus;
  additional_items?: Array<{
    item_type: 'service' | 'product';
    service_id?: string | null;
    product_id?: string | null;
    quantity: number;
    unit_price: number;
    total_amount: number;
  }>;
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

class AppointmentConflictError extends Error {
  constructor() {
    super('Este agendamento foi alterado por outro usuário. A agenda será atualizada com a versão mais recente.');
    this.name = 'AppointmentConflictError';
  }
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
          client:clients(id, name, phone, email, credit_balance),
          service:services(
            id, name, price, duration, category,
            room:rooms(id, name),
            professional:professionals(id, name)
          ),
          room:rooms(id, name),
          package_appointment:package_appointments!appointments_package_appointment_id_fkey(
            id, package_id, session_number, original_session_number, status,
            package:service_packages(id, name, client_id, total_sessions, sessions_scheduled, total_price, payment_methods, is_active, duration)
          ),
          additional_items:appointment_additional_items(
            id, item_type, service_id, product_id, quantity, unit_price, total_amount, notes,
            service:services(id, name),
            product:products(id, name)
          )
        `)
        .order('start_time', { ascending: true });

      if (error) throw error;
      
      // Return directly without additional profile fetches for performance
      return (data || []) as unknown as Appointment[];
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
    onSuccess: (data) => {
      // Refetch to get the real data with relationships
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });
      void logAccess({
        module: 'agenda',
        action: 'create',
        targetType: 'appointment',
        targetId: data?.id ?? null,
        fieldsChanged: ['client_id', 'service_id', 'professional_id', 'room_id', 'start_time', 'end_time', 'status', 'notes'],
      });
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
          payment_delta: payment.payment_delta,
          payment_status: payment.payment_status,
          additional_items: payment.additional_items,
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

      // Optimistically update the appointment and all siblings in the same package
      queryClient.setQueryData(['appointments'], (old: Appointment[] | undefined) => {
        if (!old) return old;
        
        // Find the target appointment to get its package info
        const targetApt = old.find(apt => apt.id === id);
        const packageId = targetApt?.package_appointment?.package_id;
        
        const packageAppointments = packageId
          ? old.filter(apt => apt.package_appointment?.package_id === packageId)
          : [];
        const existingPackagePaid = packageAppointments.length > 0
          ? Math.max(...packageAppointments.map(apt => Number(apt.amount_paid || 0)), 0)
          : Number(targetApt?.amount_paid || 0);
        const paymentDelta = typeof payment.payment_delta === 'number'
          ? payment.payment_delta
          : Math.max(0, Number(payment.amount_paid || 0) - Number(targetApt?.amount_paid || 0));
        const packageTotal = Number(targetApt?.package_appointment?.package?.total_price || 0);
        const syncedAmountPaid = packageId
          ? Math.max(existingPackagePaid, packageTotal > 0 ? Math.min(packageTotal, existingPackagePaid + paymentDelta) : existingPackagePaid + paymentDelta)
          : payment.amount_paid;
        const syncedStatus: PaymentStatus = packageId
          ? (packageTotal > 0 && syncedAmountPaid >= packageTotal ? 'paid' : syncedAmountPaid > 0 ? 'partial' : 'pending')
          : payment.payment_status;
        const syncedMethods = packageId
          ? [...new Set([...packageAppointments.flatMap(apt => apt.payment_methods || []), ...payment.payment_methods])]
          : payment.payment_methods;

        return old.map(apt => {
          if (apt.id === id) {
            return {
              ...apt,
              amount_paid: syncedAmountPaid,
              payment_status: syncedStatus,
              payment_methods: syncedMethods,
            };
          }
          // Propagate payment to sibling package appointments
          if (packageId && apt.package_appointment?.package_id === packageId) {
            return {
              ...apt,
              amount_paid: syncedAmountPaid,
              payment_status: syncedStatus,
              payment_methods: syncedMethods,
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
    mutationFn: async ({ id, updates, expectedVersion }: { id: string; updates: AppointmentUpdate; expectedVersion?: number }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const runUpdate = async (versionGuard?: number) => {
        let q = supabase
          .from('appointments')
          .update({
            ...updates,
            updated_by: user?.id,
          })
          .eq('id', id);
        if (typeof versionGuard === 'number') {
          q = q.eq('version', versionGuard);
        }
        return q.select('*, package_appointment_id, version').maybeSingle();
      };

      let { data, error } = await runUpdate(expectedVersion);
      if (error) throw error;

      // Version mismatch: fetch latest row to decide whether it's a real conflict
      // (another user edited it) or just a stale local version (same user re-editing
      // their own recent change — common when realtime hasn't refreshed cache yet,
      // or when server-side triggers bump version after our own write).
      if (!data && typeof expectedVersion === 'number') {
        const { data: latest } = await supabase
          .from('appointments')
          .select('id, version, updated_by')
          .eq('id', id)
          .maybeSingle();

        if (!latest) throw new AppointmentConflictError();

        const sameUser = latest.updated_by && user?.id && latest.updated_by === user.id;
        if (sameUser) {
          const retry = await runUpdate(latest.version);
          if (retry.error) throw retry.error;
          if (retry.data) {
            data = retry.data;
          } else {
            // Fallback: force update without version guard for same user
            const force = await runUpdate(undefined);
            if (force.error) throw force.error;
            if (!force.data) throw new AppointmentConflictError();
            data = force.data;
          }
        } else {
          throw new AppointmentConflictError();
        }
      }

      if (!data) throw new AppointmentConflictError();

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
        const packageSessionUpdate: Record<string, any> = {
          status: updates.status === 'confirmed' ? 'scheduled' : 'scheduled',
        };
        if (updates.start_time) {
          packageSessionUpdate.scheduled_date = updates.start_time || data.start_time;
        }

        const { error: pkgScheduleError } = await supabase
          .from('package_appointments')
          .update(packageSessionUpdate)
          .eq('id', data.package_appointment_id);

        if (pkgScheduleError) {
          console.error('Error preserving package session schedule:', pkgScheduleError);
        }

        if (updates.start_time) {
          const { error: cascadeError } = await supabase.rpc('recalculate_package_minimum_intervals', {
            _package_appointment_id: data.package_appointment_id,
          });

          if (cascadeError) {
            console.error('Error recalculating package cascade:', cascadeError);
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
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['client'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['package_details'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      // Notify other tabs/devices to refresh immediately
      broadcastDataChange();

      void logAccess({
        module: 'agenda',
        action: 'edit',
        targetType: 'appointment',
        targetId: variables?.id ?? null,
        fieldsChanged: Object.keys(variables?.updates ?? {}),
      });

      toast.success('Agendamento atualizado!');
    },
    onError: (error) => {
      if (error instanceof AppointmentConflictError) {
        queryClient.invalidateQueries({ queryKey: ['appointments'], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['client-appointments'], refetchType: 'all' });
        toast.warning(error.message);
        return;
      }
      toast.error('Erro ao atualizar agendamento: ' + error.message);
    },
  });

  const deleteAppointment = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('delete_appointment_cascade' as any, { _appointment_id: id });
      if (error) throw error;
      const result = (data ?? {}) as { hadPackageSession?: boolean; hadPayment?: boolean; amountDeleted?: number };
      return {
        hadPackageSession: !!result.hadPackageSession,
        hadPayment: !!result.hadPayment,
        amountDeleted: Number(result.amountDeleted || 0),
      };
    },
    onSuccess: (result, deletedId) => {
      void logAccess({
        module: 'agenda',
        action: 'delete',
        targetType: 'appointment',
        targetId: deletedId ?? null,
        metadata: { hadPayment: result?.hadPayment, hadPackageSession: result?.hadPackageSession },
      });
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
        message = 'Agendamento excluído. Sessão do pacote liberada para reagendamento.';
      } else if (result.hadPayment) {
        message += ` R$ ${result.amountDeleted.toFixed(2)} removido dos registros.`;
      }
      toast.success(message);
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir agendamento: ' + error.message);
    },
  });


  // Function to delete all appointments for a specific package
  const deletePackageAppointments = useMutation({
    mutationFn: async (
      input:
        | string
        | {
            packageId: string;
            refund?: {
              amountPaid: number;
              consumedValue: number;
              feeAmount: number;
              refundAmount: number;
              refundMethod: string;
              note?: string;
            };
          }
    ) => {
      const packageId = typeof input === 'string' ? input : input.packageId;
      const refund = typeof input === 'string' ? undefined : input.refund;

      // Fetch package context (client, name) for refund bookkeeping
      const { data: pkgInfo } = await supabase
        .from('service_packages')
        .select('id, name, client_id, total_price')
        .eq('id', packageId)
        .single();

      // Get all package_appointments for this package
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
          status: 'pending',
        })
        .eq('package_id', packageId);

      if (resetError) throw resetError;

      // Reset sessions_scheduled counter on the package
      const { error: pkgUpdateError } = await supabase
        .from('service_packages')
        .update({ sessions_scheduled: 0 })
        .eq('id', packageId);

      if (pkgUpdateError) throw pkgUpdateError;

      // If a refund was requested, register it as a cash outflow + financial expense
      if (refund && refund.refundAmount > 0) {
        const description =
          refund.note?.trim() ||
          `Devolução pacote${pkgInfo?.name ? ` "${pkgInfo.name}"` : ''}` +
            (refund.feeAmount > 0 ? ` (multa R$ ${refund.feeAmount.toFixed(2)})` : '');
        const today = new Date().toISOString().split('T')[0];

        // Find an open cash register to attach the outflow to (optional)
        const { data: openRegister } = await supabase
          .from('cash_registers')
          .select('id')
          .eq('status', 'open')
          .order('opened_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: { user } } = await supabase.auth.getUser();

        // Record an expense entry in financial_entries
        await supabase.from('financial_entries').insert({
          amount: refund.refundAmount,
          type: 'expense',
          status: 'paid',
          description,
          client_id: pkgInfo?.client_id,
          due_date: today,
          paid_date: today,
          created_by: user?.id,
        } as any);

        // Record cash transaction as outflow (negative amount, type expense)
        await supabase.from('cash_transactions').insert({
          cash_register_id: openRegister?.id ?? null,
          type: 'expense',
          category: 'Devolução de pacote',
          amount: refund.refundAmount,
          payment_method: refund.refundMethod,
          description,
          reference_type: 'package_refund',
          reference_id: packageId,
          created_by: user?.id,
        } as any);
      }

      return { count: appointmentIds.length, refunded: refund?.refundAmount || 0 };
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
      const base = `${result.count} agendamento(s) do pacote excluído(s).`;
      toast.success(
        result.refunded > 0
          ? `${base} Devolução registrada: R$ ${result.refunded.toFixed(2)}.`
          : base,
      );
    },
    onError: (error) => {
      toast.error('Erro ao excluir agendamentos do pacote: ' + error.message);
    },
  });

  const reversePayment = useMutation({
    mutationFn: async (appointmentId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Não autenticado');
      const response = await fetch(`${SUPABASE_URL}/functions/v1/reverse-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ appointment_id: appointmentId }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Erro ao desfazer baixa');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      toast.success('Baixa do pagamento desfeita. Você já pode dar baixa novamente.');
    },
    onError: (error: Error) => {
      toast.error('Erro ao desfazer baixa: ' + error.message);
    },
  });

  return {
    appointments,
    isLoading,
    createAppointment,
    updatePayment,
    reversePayment,
    updateAppointment,
    deleteAppointment,
    deletePackageAppointments,
  };
}

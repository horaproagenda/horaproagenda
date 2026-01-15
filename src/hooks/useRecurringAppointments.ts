import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const SUPABASE_URL = "https://nsgcllrbswodjoadybsj.supabase.co";

interface CreateRecurringAppointmentsParams {
  client_id: string;
  service_id: string;
  start_time: Date;
  end_time: Date;
  professional_id?: string | null;
  room_id?: string | null;
  notes?: string;
  repeat_count: number;
  interval_days: number;
  send_whatsapp?: boolean;
  client_phone?: string;
  client_name?: string;
  service_name?: string;
}

interface RescheduleSeriesParams {
  recurring_group_id: string;
  original_appointment_id: string;
  new_start_time: Date;
  new_end_time: Date;
  reschedule_following: boolean;
  send_whatsapp?: boolean;
  client_phone?: string;
  client_name?: string;
}

interface DeleteSeriesParams {
  recurring_group_id: string;
  appointment_id: string;
  delete_type: 'single' | 'following' | 'all';
  send_whatsapp?: boolean;
  client_phone?: string;
  client_name?: string;
}

export function useRecurringAppointments() {
  const queryClient = useQueryClient();

  const createRecurringAppointments = useMutation({
    mutationFn: async (params: CreateRecurringAppointmentsParams) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Não autenticado');
      }

      // Generate a unique group ID for this recurring series
      const recurringGroupId = crypto.randomUUID();
      
      const appointments: Array<{ start: Date; end: Date }> = [];
      const duration = params.end_time.getTime() - params.start_time.getTime();
      
      // Create all appointment dates
      for (let i = 0; i < params.repeat_count; i++) {
        const startDate = addDays(params.start_time, params.interval_days * i);
        const endDate = new Date(startDate.getTime() + duration);
        appointments.push({ start: startDate, end: endDate });
      }

      const createdAppointments: any[] = [];
      const failedAppointments: number[] = [];

      // Create appointments sequentially to avoid conflicts
      for (let i = 0; i < appointments.length; i++) {
        const apt = appointments[i];
        try {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/create-appointment`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              client_id: params.client_id,
              service_id: params.service_id,
              professional_id: params.professional_id,
              room_id: params.room_id,
              start_time: apt.start.toISOString(),
              end_time: apt.end.toISOString(),
              notes: params.notes ? `${params.notes} - Sessão ${i + 1} de ${params.repeat_count}` : `Sessão ${i + 1} de ${params.repeat_count}`,
              status: 'scheduled',
            }),
          });

          const result = await response.json();

          if (result.success && result.data) {
            // Update the appointment with the recurring group ID
            const { data: updatedApt, error: updateError } = await supabase
              .from('appointments')
              .update({ recurring_group_id: recurringGroupId })
              .eq('id', result.data.id)
              .select()
              .single();

            if (updateError) {
              console.error('Error updating recurring group:', updateError);
            }

            createdAppointments.push(updatedApt || result.data);
          } else {
            failedAppointments.push(i + 1);
          }
        } catch (error) {
          console.error(`Error creating appointment ${i + 1}:`, error);
          failedAppointments.push(i + 1);
        }
      }

      // Send WhatsApp notification if requested
      if (params.send_whatsapp && params.client_phone && createdAppointments.length > 0) {
        try {
          const sessionsList = createdAppointments.map((apt, i) => 
            `📅 Sessão ${i + 1}: ${format(new Date(apt.start_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
          ).join('\n');

          const message = `Olá ${params.client_name || 'Cliente'}! 👋

Seus ${createdAppointments.length} agendamentos de *${params.service_name || 'serviço'}* foram criados com sucesso! 🎉

${sessionsList}

Se precisar reagendar alguma sessão, entre em contato conosco.

Até breve! ✨`;

          await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              phone: params.client_phone,
              message,
            }),
          });
        } catch (error) {
          console.error('Error sending WhatsApp notification:', error);
        }
      }

      return {
        recurringGroupId,
        created: createdAppointments.length,
        failed: failedAppointments,
        appointments: createdAppointments,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      
      if (result.failed.length > 0) {
        toast.warning(`${result.created} agendamentos criados. Sessões ${result.failed.join(', ')} tiveram conflitos.`);
      } else {
        toast.success(`${result.created} agendamentos recorrentes criados com sucesso!`);
      }
    },
    onError: (error) => {
      toast.error('Erro ao criar agendamentos recorrentes: ' + error.message);
    },
  });

  const rescheduleAppointmentSeries = useMutation({
    mutationFn: async (params: RescheduleSeriesParams) => {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!session?.access_token || !user) {
        throw new Error('Não autenticado');
      }

      // Get all appointments in the series
      const { data: seriesAppointments, error: fetchError } = await supabase
        .from('appointments')
        .select('*, client:clients(*), service:services(*)')
        .eq('recurring_group_id', params.recurring_group_id)
        .order('start_time', { ascending: true });

      if (fetchError) throw fetchError;

      // Find the original appointment index
      const originalIndex = seriesAppointments?.findIndex(apt => apt.id === params.original_appointment_id) ?? -1;
      
      if (originalIndex === -1) {
        throw new Error('Agendamento não encontrado na série');
      }

      const originalApt = seriesAppointments![originalIndex];
      const originalStart = new Date(originalApt.start_time);
      const newStart = params.new_start_time;
      
      // Calculate the time difference
      const timeDiff = newStart.getTime() - originalStart.getTime();
      
      const updatedAppointments: any[] = [];
      const appointmentsToUpdate = params.reschedule_following 
        ? seriesAppointments!.slice(originalIndex)
        : [originalApt];

      // Update appointments
      for (let i = 0; i < appointmentsToUpdate.length; i++) {
        const apt = appointmentsToUpdate[i];
        const aptStart = new Date(apt.start_time);
        const aptEnd = new Date(apt.end_time);
        
        const newAptStart = new Date(aptStart.getTime() + timeDiff);
        const newAptEnd = new Date(aptEnd.getTime() + timeDiff);

        const { data: updated, error: updateError } = await supabase
          .from('appointments')
          .update({
            start_time: newAptStart.toISOString(),
            end_time: newAptEnd.toISOString(),
            updated_by: user.id,
          })
          .eq('id', apt.id)
          .select()
          .single();

        if (updateError) {
          console.error(`Error updating appointment ${apt.id}:`, updateError);
        } else {
          updatedAppointments.push(updated);
        }
      }

      // Send WhatsApp notification if requested
      if (params.send_whatsapp && params.client_phone && updatedAppointments.length > 0) {
        try {
          const client = seriesAppointments![0].client;
          const service = seriesAppointments![0].service;
          
          const sessionsList = updatedAppointments.map((apt, i) => 
            `📅 ${format(new Date(apt.start_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
          ).join('\n');

          const message = `Olá ${params.client_name || client?.name || 'Cliente'}! 👋

⚠️ *Alteração nos seus agendamentos*

${updatedAppointments.length > 1 ? 'Os seguintes agendamentos foram reagendados' : 'Seu agendamento foi reagendado'}:

${sessionsList}

Em caso de dúvidas, entre em contato conosco.

Até breve! ✨`;

          await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              phone: params.client_phone,
              message,
            }),
          });
        } catch (error) {
          console.error('Error sending WhatsApp notification:', error);
        }
      }

      return {
        updated: updatedAppointments.length,
        appointments: updatedAppointments,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      toast.success(`${result.updated} agendamento(s) reagendado(s) com sucesso!`);
    },
    onError: (error) => {
      toast.error('Erro ao reagendar agendamentos: ' + error.message);
    },
  });

  const deleteAppointmentSeries = useMutation({
    mutationFn: async (params: DeleteSeriesParams) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Não autenticado');
      }

      // Get all appointments in the series
      const { data: seriesAppointments, error: fetchError } = await supabase
        .from('appointments')
        .select('*, client:clients(*), service:services(*)')
        .eq('recurring_group_id', params.recurring_group_id)
        .order('start_time', { ascending: true });

      if (fetchError) throw fetchError;

      let appointmentsToDelete: any[] = [];
      
      if (params.delete_type === 'single') {
        const apt = seriesAppointments?.find(a => a.id === params.appointment_id);
        if (apt) appointmentsToDelete = [apt];
      } else if (params.delete_type === 'following') {
        const originalIndex = seriesAppointments?.findIndex(apt => apt.id === params.appointment_id) ?? -1;
        if (originalIndex !== -1) {
          appointmentsToDelete = seriesAppointments!.slice(originalIndex);
        }
      } else if (params.delete_type === 'all') {
        appointmentsToDelete = seriesAppointments || [];
      }

      const deletedIds: string[] = [];

      // Delete each appointment
      for (const apt of appointmentsToDelete) {
        // Delete related financial entries
        await supabase
          .from('financial_entries')
          .delete()
          .eq('appointment_id', apt.id);

        // Delete related cash transactions
        await supabase
          .from('cash_transactions')
          .delete()
          .eq('reference_id', apt.id)
          .eq('reference_type', 'appointment');

        // Delete the appointment
        const { error: deleteError } = await supabase
          .from('appointments')
          .delete()
          .eq('id', apt.id);

        if (!deleteError) {
          deletedIds.push(apt.id);
        }
      }

      // Send WhatsApp notification if requested
      if (params.send_whatsapp && params.client_phone && deletedIds.length > 0) {
        try {
          const client = seriesAppointments?.[0]?.client;
          const service = seriesAppointments?.[0]?.service;
          
          const message = `Olá ${params.client_name || client?.name || 'Cliente'}! 👋

⚠️ *Cancelamento de agendamento(s)*

${deletedIds.length > 1 ? `${deletedIds.length} agendamentos foram cancelados` : 'Seu agendamento foi cancelado'} conforme solicitado.

Em caso de dúvidas ou para remarcar, entre em contato conosco.

Até breve! ✨`;

          await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              phone: params.client_phone,
              message,
            }),
          });
        } catch (error) {
          console.error('Error sending WhatsApp notification:', error);
        }
      }

      return {
        deleted: deletedIds.length,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      toast.success(`${result.deleted} agendamento(s) excluído(s) com sucesso!`);
    },
    onError: (error) => {
      toast.error('Erro ao excluir agendamentos: ' + error.message);
    },
  });

  const getSeriesAppointments = async (recurringGroupId: string) => {
    const { data, error } = await supabase
      .from('appointments')
      .select('*, client:clients(*), service:services(*)')
      .eq('recurring_group_id', recurringGroupId)
      .order('start_time', { ascending: true });

    if (error) throw error;
    return data;
  };

  return {
    createRecurringAppointments,
    rescheduleAppointmentSeries,
    deleteAppointmentSeries,
    getSeriesAppointments,
  };
}

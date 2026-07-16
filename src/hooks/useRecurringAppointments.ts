import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { adjustToBusinessHours, type BusinessHoursConfig } from '@/lib/businessHoursAdjustment';

// Use environment variable for URL - ensures consistency between preview and production
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

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
  // Optional: use custom dates instead of calculating from interval
  custom_dates?: Date[];
  duration_minutes?: number;
  // Discount: aplica em todos os agendamentos da série
  discount_amount?: number;
  // When true, do not auto-send WhatsApp; return the composed message so the
  // caller can show a preview dialog before sending.
  defer_whatsapp_preview?: boolean;
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

interface PropagateSeriesDatesParams {
  appointment_id: string;
  new_start_time: Date;
  new_end_time: Date;
  propagate_type: 'recurring' | 'package';
  recurring_group_id?: string;
  package_id?: string;
  interval_days?: number;
}

export function useRecurringAppointments() {
  const queryClient = useQueryClient();

  // Background creation function - runs independently of UI
  const createAppointmentsInBackground = async (
    params: CreateRecurringAppointmentsParams,
    session: { access_token: string },
    recurringGroupId: string
  ) => {
    const appointments: Array<{ start: Date; end: Date }> = [];
    const duration = params.duration_minutes 
      ? params.duration_minutes * 60 * 1000 
      : params.end_time.getTime() - params.start_time.getTime();
    
    // If custom dates are provided, use them directly instead of calculating
    if (params.custom_dates && params.custom_dates.length > 0) {
      for (const startDate of params.custom_dates) {
        const endDate = new Date(startDate.getTime() + duration);
        appointments.push({ start: startDate, end: endDate });
      }
    } else {
      // Create all appointment dates based on interval
      for (let i = 0; i < params.repeat_count; i++) {
        const startDate = addDays(params.start_time, params.interval_days * i);
        const endDate = new Date(startDate.getTime() + duration);
        appointments.push({ start: startDate, end: endDate });
      }
    }

    const createdAppointments: any[] = [];
    const failedAppointments: number[] = [];
    const totalSessions = appointments.length;
    
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
            notes: params.notes ? `${params.notes} - Sessão ${i + 1} de ${totalSessions}` : `Sessão ${i + 1} de ${totalSessions}`,
            status: 'scheduled',
          }),
        });

        const result = await response.json();

        if (result.success && result.data) {
          // Update the appointment with the recurring group ID and discount (if any)
          const updatePayload: any = { recurring_group_id: recurringGroupId };
          if (params.discount_amount && params.discount_amount > 0) {
            updatePayload.discount_amount = params.discount_amount;
          }
          const { data: updatedApt, error: updateError } = await supabase
            .from('appointments')
            .update(updatePayload)
            .eq('id', result.data.id)
            .select()
            .single();

          if (updateError) {
            console.error('Error updating recurring group:', updateError);
          }


          createdAppointments.push(updatedApt || result.data);
          
          // Invalidate queries after each creation for real-time updates
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
        } else {
          failedAppointments.push(i + 1);
        }
      } catch (error) {
        console.error(`Error creating appointment ${i + 1}:`, error);
        failedAppointments.push(i + 1);
      }
    }

    // Compose WhatsApp notification message (may defer sending for preview)
    let whatsappPreview: { phone: string; message: string } | undefined;
    if (params.send_whatsapp && params.client_phone && createdAppointments.length > 0) {
      const sessionsList = createdAppointments.map((apt, i) =>
        `📅 Sessão ${i + 1}: ${format(new Date(apt.start_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
      ).join('\n');

      const message = `Olá ${params.client_name || 'Cliente'}! 👋

Seus ${createdAppointments.length} agendamentos de *${params.service_name || 'serviço'}* foram criados com sucesso! 🎉

${sessionsList}

Se precisar reagendar alguma sessão, entre em contato conosco.

Até breve! ✨`;

      if (params.defer_whatsapp_preview) {
        whatsappPreview = { phone: params.client_phone, message };
      } else {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ phone: params.client_phone, message }),
          });
        } catch (error) {
          console.error('Error sending WhatsApp notification:', error);
        }
      }
    }

    // Final invalidation to ensure all data is fresh
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    queryClient.invalidateQueries({ queryKey: ['client-appointments'] });

    // Show final result toast
    if (failedAppointments.length > 0) {
      toast.warning(`${createdAppointments.length} agendamentos criados. Sessões ${failedAppointments.join(', ')} tiveram conflitos.`);
    } else if (createdAppointments.length > 0) {
      toast.success(`✅ Todos os ${createdAppointments.length} agendamentos foram registrados com sucesso!`);
    }

    return {
      recurringGroupId,
      created: createdAppointments.length,
      failed: failedAppointments,
      appointments: createdAppointments,
      whatsappPreview,
    };
  };

  const createRecurringAppointments = useMutation({
    mutationFn: async (params: CreateRecurringAppointmentsParams) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Não autenticado');
      }

      // Generate a unique group ID for this recurring series
      const recurringGroupId = crypto.randomUUID();
      
      // Start background creation - this will continue even if dialog is closed
      // We use setTimeout to allow the mutation to return immediately
      setTimeout(() => {
        createAppointmentsInBackground(params, session, recurringGroupId);
      }, 0);

      // Return immediately with pending status
      return {
        recurringGroupId,
        created: 0, // Will be updated by background process
        failed: [],
        appointments: [],
        pending: true,
      };
    },
    onSuccess: (result) => {
      // Show immediate feedback - actual creation happens in background
      toast.info('⏳ Criando agendamentos em segundo plano. Você pode fechar este formulário.');
    },
    onError: (error) => {
      toast.error('Erro ao iniciar criação de agendamentos: ' + error.message);
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

  // New: Propagate date changes to following appointments in a series
  const propagateSeriesDates = useMutation({
    mutationFn: async (params: PropagateSeriesDatesParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Não autenticado');
      }

      let appointmentsToUpdate: any[] = [];
      let intervalDays = params.interval_days || 7;

      if (params.propagate_type === 'recurring' && params.recurring_group_id) {
        // Get all appointments in the recurring series
        const { data: seriesAppointments, error: fetchError } = await supabase
          .from('appointments')
          .select('*, service:services(return_days)')
          .eq('recurring_group_id', params.recurring_group_id)
          .order('start_time', { ascending: true });

        if (fetchError) throw fetchError;

        // Find the original appointment index
        const originalIndex = seriesAppointments?.findIndex(apt => apt.id === params.appointment_id) ?? -1;
        
        if (originalIndex === -1 || !seriesAppointments) {
          throw new Error('Agendamento não encontrado na série');
        }

        // Use service return_days if available
        if (seriesAppointments[originalIndex]?.service?.return_days) {
          intervalDays = seriesAppointments[originalIndex].service.return_days;
        }

        // Get following appointments (excluding the current one which will be updated separately)
        appointmentsToUpdate = seriesAppointments.slice(originalIndex + 1);
      } else if (params.propagate_type === 'package' && params.package_id) {
        // Fetch all package sessions with their per-step interval_after_days
        const { data: pkgSessions, error: pkgErr } = await supabase
          .from('package_appointments')
          .select('id, appointment_id, sequence_order, session_number, interval_after_days, appointment:appointments!package_appointments_appointment_id_fkey(id, start_time, end_time, status, professional_id, room_id)')
          .eq('package_id', params.package_id)
          .order('sequence_order', { ascending: true, nullsFirst: false })
          .order('session_number', { ascending: true });
        if (pkgErr) throw pkgErr;

        const sourceIdx = (pkgSessions || []).findIndex(
          (pa: any) => pa.appointment_id === params.appointment_id
        );
        if (sourceIdx === -1) {
          return { updated: 0, appointments: [] };
        }

        // Load business settings for validation (best-effort)
        let bhCfg: BusinessHoursConfig | null = null;
        try {
          const { data: bs } = await supabase
            .from('business_settings')
            .select('opening_time, closing_time, saturday_opening_time, saturday_closing_time, sunday_opening_time, sunday_closing_time, work_saturdays, work_sundays')
            .maybeSingle();
          if (bs) bhCfg = bs as any;
        } catch (_) { /* ignore */ }

        const following = (pkgSessions || []).slice(sourceIdx + 1);
        const seriesAptIds = new Set(
          (pkgSessions || [])
            .map((pa: any) => pa.appointment_id)
            .filter(Boolean)
        );

        // Phase 1: compute proposed dates (with business-hour adjustment + chronological guard)
        type Proposed = {
          pa: any;
          apt: any;
          start: Date;
          end: Date;
          duration: number;
        };
        const proposed: Proposed[] = [];
        let cursor = new Date(params.new_start_time);
        let prevInterval = Number((pkgSessions![sourceIdx] as any)?.interval_after_days) || params.interval_days || 7;

        for (const pa of following) {
          const apt = (pa as any).appointment;
          if (!apt) { prevInterval = Number(pa.interval_after_days) || prevInterval; continue; }
          if (['completed', 'missed', 'cancelled'].includes(apt.status)) {
            prevInterval = Number(pa.interval_after_days) || prevInterval;
            continue;
          }

          let nextStart = addDays(cursor, prevInterval);
          nextStart.setHours(
            params.new_start_time.getHours(),
            params.new_start_time.getMinutes(),
            0, 0
          );
          const origStart = new Date(apt.start_time);
          const origEnd = new Date(apt.end_time);
          const duration = origEnd.getTime() - origStart.getTime();

          // Adjust to business hours / open days
          if (bhCfg) {
            nextStart = adjustToBusinessHours(nextStart, duration, bhCfg, 14);
          }

          // Chronological guard: must be strictly after previous proposed
          const minStart = proposed.length
            ? new Date(proposed[proposed.length - 1].end.getTime())
            : new Date(params.new_start_time.getTime() + 60_000);
          if (nextStart.getTime() < minStart.getTime()) {
            nextStart = new Date(minStart);
            if (bhCfg) nextStart = adjustToBusinessHours(nextStart, duration, bhCfg, 14);
          }

          const nextEnd = new Date(nextStart.getTime() + duration);
          proposed.push({ pa, apt, start: nextStart, end: nextEnd, duration });
          cursor = nextStart;
          prevInterval = Number(pa.interval_after_days) || prevInterval;
        }

        // Phase 2: validate conflicts against appointments outside the series
        const conflicts: Array<{ session_number: number | null; reason: string }> = [];
        for (const p of proposed) {
          const filters: string[] = [];
          if (p.apt.professional_id) filters.push(`professional_id.eq.${p.apt.professional_id}`);
          if (p.apt.room_id) filters.push(`room_id.eq.${p.apt.room_id}`);
          if (filters.length === 0) continue;

          const { data: conf } = await supabase
            .from('appointments')
            .select('id, start_time, end_time')
            .or(filters.join(','))
            .lt('start_time', p.end.toISOString())
            .gt('end_time', p.start.toISOString())
            .not('status', 'in', '(cancelled,missed)');

          const external = (conf || []).filter(
            (c: any) => !seriesAptIds.has(c.id) && c.id !== p.apt.id
          );
          if (external.length > 0) {
            conflicts.push({
              session_number: p.pa.session_number ?? null,
              reason: `Conflito de horário em ${format(p.start, "dd/MM 'às' HH:mm", { locale: ptBR })}`,
            });
          }
        }

        if (conflicts.length > 0) {
          const preview = conflicts.slice(0, 3).map(c => `Etapa ${c.session_number ?? '?'}: ${c.reason}`).join('\n');
          throw new Error(
            `Não foi possível ajustar ${conflicts.length} etapa(s) por conflito.\n${preview}${conflicts.length > 3 ? '\n...' : ''}`
          );
        }

        // Phase 3: apply updates (all-or-nothing best-effort with rollback of applied ones on failure)
        const updatedAppointments: any[] = [];
        const rollback: Array<{ id: string; start: string; end: string }> = [];
        for (const p of proposed) {
          rollback.push({ id: p.apt.id, start: p.apt.start_time, end: p.apt.end_time });
          const { data: updated, error: updErr } = await supabase
            .from('appointments')
            .update({
              start_time: p.start.toISOString(),
              end_time: p.end.toISOString(),
              updated_by: user.id,
            })
            .eq('id', p.apt.id)
            .select()
            .single();

          if (updErr || !updated) {
            // Rollback previously applied updates
            for (const rb of rollback.slice(0, -1)) {
              await supabase
                .from('appointments')
                .update({ start_time: rb.start, end_time: rb.end })
                .eq('id', rb.id);
            }
            throw new Error(
              `Falha ao atualizar etapa ${p.pa.session_number ?? '?'}: ${updErr?.message || 'erro desconhecido'}. Alterações revertidas.`
            );
          }
          updatedAppointments.push(updated);
        }

        return { updated: updatedAppointments.length, appointments: updatedAppointments };
      }


      if (appointmentsToUpdate.length === 0) {
        return { updated: 0, appointments: [] };
      }

      const updatedAppointments: any[] = [];
      let currentDate = params.new_start_time;

      for (const apt of appointmentsToUpdate) {
        // Calculate next date based on interval
        const nextDate = addDays(currentDate, intervalDays);
        
        // Preserve original time from the new start time
        const originalAptStart = new Date(apt.start_time);
        const originalAptEnd = new Date(apt.end_time);
        const duration = originalAptEnd.getTime() - originalAptStart.getTime();

        const newAptStart = new Date(nextDate);
        newAptStart.setHours(
          params.new_start_time.getHours(),
          params.new_start_time.getMinutes(),
          0, 0
        );
        const newAptEnd = new Date(newAptStart.getTime() + duration);

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

        if (!updateError && updated) {
          updatedAppointments.push(updated);
          currentDate = newAptStart; // Use this as base for next calculation
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
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      if (result.updated > 0) {
        toast.success(`${result.updated} agendamento(s) seguinte(s) atualizado(s) automaticamente!`);
      }
    },
    onError: (error) => {
      toast.error('Erro ao propagar datas: ' + error.message);
    },
  });

  return {
    createRecurringAppointments,
    rescheduleAppointmentSeries,
    deleteAppointmentSeries,
    getSeriesAppointments,
    propagateSeriesDates,
  };
}

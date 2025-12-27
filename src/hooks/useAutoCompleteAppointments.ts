import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useAppointments } from '@/hooks/useAppointments';
import { toast } from 'sonner';

export function useAutoCompleteAppointments() {
  const queryClient = useQueryClient();
  const { settings } = useBusinessSettings();
  const { appointments } = useAppointments();

  const autoCompleteOverdueAppointments = useCallback(async () => {
    if (!settings?.auto_complete_appointments) return;

    const now = new Date();
    
    // Find appointments that are scheduled/confirmed but their end_time has passed
    const overdueAppointments = appointments.filter(apt => {
      const endTime = new Date(apt.end_time);
      return (apt.status === 'scheduled' || apt.status === 'confirmed') && endTime < now;
    });

    if (overdueAppointments.length === 0) return;

    console.log(`Auto-completing ${overdueAppointments.length} overdue appointments...`);

    for (const apt of overdueAppointments) {
      try {
        const { error } = await supabase
          .from('appointments')
          .update({ status: 'completed' })
          .eq('id', apt.id);

        if (error) {
          console.error(`Error auto-completing appointment ${apt.id}:`, error);
        }

        // If appointment is linked to a package, update the package_appointment status
        if (apt.package_appointment_id) {
          await supabase
            .from('package_appointments')
            .update({ status: 'completed' })
            .eq('id', apt.package_appointment_id);
        }
      } catch (error) {
        console.error(`Error auto-completing appointment ${apt.id}:`, error);
      }
    }

    // Invalidate queries to refresh the UI
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
    queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
    queryClient.invalidateQueries({ queryKey: ['service_packages'] });
    queryClient.invalidateQueries({ queryKey: ['client_packages'] });

    if (overdueAppointments.length > 0) {
      toast.info(`${overdueAppointments.length} agendamento(s) marcado(s) como atendido(s) automaticamente.`);
    }
  }, [settings?.auto_complete_appointments, appointments, queryClient]);

  // Run auto-complete on mount and every 5 minutes
  useEffect(() => {
    if (!settings?.auto_complete_appointments) return;

    // Initial run
    autoCompleteOverdueAppointments();

    // Set up interval
    const interval = setInterval(autoCompleteOverdueAppointments, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [settings?.auto_complete_appointments, autoCompleteOverdueAppointments]);

  return { autoCompleteOverdueAppointments };
}

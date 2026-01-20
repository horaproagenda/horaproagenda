import { useMemo } from 'react';
import { useAppointments } from './useAppointments';
import { differenceInDays, addDays } from 'date-fns';

interface RecurrenceSuggestion {
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  serviceId: string;
  serviceName: string;
  averageInterval: number;
  lastAppointment: Date;
  suggestedDate: Date;
  daysOverdue: number;
  confidence: 'high' | 'medium' | 'low';
}

export function useSmartRecurrence() {
  const { appointments } = useAppointments();

  const recurrenceSuggestions = useMemo(() => {
    const suggestions: RecurrenceSuggestion[] = [];
    const now = new Date();
    
    // Group completed appointments by client + service
    const clientServiceHistory: Record<string, {
      clientId: string;
      clientName: string;
      clientPhone: string | null;
      serviceId: string;
      serviceName: string;
      dates: Date[];
    }> = {};

    const completedApts = appointments.filter(apt => 
      apt.status === 'completed' && apt.client_id && apt.service_id
    );

    completedApts.forEach(apt => {
      const key = `${apt.client_id}-${apt.service_id}`;
      if (!clientServiceHistory[key]) {
        clientServiceHistory[key] = {
          clientId: apt.client_id!,
          clientName: apt.client?.name || 'Cliente',
          clientPhone: apt.client?.phone || null,
          serviceId: apt.service_id!,
          serviceName: apt.service?.name || 'Serviço',
          dates: [],
        };
      }
      clientServiceHistory[key].dates.push(new Date(apt.start_time));
    });

    // Analyze patterns for each client-service combination
    Object.values(clientServiceHistory).forEach(history => {
      // Need at least 2 appointments to detect pattern
      if (history.dates.length < 2) return;

      // Sort dates chronologically
      const sortedDates = history.dates.sort((a, b) => a.getTime() - b.getTime());
      
      // Calculate intervals between appointments
      const intervals: number[] = [];
      for (let i = 1; i < sortedDates.length; i++) {
        intervals.push(differenceInDays(sortedDates[i], sortedDates[i - 1]));
      }

      // Calculate average interval
      const avgInterval = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
      
      // Skip if interval is too short (less than 7 days) or too long (more than 90 days)
      if (avgInterval < 7 || avgInterval > 90) return;

      // Get last appointment date
      const lastDate = sortedDates[sortedDates.length - 1];
      const suggestedDate = addDays(lastDate, avgInterval);
      const daysOverdue = differenceInDays(now, suggestedDate);

      // Only suggest if overdue or coming up soon (within 7 days)
      if (daysOverdue < -7) return;

      // Check if there's already an upcoming appointment for this client-service
      const hasUpcoming = appointments.some(apt => 
        apt.client_id === history.clientId &&
        apt.service_id === history.serviceId &&
        new Date(apt.start_time) > now &&
        ['scheduled', 'confirmed'].includes(apt.status)
      );

      if (hasUpcoming) return;

      // Calculate confidence based on data consistency
      const variance = intervals.reduce((sum, interval) => 
        sum + Math.pow(interval - avgInterval, 2), 0
      ) / intervals.length;
      const stdDev = Math.sqrt(variance);
      
      let confidence: 'high' | 'medium' | 'low' = 'low';
      if (intervals.length >= 4 && stdDev < avgInterval * 0.2) {
        confidence = 'high';
      } else if (intervals.length >= 2 && stdDev < avgInterval * 0.4) {
        confidence = 'medium';
      }

      suggestions.push({
        clientId: history.clientId,
        clientName: history.clientName,
        clientPhone: history.clientPhone,
        serviceId: history.serviceId,
        serviceName: history.serviceName,
        averageInterval: avgInterval,
        lastAppointment: lastDate,
        suggestedDate,
        daysOverdue,
        confidence,
      });
    });

    // Sort by overdue days (most overdue first)
    return suggestions.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [appointments]);

  const highPrioritySuggestions = useMemo(() => 
    recurrenceSuggestions.filter(s => s.daysOverdue > 0 && s.confidence !== 'low'),
    [recurrenceSuggestions]
  );

  const upcomingSuggestions = useMemo(() =>
    recurrenceSuggestions.filter(s => s.daysOverdue <= 0 && s.daysOverdue >= -7),
    [recurrenceSuggestions]
  );

  return {
    recurrenceSuggestions,
    highPrioritySuggestions,
    upcomingSuggestions,
  };
}

import { useEffect, useCallback } from 'react';
import { useAppointments } from './useAppointments';
import { useWhatsapp } from './useWhatsapp';
import { format, isWithinInterval, subHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ReminderLog {
  appointmentId: string;
  sentAt: Date;
  type: '24h' | '1h';
}

export function useAppointmentReminders() {
  const { appointments } = useAppointments();
  const { sendMessage, checkConnection } = useWhatsapp();

  const getSentReminders = useCallback(async (): Promise<ReminderLog[]> => {
    const stored = localStorage.getItem('appointment-reminders-sent');
    if (!stored) return [];
    
    try {
      const parsed = JSON.parse(stored);
      const now = new Date();
      const filtered = parsed.filter((r: ReminderLog) => {
        const sentAt = new Date(r.sentAt);
        return now.getTime() - sentAt.getTime() < 48 * 60 * 60 * 1000;
      });
      localStorage.setItem('appointment-reminders-sent', JSON.stringify(filtered));
      return filtered;
    } catch {
      return [];
    }
  }, []);

  const markReminderSent = useCallback((appointmentId: string, type: '24h' | '1h') => {
    const stored = localStorage.getItem('appointment-reminders-sent');
    const reminders: ReminderLog[] = stored ? JSON.parse(stored) : [];
    reminders.push({ appointmentId, sentAt: new Date(), type });
    localStorage.setItem('appointment-reminders-sent', JSON.stringify(reminders));
  }, []);

  const sendAutomaticReminders = useCallback(async () => {
    const status = await checkConnection();
    if (!status?.connected) return;

    const sentReminders = await getSentReminders();
    const now = new Date();

    for (const apt of appointments) {
      if (apt.status === 'cancelled' || apt.status === 'missed' || apt.status === 'rescheduled') continue;
      if (!apt.client?.phone) continue;

      const aptStart = new Date(apt.start_time);
      
      const hours24Before = subHours(aptStart, 24);
      const hours23Before = subHours(aptStart, 23);
      const already24hSent = sentReminders.some(r => r.appointmentId === apt.id && r.type === '24h');
      
      if (!already24hSent && isWithinInterval(now, { start: hours24Before, end: hours23Before })) {
        const message = `Olá ${apt.client.name}! 👋

Passando para lembrar do seu agendamento de *amanhã*:
📅 *${apt.service?.name}*
🗓️ ${format(aptStart, "EEEE, d 'de' MMMM", { locale: ptBR })}
⏰ ${format(aptStart, 'HH:mm')}

Por favor, confirme sua presença respondendo esta mensagem.

Até breve! ✨`;
        
        const success = await sendMessage(apt.client.phone, message);
        if (success) {
          markReminderSent(apt.id, '24h');
        }
      }

      const hours1Before = subHours(aptStart, 1);
      const minutes30Before = subHours(aptStart, 0.5);
      const already1hSent = sentReminders.some(r => r.appointmentId === apt.id && r.type === '1h');
      
      if (!already1hSent && isWithinInterval(now, { start: hours1Before, end: minutes30Before })) {
        const message = `Olá ${apt.client.name}! ⏰

Seu atendimento é *daqui a 1 hora*:
📅 *${apt.service?.name}*
⏰ ${format(aptStart, 'HH:mm')}

Estamos te esperando! ✨`;
        
        const success = await sendMessage(apt.client.phone, message);
        if (success) {
          markReminderSent(apt.id, '1h');
        }
      }
    }
  }, [appointments, sendMessage, checkConnection, getSentReminders, markReminderSent]);

  useEffect(() => {
    sendAutomaticReminders();
    const interval = setInterval(sendAutomaticReminders, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [sendAutomaticReminders]);

  return {
    sendAutomaticReminders,
  };
}

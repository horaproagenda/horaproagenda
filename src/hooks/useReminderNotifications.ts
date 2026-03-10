import { useEffect, useRef, useCallback } from 'react';
import { useReminders } from './useReminders';
import { useCashRegisters } from './useCashRegisters';
import { useBusinessSettings } from './useBusinessSettings';
import { format, parseISO, isToday, isBefore, addMinutes, startOfDay, isYesterday } from 'date-fns';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

// Get today's date as string for localStorage key
const getTodayKey = () => format(new Date(), 'yyyy-MM-dd');

// Check if a reminder was already notified today
const wasReminderNotifiedToday = (reminderId: string): boolean => {
  const stored = localStorage.getItem('reminder_notifications_sent');
  if (!stored) return false;
  
  try {
    const data = JSON.parse(stored);
    if (data.date !== getTodayKey()) return false;
    return data.reminderIds?.includes(reminderId) || false;
  } catch {
    return false;
  }
};

// Mark a reminder as notified today
const markReminderNotifiedToday = (reminderId: string) => {
  const stored = localStorage.getItem('reminder_notifications_sent');
  let existingIds: string[] = [];
  
  try {
    const data = JSON.parse(stored || '{}');
    if (data.date === getTodayKey()) {
      existingIds = data.reminderIds || [];
    }
  } catch {
    // ignore
  }
  
  localStorage.setItem('reminder_notifications_sent', JSON.stringify({
    date: getTodayKey(),
    reminderIds: [...new Set([...existingIds, reminderId])],
  }));
};

// Check if cash register close notification was shown today
const wasCashCloseNotifiedToday = (): boolean => {
  const stored = localStorage.getItem('cash_close_notification_sent');
  return stored === getTodayKey();
};

// Mark cash register close notification as sent today
const markCashCloseNotifiedToday = () => {
  localStorage.setItem('cash_close_notification_sent', getTodayKey());
};

// Check if yesterday's open register notification was shown
const wasYesterdayOpenNotifiedToday = (): boolean => {
  const stored = localStorage.getItem('yesterday_cash_open_notification_sent');
  return stored === getTodayKey();
};

// Mark yesterday's open register notification as sent
const markYesterdayOpenNotifiedToday = () => {
  localStorage.setItem('yesterday_cash_open_notification_sent', getTodayKey());
};

export function useReminderNotifications() {
  const { todayReminders, activeReminders } = useReminders();
  const { currentOpenRegister, cashRegisters } = useCashRegisters();
  const { settings } = useBusinessSettings();
  const navigate = useNavigate();
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifiedRemindersRef = useRef<Set<string>>(new Set());
  const yesterdayCheckDoneRef = useRef(false);

  // Check if there's an open cash register from yesterday
  const checkYesterdayOpenRegister = useCallback(() => {
    if (yesterdayCheckDoneRef.current) return;
    
    // Find any open register that was opened yesterday or earlier
    const oldOpenRegister = cashRegisters.find(register => {
      if (register.status !== 'open') return false;
      const openedAt = parseISO(register.opened_at);
      const todayStart = startOfDay(new Date());
      return isBefore(openedAt, todayStart);
    });
    
    if (oldOpenRegister && !wasYesterdayOpenNotifiedToday()) {
      yesterdayCheckDoneRef.current = true;
      markYesterdayOpenNotifiedToday();
      
      const openedDate = format(parseISO(oldOpenRegister.opened_at), 'dd/MM/yyyy');
      
      toast.error('⚠️ Caixa do dia anterior está aberto!', {
        description: `O caixa aberto em ${openedDate} ainda não foi fechado. Feche-o antes de abrir um novo.`,
        duration: 30000,
        action: {
          label: 'Ir para Caixa',
          onClick: () => navigate('/caixa?tab=caixa'),
        },
      });
    }
  }, [cashRegisters, navigate]);

  // Check and notify for reminders at their scheduled time
  const checkReminders = useCallback(() => {
    const now = new Date();
    const currentTime = format(now, 'HH:mm');
    
    todayReminders.forEach(reminder => {
      if (!reminder.reminder_time || reminder.is_completed) return;
      
      // Check if this reminder should trigger now
      const reminderTime = reminder.reminder_time.substring(0, 5); // HH:mm
      
      // Notify if time matches (within the same minute) and not already notified
      if (reminderTime === currentTime && !notifiedRemindersRef.current.has(reminder.id)) {
        if (!wasReminderNotifiedToday(reminder.id)) {
          notifiedRemindersRef.current.add(reminder.id);
          markReminderNotifiedToday(reminder.id);
          
          toast.info(`🔔 Lembrete: ${reminder.title}`, {
            description: reminder.description || 'Horário agendado para este lembrete',
            duration: 15000,
            action: {
              label: 'Ver Lembretes',
              onClick: () => navigate('/lembretes'),
            },
          });
        }
      }
    });
  }, [todayReminders, navigate]);

  // Check and notify to close cash register at end of business hours
  const checkCashRegisterClose = useCallback(() => {
    if (!settings?.closing_time || !currentOpenRegister) return;
    if (wasCashCloseNotifiedToday()) return;
    
    const now = new Date();
    const currentTime = format(now, 'HH:mm');
    const closingTime = settings.closing_time.substring(0, 5); // HH:mm
    
    // Check if we're at closing time or slightly before (15 min warning)
    const closingDate = new Date();
    const [closingHour, closingMin] = closingTime.split(':').map(Number);
    closingDate.setHours(closingHour, closingMin, 0, 0);
    
    const warningTime = format(addMinutes(closingDate, -15), 'HH:mm');
    
    // 15 minutes before closing
    if (currentTime === warningTime) {
      toast.warning('⏰ O expediente termina em 15 minutos', {
        description: 'Lembre-se de fechar o caixa antes de encerrar',
        duration: 10000,
      });
    }
    
    // At closing time
    if (currentTime === closingTime) {
      markCashCloseNotifiedToday();
      
      toast.error('🔒 Horário de fechar o caixa!', {
        description: 'O expediente terminou. Não esqueça de fechar o caixa.',
        duration: 20000,
        action: {
          label: 'Ir para Caixa',
          onClick: () => navigate('/caixa'),
        },
      });
    }
  }, [settings, currentOpenRegister, navigate]);

  // Set up interval to check every minute
  useEffect(() => {
    // Initial check
    checkReminders();
    checkCashRegisterClose();
    checkYesterdayOpenRegister();
    
    // Check every 30 seconds for better accuracy
    checkIntervalRef.current = setInterval(() => {
      checkReminders();
      checkCashRegisterClose();
      checkYesterdayOpenRegister();
    }, 30000);
    
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [checkReminders, checkCashRegisterClose, checkYesterdayOpenRegister]);

  return {
    todayReminders,
    activeReminders,
    hasOpenCashRegister: !!currentOpenRegister,
  };
}

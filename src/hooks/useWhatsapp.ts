import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WhatsAppConnectionStatus {
  configured: boolean;
  connected: boolean;
  state?: string;
  instance?: string;
  error?: string;
}

export function useWhatsapp() {
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<WhatsAppConnectionStatus | null>(null);

  const checkConnection = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-check-connection');
      
      if (error) throw error;
      
      setConnectionStatus(data);
      return data;
    } catch (error: any) {
      console.error('Error checking WhatsApp connection:', error);
      setConnectionStatus({ configured: false, connected: false, error: error.message });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async (phone: string, message: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: { phone, message }
      });
      
      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to send message');
      }
      
      toast.success('Mensagem enviada com sucesso!');
      return true;
    } catch (error: any) {
      console.error('Error sending WhatsApp message:', error);
      toast.error('Erro ao enviar mensagem: ' + error.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendReminder = useCallback(async (
    clientName: string,
    clientPhone: string,
    serviceName: string,
    appointmentDate: string,
    appointmentTime: string,
    template?: string
  ) => {
    const defaultTemplate = `Olá ${clientName}! 👋

Passando para lembrar do seu agendamento:
📅 *${serviceName}*
🗓️ ${appointmentDate}
⏰ ${appointmentTime}

Por favor, confirme sua presença respondendo esta mensagem.

Caso precise reagendar, entre em contato conosco.

Até breve! ✨`;

    const message = template 
      ? template
          .replace('{nome}', clientName)
          .replace('{servico}', serviceName)
          .replace('{data}', appointmentDate)
          .replace('{horario}', appointmentTime)
      : defaultTemplate;

    return sendMessage(clientPhone, message);
  }, [sendMessage]);

  const sendBirthdayMessage = useCallback(async (
    clientName: string,
    clientPhone: string,
    template?: string
  ) => {
    const defaultTemplate = `Feliz Aniversário, ${clientName}! 🎂🎉

Que seu dia seja repleto de alegria e realizações!

Como presente especial, preparamos uma surpresa para você. Entre em contato para saber mais!

Um grande abraço! 🎁`;

    const message = template 
      ? template.replace('{nome}', clientName)
      : defaultTemplate;

    return sendMessage(clientPhone, message);
  }, [sendMessage]);

  return {
    isLoading,
    connectionStatus,
    checkConnection,
    sendMessage,
    sendReminder,
    sendBirthdayMessage,
  };
}

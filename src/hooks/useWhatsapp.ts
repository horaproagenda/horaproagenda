import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WhatsAppConnectionStatus {
  configured: boolean;
  connected: boolean;
  state?: string;
  instance?: string;
  message?: string;
  provider?: string;
  error?: string;
}

interface QRCodeResponse {
  success: boolean;
  qrcode?: string;
  pairingCode?: string;
  instance?: string;
  connected?: boolean;
  message?: string;
  error?: string;
}

interface SendMessageOptions {
  client_id?: string;
  professional_id?: string;
  test?: boolean;
}

export function useWhatsapp() {
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isLoadingQR, setIsLoadingQR] = useState(false);

  const checkConnection = useCallback(async (professional_id?: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-check-connection', {
        body: professional_id ? { professional_id } : {},
      });
      
      if (error) throw error;
      
      setConnectionStatus(data);
      
      // Clear QR code if connected
      if (data?.connected) {
        setQrCode(null);
        setPairingCode(null);
      }
      
      return data;
    } catch (error: any) {
      console.error('Error checking WhatsApp connection:', error);
      setConnectionStatus({ configured: false, connected: false, error: error.message });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getQRCode = useCallback(async (professional_id?: string) => {
    setIsLoadingQR(true);
    setQrCode(null);
    setPairingCode(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-get-qrcode', {
        body: professional_id ? { professional_id } : {},
      });
      
      if (error) throw error;
      
      const response = data as QRCodeResponse;
      
      if (response.connected) {
        toast.success('WhatsApp já está conectado!');
        await checkConnection(professional_id);
        return { connected: true };
      }
      
      if (response.success && response.qrcode) {
        setQrCode(response.qrcode);
        if (response.pairingCode) {
          setPairingCode(response.pairingCode);
        }
        return response;
      }
      
      throw new Error(response.error || 'Não foi possível obter o QR Code');
    } catch (error: any) {
      console.error('Error getting QR code:', error);
      toast.error('Erro ao obter QR Code: ' + error.message);
      return null;
    } finally {
      setIsLoadingQR(false);
    }
  }, [checkConnection]);

  const sendMessage = useCallback(async (phone: string, message: string, options: SendMessageOptions = {}) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: { phone, message, ...options }
      });
      
      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to send message');
      }
      
      toast.success(data?.instance ? `Mensagem enviada pelo WhatsApp conectado (${data.instance})!` : 'Mensagem enviada com sucesso!');
      return data || true;
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

  const clearQRCode = useCallback(() => {
    setQrCode(null);
    setPairingCode(null);
  }, []);

  return {
    isLoading,
    connectionStatus,
    checkConnection,
    sendMessage,
    sendReminder,
    sendBirthdayMessage,
    qrCode,
    pairingCode,
    isLoadingQR,
    getQRCode,
    clearQRCode,
  };
}

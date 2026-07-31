import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { renderTemplate } from '@/lib/whatsappLink';

interface WhatsAppConnectionStatus {
  configured: boolean;
  connected: boolean;
  state?: string;
  instance?: string;
  message?: string;
  provider?: string;
  source?: 'professional' | 'global' | 'none';
  requiresRelease?: boolean;
  error?: string;
}

interface QRCodeResponse {
  success: boolean;
  qrcode?: string;
  qrText?: string;
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

/**
 * Cache/deduplicação global das checagens de status.
 *
 * Vários pontos da UI (keep-alive, polling do QR Code, realtime, refresh manual)
 * consultavam `whatsapp-check-connection` ao mesmo tempo, o que sobrecarregava a
 * edge function (erro 546 WORKER_RESOURCE_LIMIT) e fazia o status oscilar para
 * "desconectado" mesmo com a sessão ativa. Aqui garantimos no máximo 1 requisição
 * em voo por profissional e reaproveitamos o resultado por 1,5s.
 */
const inflightChecks = new Map<string, Promise<any>>();
const lastCheck = new Map<string, { at: number; data: any }>();
const CHECK_TTL_MS = 1_500;

export function useWhatsapp() {
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrText, setQrText] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isLoadingQR, setIsLoadingQR] = useState(false);

  const checkConnection = useCallback(async (professional_id?: string) => {
    const key = professional_id || 'self';
    const cached = lastCheck.get(key);
    if (cached && Date.now() - cached.at < CHECK_TTL_MS) {
      setConnectionStatus(cached.data);
      return cached.data;
    }

    let promise = inflightChecks.get(key);
    if (!promise) {
      promise = (async () => {
        const { data, error } = await supabase.functions.invoke('whatsapp-check-connection', {
          body: professional_id ? { professional_id } : {},
        });
        if (error) throw error;
        lastCheck.set(key, { at: Date.now(), data });
        return data;
      })().finally(() => { inflightChecks.delete(key); });
      inflightChecks.set(key, promise);
    }

    setIsLoading(true);
    try {
      const data = await promise;

      setConnectionStatus(data);

      // Clear QR code if connected
      if (data?.connected) {
        setQrCode(null);
        setQrText(null);
        setPairingCode(null);
      }

      return data;
    } catch (error: any) {
      console.error('Error checking WhatsApp connection:', error);
      // Falha de rede/edge function NÃO significa desconectado: preserva o
      // último status conhecido para o indicador não piscar "Desconectado".
      const previous = lastCheck.get(key)?.data;
      if (previous) {
        setConnectionStatus(previous);
        return previous;
      }
      setConnectionStatus({ configured: false, connected: false, error: error.message });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);


  const getQRCode = useCallback(async (professional_id?: string) => {
    setIsLoadingQR(true);
    setQrCode(null);
    setQrText(null);
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
      
      if (response.success && (response.qrcode || response.qrText)) {
        setQrCode(response.qrcode ?? null);
        setQrText(response.qrText ?? null);
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
      ? renderTemplate(template, {
          clientName,
          serviceName,
          appointmentDate,
          appointmentTime,
        })
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
      ? renderTemplate(template, { clientName })
      : defaultTemplate;

    return sendMessage(clientPhone, message);
  }, [sendMessage]);

  const clearQRCode = useCallback(() => {
    setQrCode(null);
    setQrText(null);
    setPairingCode(null);
  }, []);

  /**
   * Permite hidratar QR Code/pairing code obtidos diretamente de outro
   * endpoint (ex.: whatsapp-connect) sem precisar de uma segunda chamada
   * a whatsapp-get-qrcode — economiza um round-trip e acelera o fluxo.
   */
  const setQRCodeDirect = useCallback((qr: string | null, pairing?: string | null, text?: string | null) => {
    setQrCode(qr ?? null);
    setQrText(text ?? null);
    setPairingCode(pairing ?? null);
  }, []);

  return {
    isLoading,
    connectionStatus,
    checkConnection,
    sendMessage,
    sendReminder,
    sendBirthdayMessage,
    qrCode,
    qrText,
    pairingCode,
    isLoadingQR,
    getQRCode,
    clearQRCode,
    setQRCodeDirect,
  };
}

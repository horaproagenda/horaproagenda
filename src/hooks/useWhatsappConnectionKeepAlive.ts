import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useWhatsapp } from './useWhatsapp';
import { whatsappMessageQueue } from '@/lib/whatsappMessageQueue';

/**
 * Mantém a sessão UltraMsg do profissional viva enquanto a tela estiver
 * aberta e reage a quedas de conexão:
 *
 * - Faz ping silencioso a cada `intervalMs` (default 60s) chamando
 *   `whatsapp-check-connection`, que também atualiza `last_checked_at` /
 *   `last_connected_at` na tabela `professional_whatsapp_credentials`.
 * - Pausa quando a aba está em background.
 * - **Detecção de queda**: ao transitar de conectado → desconectado,
 *   dispara toast de alerta para o profissional agir rápido.
 * - **Auto-reconexão**: tenta restaurar a sessão automaticamente (5
 *   retentativas em backoff exponencial 5s → 10s → 20s → 40s → 80s)
 *   antes de exigir QR Code novo. Sessões UltraMsg costumam voltar
 *   sozinhas após oscilações de rede, então o re-ping é suficiente
 *   na maioria dos casos.
 * - **Throttle da fila**: pausa o envio de mensagens em background
 *   enquanto a conexão está caída, evitando falhas em cascata.
 */
export function useWhatsappConnectionKeepAlive(
  professionalId: string | null | undefined,
  options: { intervalMs?: number; enabled?: boolean; onStatus?: (status: any) => void } = {},
) {
  const { checkConnection } = useWhatsapp();
  const { intervalMs = 60_000, enabled = true, onStatus } = options;
  const timerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const wasConnectedRef = useRef<boolean | null>(null);
  const downToastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const MAX_RECONNECT_ATTEMPTS = 5;

    const cancelReconnect = () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
    };

    const scheduleReconnect = () => {
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        // Esgotou auto-reconexão: avisa para intervenção manual.
        if (downToastIdRef.current) toast.dismiss(downToastIdRef.current);
        downToastIdRef.current = toast.error(
          'WhatsApp continua desconectado após várias tentativas.',
          {
            description: 'Abra Configurações → WhatsApp e gere um novo QR Code.',
            duration: Infinity,
            id: `wpp-down-${professionalId ?? 'global'}`,
          },
        );
        return;
      }
      const attempt = reconnectAttemptsRef.current + 1;
      const delay = 5_000 * Math.pow(2, attempt - 1); // 5, 10, 20, 40, 80s
      reconnectTimerRef.current = window.setTimeout(async () => {
        reconnectAttemptsRef.current = attempt;
        const status = await checkConnection(professionalId || undefined);
        onStatus?.(status);
        if (status?.connected) {
          // Recuperou sozinho
          handleRecovered();
        } else {
          scheduleReconnect();
        }
      }, delay);
    };

    const handleDropped = () => {
      whatsappMessageQueue.pause();
      if (downToastIdRef.current) toast.dismiss(downToastIdRef.current);
      downToastIdRef.current = toast.warning(
        'Conexão do WhatsApp instável.',
        {
          description: 'Tentando reconectar automaticamente sem precisar de novo QR Code...',
          duration: 8_000,
          id: `wpp-drop-${professionalId ?? 'global'}`,
        },
      );
      cancelReconnect();
      scheduleReconnect();
    };

    const handleRecovered = () => {
      if (downToastIdRef.current) {
        toast.dismiss(downToastIdRef.current);
        downToastIdRef.current = null;
      }
      toast.success('WhatsApp reconectado.', {
        description: 'A fila de mensagens voltou a processar normalmente.',
        duration: 4_000,
      });
      cancelReconnect();
      whatsappMessageQueue.resume();
    };

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const status = await checkConnection(professionalId || undefined);
      onStatus?.(status);
      const isConnected = status?.connected === true;

      // Primeira leitura: apenas registra o estado base, sem alertas.
      if (wasConnectedRef.current === null) {
        wasConnectedRef.current = isConnected;
        if (!isConnected && status?.configured) {
          // Já entrou desconectado e tem credenciais: começa auto-reconexão.
          handleDropped();
        }
        return;
      }

      if (wasConnectedRef.current && !isConnected) {
        // Transição: estava conectado e caiu
        handleDropped();
      } else if (!wasConnectedRef.current && isConnected) {
        // Transição: voltou a conectar
        handleRecovered();
      }
      wasConnectedRef.current = isConnected;
    };

    void tick();
    timerRef.current = window.setInterval(() => { void tick(); }, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      cancelReconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [professionalId, enabled, intervalMs, checkConnection, onStatus]);
}

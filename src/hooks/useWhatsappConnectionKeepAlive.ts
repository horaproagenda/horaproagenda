import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useWhatsapp } from './useWhatsapp';
import { whatsappMessageQueue } from '@/lib/whatsappMessageQueue';

/**
 * Mantém a sessão de WhatsApp do profissional viva enquanto a tela estiver
 * aberta e reage a quedas de conexão.
 *
 * Estratégia (revisada para evitar sobrecarga da edge function):
 * - **Um único laço de polling** (antes havia o tick + um agendador de
 *   reconexão em paralelo + o polling do QR Code, o que gerava chamadas
 *   simultâneas e o erro 546 WORKER_RESOURCE_LIMIT — que por sua vez fazia o
 *   status aparecer como "desconectado" mesmo com a sessão ativa).
 * - Intervalo adaptativo: rápido (8s) enquanto desconectado/pareando, lento
 *   (60s) quando conectado. Pausa com a aba em background.
 * - Nunca dispara requisições sobrepostas (guarda de "em voo").
 * - O alerta persistente de "continua desconectado" só aparece após várias
 *   verificações seguidas realmente reportando desconexão.
 */
export function useWhatsappConnectionKeepAlive(
  professionalId: string | null | undefined,
  options: {
    intervalMs?: number;
    fastIntervalMs?: number;
    enabled?: boolean;
    /** Quando false, nenhum toast de queda/reconexão é exibido. */
    notify?: boolean;
    onStatus?: (status: any) => void;
  } = {},
) {
  const { checkConnection } = useWhatsapp();
  const {
    intervalMs = 60_000,
    fastIntervalMs = 8_000,
    enabled = true,
    notify = true,
    onStatus,
  } = options;

  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const wasConnectedRef = useRef<boolean | null>(null);
  const downStreakRef = useRef(0);
  const downToastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    /** Nº de verificações seguidas desconectado antes do alerta persistente. */
    const DOWN_STREAK_FOR_ALERT = 6; // ~48s de tentativas silenciosas

    const dismissDownToast = () => {
      if (downToastIdRef.current) {
        toast.dismiss(downToastIdRef.current);
        downToastIdRef.current = null;
      }
    };

    const handleDropped = () => {
      whatsappMessageQueue.pause();
      if (!notify) return;
      if (downStreakRef.current === 1) {
        toast.warning('Conexão do WhatsApp instável.', {
          description: 'Tentando reconectar automaticamente sem precisar de novo QR Code...',
          duration: 6_000,
          id: `wpp-drop-${professionalId ?? 'global'}`,
        });
      }
      if (downStreakRef.current === DOWN_STREAK_FOR_ALERT) {
        downToastIdRef.current = toast.error('WhatsApp continua desconectado.', {
          description: 'Abra Configurações → WhatsApp e gere um novo QR Code.',
          duration: Infinity,
          id: `wpp-down-${professionalId ?? 'global'}`,
        });
      }
    };

    const handleRecovered = () => {
      dismissDownToast();
      if (notify) {
        toast.success('WhatsApp reconectado.', {
          description: 'Reenviando mensagens que ficaram pendentes...',
          duration: 4_000,
        });
      }
      whatsappMessageQueue.resume();
      whatsappMessageQueue.retryFailed();
    };

    const schedule = (delay: number) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => { void tick(); }, delay);
    };

    const tick = async () => {
      if (runningRef.current) return;
      if (document.visibilityState !== 'visible') {
        schedule(intervalMs);
        return;
      }

      runningRef.current = true;
      let status: any = null;
      try {
        status = await checkConnection(professionalId || undefined);
      } finally {
        runningRef.current = false;
      }
      onStatus?.(status);

      // Sem resposta (rede/edge function indisponível): não muda o estado
      // exibido — apenas tenta de novo mais tarde.
      if (!status) {
        schedule(fastIntervalMs);
        return;
      }

      const isConnected = status.connected === true;

      if (isConnected) {
        downStreakRef.current = 0;
        if (wasConnectedRef.current === false) handleRecovered();
        else if (wasConnectedRef.current === null) {
          dismissDownToast();
          whatsappMessageQueue.resume();
          whatsappMessageQueue.retryFailed();
        }
      } else if (status.configured !== false) {
        downStreakRef.current += 1;
        handleDropped();
      }

      wasConnectedRef.current = isConnected;
      schedule(isConnected ? intervalMs : fastIntervalMs);
    };

    void tick();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [professionalId, enabled, notify, intervalMs, fastIntervalMs, checkConnection, onStatus]);
}

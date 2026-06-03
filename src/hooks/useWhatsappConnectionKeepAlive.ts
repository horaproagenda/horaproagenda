import { useEffect, useRef } from 'react';
import { useWhatsapp } from './useWhatsapp';

/**
 * Mantém a sessão UltraMsg do profissional viva enquanto a tela de
 * configurações estiver aberta. Faz um ping silencioso a cada `intervalMs`
 * (default 60s) chamando `whatsapp-check-connection`, que por sua vez
 * atualiza `last_checked_at`/`last_connected_at` na tabela
 * `professional_whatsapp_credentials`. Isso ajuda a detectar quedas cedo
 * e evita que o profissional ache que precisa criar uma nova instância.
 *
 * Também pausa quando a aba está em background para não gastar quota.
 */
export function useWhatsappConnectionKeepAlive(
  professionalId: string | null | undefined,
  options: { intervalMs?: number; enabled?: boolean } = {},
) {
  const { checkConnection } = useWhatsapp();
  const { intervalMs = 60_000, enabled = true } = options;
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void checkConnection(professionalId || undefined);
    };

    // Primeiro ping imediato
    tick();

    timerRef.current = window.setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [professionalId, enabled, intervalMs, checkConnection]);
}

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getQueue,
  subscribeQueue,
  processQueue,
  type QueuedOperation,
} from '@/lib/offlineQueue';

/**
 * useOfflineSync
 *
 * - Detecta quando o dispositivo perde/recupera conectividade.
 * - Mantém a UI funcional offline (graças ao SW + cache do React Query).
 * - Permite enfileirar mutações via `offlineQueue` enquanto offline.
 * - Ao voltar online, processa a fila automaticamente e dispara
 *   refetch global das queries (sincroniza dados pendentes do servidor).
 *
 * Handlers de operações são registrados via `registerHandler(type, fn)`
 * — cada hook/feature registra seu próprio handler para o tipo que
 * enfileira. Operações sem handler são ignoradas (não removidas).
 */

type Handler = (op: QueuedOperation) => Promise<void>;
const handlers = new Map<string, Handler>();

export function registerOfflineHandler(type: string, handler: Handler) {
  handlers.set(type, handler);
  return () => handlers.delete(type);
}

async function dispatch(op: QueuedOperation) {
  const handler = handlers.get(op.type);
  if (!handler) {
    // Sem handler -> não consideramos sucesso nem falha definitiva.
    // Lançamos para manter na fila.
    throw new Error(`Sem handler registrado para ${op.type}`);
  }
  await handler(op);
}

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [pending, setPending] = useState<QueuedOperation[]>(() => getQueue());
  const [isSyncing, setIsSyncing] = useState(false);

  // Acompanha a fila persistida
  useEffect(() => subscribeQueue(setPending), []);

  const sync = useCallback(async () => {
    if (isSyncing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (getQueue().length === 0) {
      // Sem fila: apenas reidrata dados
      await queryClient.invalidateQueries({ predicate: () => true, refetchType: 'all' });
      return;
    }

    setIsSyncing(true);
    const toastId = toast.loading('Sincronizando alterações pendentes...');
    try {
      const result = await processQueue(dispatch);
      // Reidrata caches após processar mutações
      await queryClient.invalidateQueries({ predicate: () => true, refetchType: 'all' });
      toast.dismiss(toastId);

      if (result.processed > 0) {
        toast.success(
          `${result.processed} alteração(ões) sincronizada(s) com sucesso`,
          { icon: '☁️', duration: 3500 },
        );
      }
      if (result.dropped > 0) {
        toast.error(
          `${result.dropped} alteração(ões) descartada(s) após várias tentativas`,
          { duration: 5000 },
        );
      }
      if (result.failed > 0 && result.processed === 0) {
        toast.message('Algumas alterações ainda aguardam reenvio', {
          description: 'Tentaremos novamente em breve.',
        });
      }
    } catch (err) {
      console.error('[useOfflineSync] erro ao processar fila:', err);
      toast.dismiss(toastId);
      toast.error('Falha ao sincronizar alterações pendentes');
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, queryClient]);

  // Listeners de online/offline
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Conexão restabelecida', { icon: '🌐', duration: 2500 });
      void sync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Você está offline', {
        description: 'A interface continua funcionando. Alterações serão enviadas quando voltar a conexão.',
        duration: 5000,
        icon: '📴',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Sync inicial caso já existam itens na fila e estejamos online
    if (navigator.onLine && getQueue().length > 0) {
      void sync();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sync]);

  return {
    isOnline,
    isSyncing,
    pendingCount: pending.length,
    pending,
    sync,
  };
}

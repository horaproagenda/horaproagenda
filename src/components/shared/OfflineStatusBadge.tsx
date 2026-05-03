import { CloudOff, RefreshCw, Cloud } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOfflineSync } from '@/hooks/useOfflineSync';

/**
 * Mostra o estado de conectividade e a quantidade de operações
 * pendentes aguardando sincronização. Permite forçar a sincronização
 * manual com um clique.
 */
export function OfflineStatusBadge() {
  const { isOnline, isSyncing, pendingCount, sync } = useOfflineSync();

  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null;
  }

  if (!isOnline) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="gap-1.5 px-2 py-1 text-[11px]">
            <CloudOff className="h-3 w-3" />
            Offline
            {pendingCount > 0 && (
              <span className="ml-1 rounded-full bg-background/30 px-1.5 text-[10px]">
                {pendingCount}
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {pendingCount > 0
            ? `${pendingCount} alteração(ões) aguardando reconexão`
            : 'Sem internet — a interface continua funcionando.'}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[11px]"
          onClick={() => void sync()}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <>
              <RefreshCw className="h-3 w-3 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <Cloud className="h-3 w-3" />
              {pendingCount} pendente(s)
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isSyncing
          ? 'Enviando alterações ao servidor'
          : 'Clique para sincronizar agora'}
      </TooltipContent>
    </Tooltip>
  );
}

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListChecks, RotateCw, Trash2 } from 'lucide-react';
import { useWhatsappMessageQueue } from '@/hooks/useWhatsappMessageQueue';

/**
 * Painel compacto da fila de envio de mensagens WhatsApp.
 * Mostra contadores em tempo real (pendentes/em execução/falhas/concluídas)
 * e oferece ações para reprocessar falhas ou limpar concluídas.
 *
 * Aparece dentro de Configurações → WhatsApp.
 */
export function WhatsappQueueStatusPanel() {
  const { snapshot, retryFailed, clearDone } = useWhatsappMessageQueue();

  // Só renderiza algo útil quando há atividade na fila.
  if (snapshot.total === 0) return null;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium">
          <ListChecks className="h-3.5 w-3.5" />
          Fila de envio de mensagens
        </div>
        <div className="flex gap-1">
          {snapshot.failed > 0 && (
            <Button size="sm" variant="ghost" onClick={retryFailed} className="h-7 px-2 text-[11px]">
              <RotateCw className="h-3 w-3 mr-1" /> Reprocessar
            </Button>
          )}
          {snapshot.done > 0 && (
            <Button size="sm" variant="ghost" onClick={clearDone} className="h-7 px-2 text-[11px]">
              <Trash2 className="h-3 w-3 mr-1" /> Limpar concluídas
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {snapshot.pending > 0 && (
          <Badge variant="outline" className="text-[10px]">{snapshot.pending} pendente{snapshot.pending > 1 ? 's' : ''}</Badge>
        )}
        {snapshot.running > 0 && (
          <Badge className="bg-blue-500 text-[10px]">{snapshot.running} enviando</Badge>
        )}
        {snapshot.failed > 0 && (
          <Badge variant="destructive" className="text-[10px]">{snapshot.failed} falha{snapshot.failed > 1 ? 's' : ''}</Badge>
        )}
        {snapshot.done > 0 && (
          <Badge className="bg-green-500 text-[10px]">{snapshot.done} enviada{snapshot.done > 1 ? 's' : ''}</Badge>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        As mensagens são processadas em background com retentativas automáticas para não travar o app.
        Quedas de conexão pausam a fila até a reconexão.
      </p>
    </div>
  );
}

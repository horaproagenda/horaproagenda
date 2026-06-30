import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Mailbox, RotateCw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Painel do servidor: monitora a fila persistente `whatsapp_send_queue`
 * (lembretes, confirmações, follow-ups, aniversário e cobranças).
 *
 * Diferente do painel de fila do navegador (que cuida apenas das mensagens
 * disparadas localmente), este aqui mostra o que está pendente do lado
 * do servidor — garantindo que mensagens programadas/atrasadas sempre
 * sejam reenviadas após reconexão do WhatsApp.
 *
 * - Atualiza em tempo real via Postgres Changes.
 * - Botão "Forçar envio agora" reseta `next_attempt_at` de todos pendentes
 *   e dispara `send-appointment-reminders` com `drain=true`.
 * - É chamado automaticamente quando o WhatsApp acabou de reconectar.
 */
type Counts = { pending: number; failed: number; oldestPendingAt: string | null };

export function WhatsappServerQueuePanel({
  autoDrainKey,
}: {
  /** Sempre que muda, o painel dispara drenagem automática (use o timestamp da última conexão). */
  autoDrainKey?: string | null;
}) {
  const [counts, setCounts] = useState<Counts>({ pending: 0, failed: 0, oldestPendingAt: null });
  const [loading, setLoading] = useState(false);
  const [draining, setDraining] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [invalidPhones, setInvalidPhones] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [{ count: pending }, { count: failed }, { data: oldest }] = await Promise.all([
        supabase.from('whatsapp_send_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('whatsapp_send_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase
          .from('whatsapp_send_queue')
          .select('next_attempt_at')
          .eq('status', 'pending')
          .order('next_attempt_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      setCounts({
        pending: pending ?? 0,
        failed: failed ?? 0,
        oldestPendingAt: (oldest as any)?.next_attempt_at ?? null,
      });
    } catch {
      /* sem permissão (não-admin) — painel apenas oculta números */
    } finally {
      setLoading(false);
    }
  }, []);

  const drain = useCallback(async (silent = false) => {
    setDraining(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-appointment-reminders', {
        body: { drain: true, catchup: true },
      });
      if (error) throw error;
      if (!silent) {
        const s = (data as any)?.summary || {};
        toast.success(
          `Fila processada: ${s.drained ?? 0} reabertas · ${s.retriedSent ?? 0} reenviadas · ${s.sent ?? 0} novas.`,
        );
      }
      void refresh();
    } catch (e: any) {
      if (!silent) toast.error('Não foi possível forçar o envio agora: ' + (e?.message || 'erro'));
    } finally {
      setDraining(false);
    }
  }, [refresh]);

  /**
   * Reprocessa TODAS as confirmações/lembretes da janela atual ignorando o log
   * de envios anteriores. Útil quando algum cliente (ex.: Isadora) não recebeu
   * a mensagem por instância desconectada, número inválido temporário ou
   * janela silenciosa que já passou.
   */
  const forceResend = useCallback(async () => {
    setForcing(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-appointment-reminders', {
        body: { drain: true, catchup: true, force: true },
      });
      if (error) throw error;
      const s = (data as any)?.summary || {};
      const invalids: string[] = Array.isArray(s.invalidPhones) ? s.invalidPhones : [];
      setInvalidPhones(invalids);
      toast.success(
        `Reenvio concluído: ${s.sent ?? 0} enviadas · ${s.queued ?? 0} na fila · ${s.skippedInvalidPhone ?? 0} com telefone inválido.`,
      );
      void refresh();
    } catch (e: any) {
      toast.error('Não foi possível reenviar confirmações: ' + (e?.message || 'erro'));
    } finally {
      setForcing(false);
    }
  }, [refresh]);

  // Bootstrap + realtime
  useEffect(() => {
    void refresh();
    const ch = supabase
      .channel('wpp-server-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_send_queue' }, () => {
        void refresh();
      })
      .subscribe();
    const t = setInterval(refresh, 30_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [refresh]);

  // Auto-drain quando o WhatsApp reconecta (mudança em autoDrainKey).
  useEffect(() => {
    if (!autoDrainKey) return;
    void drain(true);
  }, [autoDrainKey, drain]);

  const total = counts.pending + counts.failed;
  const oldestAgeMin = counts.oldestPendingAt
    ? Math.max(0, Math.round((Date.now() - new Date(counts.oldestPendingAt).getTime()) / 60_000))
    : 0;
  const stuck = counts.failed > 0 || oldestAgeMin > 30;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Mailbox className="h-3.5 w-3.5" />
          Fila do servidor (lembretes, confirmações, cobranças)
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={forceResend}
            disabled={forcing || draining}
            className="h-7 px-2 text-[11px]"
            title="Reenvia confirmações e lembretes da janela atual ignorando o log de envios anteriores"
          >
            {forcing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCw className="h-3 w-3 mr-1" />}
            Reenviar confirmações
          </Button>
          <Button
            size="sm"
            variant={stuck ? 'default' : 'ghost'}
            onClick={() => drain(false)}
            disabled={draining}
            className="h-7 px-2 text-[11px]"
          >
            {draining ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCw className="h-3 w-3 mr-1" />}
            Forçar envio agora
          </Button>
        </div>
      </div>


      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {loading ? '…' : counts.pending} pendente{counts.pending === 1 ? '' : 's'}
        </Badge>
        {counts.failed > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            {counts.failed} com falha
          </Badge>
        )}
        {counts.oldestPendingAt && (
          <Badge variant="secondary" className="text-[10px]">
            mais antiga há ~{oldestAgeMin} min
          </Badge>
        )}
      </div>

      {stuck && (
        <Alert variant={counts.failed > 0 ? 'destructive' : 'default'}>
          <AlertTriangle className="h-3.5 w-3.5" />
          <AlertTitle className="text-xs">
            {counts.failed > 0 ? 'Mensagens com falha permanente' : 'Mensagens aguardando há mais de 30 min'}
          </AlertTitle>
          <AlertDescription className="text-[11px]">
            Clique em <strong>Forçar envio agora</strong> para reprocessar imediatamente. O sistema também tenta
            reenviar automaticamente a cada 5 min e sempre que o WhatsApp reconecta.
          </AlertDescription>
        </Alert>
      )}

      {total === 0 && (
        <p className="text-[10px] text-muted-foreground">
          Nenhuma mensagem na fila — todas as mensagens automáticas estão sendo enviadas em dia.
        </p>
      )}
    </div>
  );
}

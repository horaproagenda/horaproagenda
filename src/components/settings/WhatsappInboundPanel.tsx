import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquareReply, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface InboundRow {
  id: string;
  created_at: string;
  from_number: string | null;
  body: string | null;
  status: string | null;
  provider_payload: any;
}

const OUTCOMES: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  confirmed: { label: 'Agendamento confirmado', variant: 'default' },
  cancelled: { label: 'Agendamento cancelado', variant: 'destructive' },
  intent_unclear: { label: 'Resposta não compreendida', variant: 'secondary' },
  client_not_found: { label: 'Cliente não identificado', variant: 'outline' },
  appointment_not_found: { label: 'Sem horário ativo', variant: 'outline' },
  sender_unknown: { label: 'Remetente não identificado', variant: 'outline' },
  instance_unknown: { label: 'Instância não vinculada', variant: 'outline' },
  error: { label: 'Falha ao registrar', variant: 'destructive' },
  ignored: { label: 'Sem ação', variant: 'outline' },
};

export function WhatsappInboundPanel() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['whatsapp-inbound-messages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id, created_at, from_number, body, status, provider_payload')
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as InboundRow[];
    },
    staleTime: 15_000,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareReply className="h-4 w-4 text-primary" />
            Respostas de confirmação recebidas
          </CardTitle>
          <CardDescription>
            Últimas respostas dos clientes e o que o sistema fez com cada uma.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          {isRefetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}

        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            Nenhuma resposta recebida ainda. Quando um cliente responder à mensagem de confirmação,
            ela aparecerá aqui com o resultado.
          </p>
        )}

        {(data ?? []).map((row) => {
          const payload = row.provider_payload || {};
          const outcome = OUTCOMES[String(row.status || 'ignored')] ?? { label: String(row.status), variant: 'outline' as const };
          return (
            <div key={row.id} className="rounded-lg border p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <span className="text-sm font-medium">
                  {payload.client_name || row.from_number || 'Desconhecido'}
                </span>
                <Badge variant={outcome.variant}>{outcome.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground break-words">“{row.body}”</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{format(new Date(row.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                {payload.intent && (
                  <span>Entendido como: {payload.intent === 'confirm' ? 'confirmar' : 'cancelar'}</span>
                )}
                {payload.appointment_start && (
                  <span>
                    Horário: {format(new Date(payload.appointment_start), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </span>
                )}
              </div>
              {payload.detail && (
                <p className="text-xs text-muted-foreground">{payload.detail}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

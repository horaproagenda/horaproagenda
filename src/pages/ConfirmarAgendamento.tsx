import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; status: 'confirmed' | 'cancelled'; clientName?: string; startTime?: string; already?: boolean }
  | { kind: 'error'; message: string };

export default function ConfirmarAgendamento() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const initialAction = (params.get('a') === 'cancel' ? 'cancel' : params.get('a') === 'confirm' ? 'confirm' : null);
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function submit(action: 'confirm' | 'cancel') {
    if (!token) return;
    setState({ kind: 'loading' });
    const { data, error } = await (supabase as any).rpc('confirm_appointment_by_token', {
      p_token: token,
      p_action: action,
    });
    if (error) {
      setState({ kind: 'error', message: error.message || 'Erro ao processar.' });
      return;
    }
    if (!data?.success) {
      setState({ kind: 'error', message: data?.error || 'Não foi possível processar o link.' });
      return;
    }
    setState({
      kind: 'success',
      status: data.status,
      clientName: data.client_name,
      startTime: data.start_time,
      already: data.already,
    });
  }

  useEffect(() => {
    if (initialAction) submit(initialAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, token]);

  const dt = state.kind === 'success' && state.startTime ? new Date(state.startTime) : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CalendarClock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Seu agendamento</CardTitle>
          <CardDescription>Confirme ou cancele seu horário</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {state.kind === 'idle' && (
            <>
              <p className="text-sm text-muted-foreground">
                Toque em uma das opções abaixo para responder ao salão.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button onClick={() => submit('confirm')} className="bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Confirmar horário
                </Button>
                <Button variant="outline" onClick={() => submit('cancel')}>
                  <XCircle className="h-4 w-4 mr-2" /> Cancelar
                </Button>
              </div>
            </>
          )}

          {state.kind === 'loading' && (
            <div className="py-6 flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Processando…</span>
            </div>
          )}

          {state.kind === 'success' && (
            <div className="space-y-2">
              {state.status === 'confirmed' ? (
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
              ) : (
                <XCircle className="h-12 w-12 mx-auto text-destructive" />
              )}
              <p className="font-semibold text-lg">
                {state.status === 'confirmed' ? 'Horário confirmado!' : 'Horário cancelado.'}
              </p>
              {state.clientName && (
                <p className="text-sm text-muted-foreground">{state.clientName}</p>
              )}
              {dt && (
                <p className="text-sm text-muted-foreground">
                  {format(dt, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
              {state.already && (
                <p className="text-xs text-muted-foreground">(Esta resposta já havia sido registrada)</p>
              )}
              {state.status === 'confirmed' && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => submit('cancel')}>
                  Mudei de ideia, cancelar
                </Button>
              )}
              {state.status === 'cancelled' && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => submit('confirm')}>
                  Quero reativar
                </Button>
              )}
            </div>
          )}

          {state.kind === 'error' && (
            <div className="space-y-2">
              <XCircle className="h-12 w-12 mx-auto text-destructive" />
              <p className="text-sm text-destructive">{state.message}</p>
              <Button variant="outline" size="sm" onClick={() => setState({ kind: 'idle' })}>
                Tentar novamente
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

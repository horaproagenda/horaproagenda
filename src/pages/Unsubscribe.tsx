import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State = 'loading' | 'valid' | 'invalid' | 'already' | 'success' | 'error' | 'submitting';

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
          headers: { apikey: SUPABASE_ANON },
        });
        const data = await res.json();
        if (data.valid) setState('valid');
        else if (data.reason === 'already_unsubscribed') setState('already');
        else setState('invalid');
      } catch {
        setState('error');
      }
    })();
  }, [token]);

  const confirm = async () => {
    setState('submitting');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success) setState('success');
      else if (data.reason === 'already_unsubscribed') setState('already');
      else setState('error');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Cancelar inscrição</CardTitle>
          <CardDescription>Agendalume</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Validando link…</div>}
          {state === 'valid' && (
            <>
              <p className="text-sm">Confirme para parar de receber e-mails do Agendalume.</p>
              <Button onClick={confirm} className="w-full">Confirmar cancelamento</Button>
            </>
          )}
          {state === 'submitting' && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Processando…</div>}
          {state === 'success' && <div className="flex items-center gap-2 text-green-600"><CheckCircle2 className="h-5 w-5" /> Inscrição cancelada com sucesso.</div>}
          {state === 'already' && <div className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="h-5 w-5" /> Você já havia cancelado a inscrição.</div>}
          {state === 'invalid' && <div className="flex items-center gap-2 text-destructive"><XCircle className="h-5 w-5" /> Link inválido ou expirado.</div>}
          {state === 'error' && <div className="flex items-center gap-2 text-destructive"><XCircle className="h-5 w-5" /> Erro ao processar. Tente novamente.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

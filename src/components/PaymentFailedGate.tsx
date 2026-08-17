import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { goToStripe } from '@/lib/stripeCheckout';
import type { AccountSubscription } from '@/hooks/useAccountSubscription';

interface PaymentFailedGateProps {
  subscription: AccountSubscription | null | undefined;
  /** true quando o usuário logado é administrador da conta (quem paga). */
  isAdmin: boolean;
}

/**
 * Tela de bloqueio exibida a TODOS os usuários da conta quando o pagamento da
 * assinatura não foi bem-sucedido (past_due / canceled).
 *
 * - O botão "Atualizar forma de pagamento" aparece SOMENTE para o administrador.
 * - Enquanto a tela está aberta, sincronizamos com o Stripe periodicamente:
 *   assim que o pagamento é confirmado, o app abre automaticamente (o hook de
 *   assinatura revalida e o ProtectedRoute libera o acesso).
 */
export function PaymentFailedGate({ subscription, isAdmin }: PaymentFailedGateProps) {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [portalLoading, setPortalLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const syncing = useRef(false);

  const revalidate = () => {
    qc.invalidateQueries({ queryKey: ['account-subscription', user?.id] });
    qc.invalidateQueries({ queryKey: ['seat-usage', user?.id] });
  };

  const sync = async (manual = false) => {
    if (syncing.current) return;
    syncing.current = true;
    if (manual) setChecking(true);
    try {
      await supabase.functions.invoke('check-subscription');
      revalidate();
      if (manual) toast.success('Status do pagamento atualizado.');
    } catch (e) {
      if (manual) toast.error(e);
    } finally {
      syncing.current = false;
      if (manual) setChecking(false);
    }
  };

  // Sincronização automática a cada 20s enquanto o acesso está bloqueado, e
  // também ao voltar o foco para a aba (retorno do portal do Stripe).
  useEffect(() => {
    void sync();
    const id = window.setInterval(() => void sync(), 20_000);
    const onFocus = () => { if (document.visibilityState !== 'hidden') void sync(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        goToStripe(data.url);
        return;
      }
      // Sem cliente no Stripe ainda → manda escolher um plano.
      navigate('/assinatura');
    } catch {
      navigate('/assinatura');
    } finally {
      setPortalLoading(false);
    }
  };

  const dueDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('pt-BR')
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <CardTitle>Pagamento não foi bem-sucedido</CardTitle>
          <CardDescription>
            {dueDate
              ? `A cobrança com vencimento em ${dueDate} não foi aprovada. `
              : 'A cobrança da sua assinatura não foi aprovada. '}
            {isAdmin
              ? 'Para voltar a ter acesso ao aplicativo, atualize a forma de pagamento.'
              : 'O acesso está bloqueado para todos os usuários desta conta até que o administrador atualize a forma de pagamento.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isAdmin && (
            <Button className="w-full" size="lg" onClick={openPortal} disabled={portalLoading}>
              {portalLoading
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <CreditCard className="mr-2 h-4 w-4" />}
              Atualizar forma de pagamento
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={() => void sync(true)} disabled={checking}>
            {checking
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <RefreshCw className="mr-2 h-4 w-4" />}
            Já paguei — verificar agora
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Assim que o pagamento for confirmado, o aplicativo abre automaticamente.
          </p>
          <Button variant="ghost" className="w-full" onClick={() => signOut()}>Sair</Button>
        </CardContent>
      </Card>
    </div>
  );
}

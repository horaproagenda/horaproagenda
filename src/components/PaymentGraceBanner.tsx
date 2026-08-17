import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { goToStripe } from '@/lib/stripeCheckout';
import { getGraceDaysLeft, getGraceEndsAt } from '@/lib/subscriptionAccess';
import type { AccountSubscription } from '@/hooks/useAccountSubscription';

interface PaymentGraceBannerProps {
  subscription: AccountSubscription;
  /** true quando o usuário logado é administrador da conta (quem paga). */
  isAdmin: boolean;
}

/**
 * Aviso fixo no topo do aplicativo durante o período de carência: a cobrança
 * automática (inclusive a do fim do teste) foi recusada, mas o acesso continua
 * liberado por alguns dias. Só o administrador vê a ação de atualizar cartão.
 */
export function PaymentGraceBanner({ subscription, isAdmin }: PaymentGraceBannerProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [portalLoading, setPortalLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const daysLeft = getGraceDaysLeft(subscription);
  const graceEnds = getGraceEndsAt(subscription);
  const graceDate = graceEnds ? new Date(graceEnds).toLocaleDateString('pt-BR') : null;

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        goToStripe(data.url);
        return;
      }
      navigate('/assinatura');
    } catch {
      navigate('/assinatura');
    } finally {
      setPortalLoading(false);
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      await supabase.functions.invoke('check-subscription');
      qc.invalidateQueries({ queryKey: ['account-subscription', user?.id] });
      qc.invalidateQueries({ queryKey: ['seat-usage', user?.id] });
      toast.success('Status do pagamento atualizado.');
    } catch (e) {
      toast.error(e);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="w-full px-4 py-2 text-sm flex flex-wrap items-center justify-center gap-2 bg-destructive/10 text-destructive"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="text-center">
        A cobrança da sua assinatura não foi aprovada.{' '}
        {daysLeft === 1
          ? 'Você tem 1 dia de carência'
          : `Você tem ${daysLeft} dias de carência`}
        {graceDate ? ` (até ${graceDate})` : ''} antes da suspensão do acesso.
      </span>
      {isAdmin && (
        <Button size="sm" variant="destructive" onClick={openPortal} disabled={portalLoading}>
          {portalLoading
            ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            : <CreditCard className="mr-1 h-3.5 w-3.5" />}
          Atualizar forma de pagamento
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={check} disabled={checking}>
        {checking
          ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
        Já paguei
      </Button>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { goToStripe } from '@/lib/stripeCheckout';
import { getRenewalNotice } from '@/lib/subscriptionReminders';
import type { AccountSubscription } from '@/hooks/useAccountSubscription';

interface RenewalReminderBannerProps {
  subscription: AccountSubscription;
  /** true quando o usuário logado é administrador da conta (quem paga). */
  isAdmin: boolean;
}

/**
 * Faixa de aviso exibida nos dias que antecedem a renovação da assinatura
 * (mensal, semestral ou anual) ou a cobrança automática do fim do teste.
 * Informa quantos dias faltam e, para o administrador, oferece o atalho para
 * atualizar a forma de pagamento no Stripe.
 */
export function RenewalReminderBanner({ subscription, isAdmin }: RenewalReminderBannerProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const notice = getRenewalNotice(subscription);
  if (!notice) return null;

  const date = new Date(notice.date).toLocaleDateString('pt-BR');
  const dias = notice.daysLeft === 1 ? '1 dia' : `${notice.daysLeft} dias`;

  const openPortal = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full px-4 py-2 text-sm flex flex-wrap items-center justify-center gap-2 bg-primary/10 text-primary"
    >
      <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="text-center">
        {notice.kind === 'trial_charge'
          ? subscription.stripe_subscription_id
            ? `Seu teste gratuito termina em ${dias} (${date}). A cobrança será feita automaticamente no cartão salvo.`
            : `Seu teste gratuito termina em ${dias} (${date}). Escolha um plano para continuar usando o aplicativo.`
          : `Sua assinatura será renovada em ${dias} (${date}). Confirme se o cartão cadastrado está válido.`}
      </span>
      {isAdmin && (
        <Button size="sm" variant="outline" onClick={openPortal} disabled={loading}>
          {loading
            ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            : <CreditCard className="mr-1 h-3.5 w-3.5" />}
          {subscription.stripe_subscription_id ? 'Atualizar forma de pagamento' : 'Escolher plano'}
        </Button>
      )}
    </div>
  );
}

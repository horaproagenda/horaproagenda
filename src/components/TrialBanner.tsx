import { useAccountSubscription } from '@/hooks/useAccountSubscription';
import { AlertCircle, Sparkles } from 'lucide-react';

/**
 * Banner persistente no topo da app.
 * - Teste gratuito em andamento: informa dias restantes e a data da cobrança
 *   automática no cartão salvo.
 * - Assinatura pendente/atrasada: alerta. O redirecionamento para /assinatura é
 *   feito pelo ProtectedRoute — não repetimos link aqui.
 */
export function TrialBanner() {
  const { subscription, isTrialing, trialDaysLeft } = useAccountSubscription();

  if (!subscription) return null;
  if (subscription.status === 'active' || subscription.status === 'grandfathered') return null;

  if (isTrialing) {
    const endDate = subscription.trial_ends_at
      ? new Date(subscription.trial_ends_at).toLocaleDateString('pt-BR')
      : null;
    const hasCard = Boolean(subscription.stripe_subscription_id);
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-full px-4 py-2 text-sm flex items-center justify-center gap-2 bg-primary/10 text-primary"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span>
          Teste gratuito — {trialDaysLeft} {trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'}
          {endDate
            ? hasCard
              ? `. Cobrança automática em ${endDate}.`
              : `. Sem cartão: escolha um plano até ${endDate}.`
            : '.'}
        </span>

      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full px-4 py-2 text-sm flex items-center justify-center gap-2 bg-destructive/10 text-destructive"
    >
      <AlertCircle className="h-4 w-4" aria-hidden="true" />
      <span>Assinatura pendente. Ative um plano para continuar usando o Hora Pro.</span>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useAccountSubscription } from '@/hooks/useAccountSubscription';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkles } from 'lucide-react';

/**
 * Banner persistente exibido no topo da app durante o trial.
 * Mostra dias restantes e link para a página de assinatura.
 */
export function TrialBanner() {
  const { hasRole } = useAuth();
  const { subscription, trialDaysLeft } = useAccountSubscription();

  if (!subscription) return null;
  if (subscription.status !== 'trial') return null;

  const isAdmin = hasRole('admin');
  const urgent = trialDaysLeft <= 5;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full px-4 py-2 text-sm flex items-center justify-center gap-3 ${
        urgent ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
      }`}
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      <span>
        {trialDaysLeft > 0
          ? <>Período de teste grátis: <strong>{trialDaysLeft} {trialDaysLeft === 1 ? 'dia' : 'dias'}</strong> restantes</>
          : <>Seu período de teste terminou.</>}
      </span>
      {isAdmin && (
        <Link to="/assinatura" className="underline font-medium">
          Ver planos
        </Link>
      )}
    </div>
  );
}

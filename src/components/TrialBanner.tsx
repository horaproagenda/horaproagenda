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
  const { subscription } = useAccountSubscription();

  if (!subscription) return null;
  // Só exibe quando há pagamento pendente (status trial/past_due/canceled).
  if (subscription.status === 'active' || subscription.status === 'grandfathered') return null;

  const isAdmin = hasRole('admin');

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full px-4 py-2 text-sm flex items-center justify-center gap-3 bg-destructive/10 text-destructive"
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      <span>Assinatura pendente. Ative um plano para continuar usando o Hora Pro.</span>
      {isAdmin && (
        <Link to="/assinatura" className="underline font-medium">
          Escolher plano
        </Link>
      )}
    </div>
  );
}

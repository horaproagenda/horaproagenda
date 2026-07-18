import { useAccountSubscription } from '@/hooks/useAccountSubscription';
import { AlertCircle } from 'lucide-react';

/**
 * Banner persistente exibido no topo da app quando a assinatura está pendente.
 * O redirecionamento para /assinatura é feito pelo ProtectedRoute — não repetimos link aqui.
 */
export function TrialBanner() {
  const { subscription } = useAccountSubscription();

  if (!subscription) return null;
  if (subscription.status === 'active' || subscription.status === 'grandfathered') return null;

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


import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Mail } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { revalidateVersionAfterAuth } from '@/lib/bootVersionGuard';
import { useAccountSubscription } from '@/hooks/useAccountSubscription';
import { useActiveAccountGuard } from '@/hooks/useActiveAccountGuard';
import { TrialBanner } from '@/components/TrialBanner';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, signOut, hasRole } = useAuth();
  const [resending, setResending] = useState(false);
  const location = useLocation();
  const checkedRef = useRef(false);
  const { subscription, trialExpired, hasAccess } = useAccountSubscription();

  // Realtime guard: desloga imediatamente se admin inativar este usuário.
  useActiveAccountGuard();

  useEffect(() => {
    if (!user || checkedRef.current) return;
    checkedRef.current = true;
    void revalidateVersionAfterAuth(`protected-route:${location.pathname}`);
  }, [user, location.pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Email não confirmado
  if (!user.email_confirmed_at) {
    const handleResendEmail = async () => {
      if (!user.email) return;
      setResending(true);
      try {
        const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
        if (error) toast.error('Erro ao reenviar email: ' + error.message);
        else toast.success('Email de verificação reenviado!');
      } catch {
        toast.error('Erro ao reenviar email');
      } finally {
        setResending(false);
      }
    };

    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Confirme seu email</CardTitle>
            <CardDescription>
              Por favor, verifique sua caixa de entrada ({user.email}) e clique no link de confirmação antes de acessar o sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full" onClick={handleResendEmail} disabled={resending}>
              {resending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reenviando...</>) : 'Reenviar email de verificação'}
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => signOut()}>Voltar para login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Trial expirado → redireciona para tela de planos (somente admin paga).
  // Permite acesso às próprias páginas de assinatura.
  const isOnSubscriptionPage = location.pathname.startsWith('/assinatura');
  if (subscription && !hasAccess && trialExpired && !isOnSubscriptionPage) {
    if (hasRole('admin')) {
      return <Navigate to="/assinatura" replace />;
    }
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle>Conta com pagamento pendente</CardTitle>
            <CardDescription>
              O período de teste desta conta terminou. Peça ao administrador para ativar a assinatura.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" className="w-full" onClick={() => signOut()}>Sair</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <TrialBanner />
      {children}
    </>
  );
}

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

/**
 * Realtime guard: ouve mudanças no próprio profile e desconecta
 * imediatamente quando o admin marca o usuário como inativo.
 */
export function useActiveAccountGuard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`active-guard-${user.id}`)
      .on(
        'postgres_changes',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` } as any,
        async (payload: { new: { is_active?: boolean } }) => {
          if (payload?.new?.is_active === false) {
            toast.error('Seu acesso foi suspenso pelo administrador.');
            try { await signOut(); } catch { /* noop */ }
            navigate('/conta-inativa', { replace: true });
          }
        }
      )
      .subscribe();

    // Check inicial: se já está inativo, desloga
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('profiles').select('is_active').eq('id', user.id).maybeSingle();
      if (data && data.is_active === false) {
        try { await signOut(); } catch { /* noop */ }
        navigate('/conta-inativa', { replace: true });
      }
    })();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, signOut, navigate]);
}

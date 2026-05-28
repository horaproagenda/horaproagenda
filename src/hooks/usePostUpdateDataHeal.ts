import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { APP_BUILD_TIME } from '@/lib/version';
import { toast } from 'sonner';

const STORAGE_KEY = 'app:last_healed_build_v1';

/**
 * usePostUpdateDataHeal
 *
 * Quando uma nova versão do app é publicada (APP_BUILD_TIME muda),
 * chama a função `heal_legacy_data` no Supabase para normalizar
 * dados antigos (status, valores nulos, intervalos de pacote, datas
 * de produto, etc.) e invalida o cache do React Query para que toda
 * a agenda mostre informações atualizadas imediatamente.
 *
 * - Só executa uma vez por build, por dispositivo (controle via localStorage).
 * - Roda apenas para administradores; outras roles ignoram em silêncio
 *   (o RPC valida via `has_role`).
 * - Falha silenciosa: erros são logados mas não quebram o app.
 */
export function usePostUpdateDataHeal() {
  const queryClient = useQueryClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      try {
        const lastHealed = localStorage.getItem(STORAGE_KEY);
        if (lastHealed === APP_BUILD_TIME) return; // already healed this build

        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return;

        // Try to heal — RPC will reject non-admins silently
        const { data, error } = await supabase.rpc('heal_legacy_data');
        if (error) {
          // non-admin or transient — mark as attempted to avoid retry storms
          if (error.message?.includes('administradores')) {
            localStorage.setItem(STORAGE_KEY, APP_BUILD_TIME);
          }
          console.warn('[PostUpdateHeal] skipped:', error.message);
          return;
        }

        localStorage.setItem(STORAGE_KEY, APP_BUILD_TIME);
        console.info('[PostUpdateHeal] healed legacy data:', data);

        // Record migration (idempotent)
        await supabase.rpc('record_data_migration', {
          p_key: `auto_heal_${APP_BUILD_TIME}`,
          p_details: data ?? {},
        }).then(() => {}, () => {});

        // Invalidate everything so UI reflects updated data
        await queryClient.invalidateQueries({
          predicate: () => true,
          refetchType: 'active',
        });

        toast.success('Agenda atualizada para a nova versão', {
          description: 'Dados antigos foram normalizados automaticamente.',
          duration: 4000,
        });
      } catch (e) {
        console.warn('[PostUpdateHeal] error:', e);
      }
    };

    // Pequeno delay para não competir com o boot
    const t = window.setTimeout(run, 3000);
    return () => window.clearTimeout(t);
  }, [queryClient]);
}

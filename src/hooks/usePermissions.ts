import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  PERMISSION_MODULES,
  normalizeRow,
  evaluate,
  canSeeRecord,
  canWriteRecord,
  type PermissionRow,
  type PermissionModuleKey,
  type PermAction,
  type DataScope,
  type DataVisibility,
} from '@/lib/permissions';

export type UserPermissionRow = PermissionRow;

/**
 * Permissões do usuário logado.
 *
 * IMPORTANTE: isto é apenas a camada de interface. As mesmas regras são
 * aplicadas no banco pelas policies de RLS (`perm`, `can_see_record`,
 * `can_write_record`), então esconder um botão aqui nunca é a única barreira.
 */
export function usePermissions() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasRole('admin');

  const { data, isLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: async (): Promise<{ rows: PermissionRow[]; professionalId: string | null }> => {
      if (!user?.id) return { rows: [], professionalId: null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: permData, error } = await (supabase as any)
        .from('user_permissions')
        .select('*')
        .eq('user_id', user.id);
      if (error) console.warn('user_permissions error:', error);

      const raw = (permData ?? []) as Array<Partial<PermissionRow> & { module: string }>;
      const rows = PERMISSION_MODULES.map(m =>
        normalizeRow(m.key, raw.find(r => r.module === m.key)),
      );

      let professionalId: string | null = null;
      try {
        const { data: prof } = await supabase
          .from('professionals')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        professionalId = prof?.id ?? null;
      } catch {
        professionalId = null;
      }

      return { rows, professionalId };
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const myProfessionalId = data?.professionalId ?? null;

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`perms-${user.id}`)
      .on('postgres_changes',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { event: '*', schema: 'public', table: 'user_permissions', filter: `user_id=eq.${user.id}` } as any,
        () => qc.invalidateQueries({ queryKey: ['user-permissions', user.id] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  const can = (module: PermissionModuleKey, action: PermAction): boolean => {
    if (isAdmin) return true;
    return evaluate(rows, module, action);
  };

  const scope = (module: PermissionModuleKey): DataScope =>
    isAdmin ? 'all' : (rows.find(r => r.module === module)?.data_scope ?? 'shared');

  const canSeeValues = (module: PermissionModuleKey) => can(module, 'view_values');

  const canSee = (
    module: PermissionModuleKey,
    record: { owner_professional_id?: string | null; visibility?: DataVisibility | null },
  ) => canSeeRecord({
    rows, module, isAdmin, myProfessionalId,
    ownerProfessionalId: record.owner_professional_id,
    visibility: record.visibility ?? null,
  });

  const canWrite = (
    module: PermissionModuleKey,
    action: 'edit' | 'delete',
    record: { owner_professional_id?: string | null },
  ) => canWriteRecord({
    rows, module, action, isAdmin, myProfessionalId,
    ownerProfessionalId: record.owner_professional_id,
  });

  return { rows, can, scope, canSeeValues, canSee, canWrite, isAdmin, myProfessionalId, isLoading };
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { AppModuleKey, PermissionAction } from '@/lib/plans';

export interface UserPermissionRow {
  module: AppModuleKey;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export function usePermissions() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasRole('admin');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: async (): Promise<UserPermissionRow[]> => {
      if (!user?.id) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('user_permissions')
        .select('module, can_view, can_create, can_edit, can_delete')
        .eq('user_id', user.id);
      if (error) {
        console.warn('user_permissions error:', error);
        return [];
      }
      return (data ?? []) as UserPermissionRow[];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

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

  const can = (module: AppModuleKey, action: PermissionAction): boolean => {
    if (isAdmin) return true;
    const row = rows.find(r => r.module === module);
    if (!row) return false;
    switch (action) {
      case 'view': return row.can_view;
      case 'create': return row.can_create;
      case 'edit': return row.can_edit;
      case 'delete': return row.can_delete;
    }
  };

  return { rows, can, isAdmin, isLoading };
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Flags de escopo do profissional logado (produtos e documentos).
 *
 * Fonte: coluna `professionals.permissions` (jsonb) — a mesma editada no
 * formulário de gerenciamento de profissionais. Administrador e recepção têm
 * acesso amplo; o profissional respeita o que o administrador marcou.
 *
 * Esta é a camada de interface: o banco continua aplicando RLS.
 */
export interface ProfessionalScopeFlags {
  professionalId: string | null;
  isPrivileged: boolean;
  /** Pode cadastrar/editar produtos de toda a clínica. */
  canManageProducts: boolean;
  /** Pode cadastrar/editar apenas os produtos que ele criou. */
  canManageOwnProducts: boolean;
  /** Vê somente os produtos que criou. */
  onlyOwnProducts: boolean;
  /** Vê todos os documentos e modelos da clínica. */
  canViewAllDocuments: boolean;
  /** Cria e edita apenas os próprios documentos e modelos. */
  canManageOwnDocuments: boolean;
  /** Vê somente os documentos/modelos que criou. */
  onlyOwnDocuments: boolean;
  isLoading: boolean;
}

export function useProfessionalScopeFlags(): ProfessionalScopeFlags {
  const { user, hasRole } = useAuth();
  const isPrivileged = hasRole('admin') || hasRole('receptionist');

  const { data, isLoading } = useQuery({
    queryKey: ['professional-scope-flags', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: row } = await supabase
        .from('professionals')
        .select('id, permissions')
        .eq('user_id', user!.id)
        .maybeSingle();
      return {
        id: (row?.id as string | undefined) ?? null,
        permissions: ((row?.permissions ?? {}) as Record<string, boolean>) || {},
      };
    },
  });

  const perms = data?.permissions ?? {};
  const canManageProducts = isPrivileged || perms.can_manage_products === true;
  const canManageOwnProducts = !isPrivileged && perms.can_manage_own_products === true;
  const onlyOwnProducts =
    !isPrivileged &&
    perms.can_view_other_products !== true &&
    (perms.can_view_only_own_products === true || perms.can_manage_own_products === true);

  const canViewAllDocuments = isPrivileged || perms.can_view_all_documents === true;
  const canManageOwnDocuments = !isPrivileged && perms.can_manage_own_documents === true;
  const onlyOwnDocuments = !canViewAllDocuments && (perms.can_manage_own_documents === true || perms.can_view_only_own_documents === true);

  return {
    professionalId: data?.id ?? null,
    isPrivileged,
    canManageProducts,
    canManageOwnProducts,
    onlyOwnProducts,
    canViewAllDocuments,
    canManageOwnDocuments,
    onlyOwnDocuments,
    isLoading,
  };
}

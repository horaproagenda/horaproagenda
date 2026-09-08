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
  /** Tem acesso ao módulo financeiro e ao caixa da clínica. */
  canAccessFinancial: boolean;
  /** Pode dar baixa em pagamentos (registrando no caixa principal). */
  canManagePayments: boolean;
  /** Pode abrir e fechar o próprio caixa; se não, herda o caixa da clínica. */
  canOpenCloseRegister: boolean;
  /** Tem caixa próprio, com entradas e saídas separadas do caixa da clínica. */
  canManageOwnRegister: boolean;
  /** Compartilha bancos, taxas, boletos e contas com administrador e recepção. */
  sharesFinancialWithAdmin: boolean;
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
      if (row?.id) {
        return {
          id: row.id as string,
          permissions: ((row.permissions ?? {}) as Record<string, boolean>) || {},
        };
      }
      // Cadastro sem vínculo direto de usuário: localiza pelo e-mail (mesma
      // regra usada pelas permissões do banco).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: fallbackId } = await (supabase as any).rpc('get_professional_id_for_user', {
        _user_id: user!.id,
      });
      if (!fallbackId) return { id: null, permissions: {} as Record<string, boolean> };
      const { data: byEmail } = await supabase
        .from('professionals')
        .select('id, permissions')
        .eq('id', fallbackId as string)
        .maybeSingle();
      return {
        id: (byEmail?.id as string | undefined) ?? null,
        permissions: ((byEmail?.permissions ?? {}) as Record<string, boolean>) || {},
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

  const canAccessFinancial = isPrivileged || perms.can_access_financial === true;
  const canManagePayments = isPrivileged || perms.can_manage_payments === true;
  const canOpenCloseRegister = isPrivileged || perms.can_open_close_register === true;
  const canManageOwnRegister = !isPrivileged && perms.can_manage_own_register === true;
  const sharesFinancialWithAdmin = isPrivileged || perms.can_share_financial_with_admin === true;

  return {
    professionalId: data?.id ?? null,
    isPrivileged,
    canManageProducts,
    canManageOwnProducts,
    onlyOwnProducts,
    canViewAllDocuments,
    canManageOwnDocuments,
    onlyOwnDocuments,
    canAccessFinancial,
    canManagePayments,
    canOpenCloseRegister,
    canManageOwnRegister,
    sharesFinancialWithAdmin,
    isLoading,
  };
}

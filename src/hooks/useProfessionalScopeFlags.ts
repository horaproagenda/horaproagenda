import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { inferEmploymentType, type EmploymentType } from '@/lib/employmentType';

/**
 * Flags de escopo do profissional logado.
 *
 * Fonte: `professionals.employment_type` (tipo de vínculo) somado à coluna
 * `professionals.permissions` (jsonb) editada no formulário de profissionais.
 * O tipo de vínculo manda no financeiro: independente tem financeiro e caixa
 * próprios, separados da clínica; comissionado só vê seus atendimentos,
 * pagamentos e comissões.
 *
 * Esta é a camada de interface: o banco continua aplicando RLS.
 */
export interface ProfessionalScopeFlags {
  professionalId: string | null;
  isPrivileged: boolean;
  /** Tipo de vínculo com a clínica. */
  employmentType: EmploymentType | null;
  /** Financeiro e caixa próprios, separados da clínica. */
  isIndependent: boolean;
  /** Só acessa seus atendimentos, pagamentos e comissões. */
  isCommissionBased: boolean;
  /** Pode cadastrar/editar produtos de toda a clínica. */
  canManageProducts: boolean;
  /** Pode cadastrar/editar apenas os produtos que ele criou. Todo profissional pode. */
  canManageOwnProducts: boolean;
  /** Vê somente os produtos que criou. */
  onlyOwnProducts: boolean;
  /** Vê todos os documentos e modelos da clínica. */
  canViewAllDocuments: boolean;
  /** Cria e edita apenas os próprios documentos e modelos. Todo profissional pode. */
  canManageOwnDocuments: boolean;
  /** Vê somente os documentos/modelos que criou. */
  onlyOwnDocuments: boolean;
  /** Tem acesso a algum financeiro (próprio ou da clínica). */
  canAccessFinancial: boolean;
  /** Gerencia o financeiro da clínica (perfil gerente). */
  canManageClinicFinancial: boolean;
  /** Registra despesas na conta da clínica. */
  canRegisterExpenses: boolean;
  /** Pode dar baixa em pagamentos. */
  canManagePayments: boolean;
  /** Pode abrir e fechar o caixa da clínica. */
  canOpenCloseRegister: boolean;
  /** Compatibilidade: indica financeiro/caixa pessoal habilitado. */
  canManageOwnRegister: boolean;
  /** Ver os totais financeiros do dia da clínica. */
  canViewDailyRevenue: boolean;
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
        .select('id, permissions, employment_type, app_role, is_commission_based')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (row?.id) return row;
      // Cadastro sem vínculo direto de usuário: localiza pelo e-mail (mesma
      // regra usada pelas permissões do banco).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: fallbackId } = await (supabase as any).rpc('get_professional_id_for_user', {
        _user_id: user!.id,
      });
      if (!fallbackId) return null;
      const { data: byId } = await supabase
        .from('professionals')
        .select('id, permissions, employment_type, app_role, is_commission_based')
        .eq('id', fallbackId as string)
        .maybeSingle();
      return byId ?? null;
    },
  });

  const perms = ((data?.permissions ?? {}) as Record<string, boolean>) || {};
  const employmentType = data ? inferEmploymentType(data as never) : null;
  const isIndependent = employmentType === 'independente';
  const isCommissionBased = employmentType === 'comissionado';

  const canManageProducts = isPrivileged || perms.can_manage_products === true;
  const isProfessional = hasRole('professional');
  const canManageOwnProducts = !isPrivileged && isProfessional;
  const onlyOwnProducts =
    !isPrivileged &&
    perms.can_view_other_products !== true &&
    (perms.can_view_only_own_products !== false || isProfessional);

  const canViewAllDocuments = isPrivileged || perms.can_view_all_documents === true;
  const canManageOwnDocuments = !isPrivileged && isProfessional;
  const onlyOwnDocuments = !canViewAllDocuments && isProfessional;

  const canManageClinicFinancial = hasRole('admin') || (!isIndependent && !isCommissionBased && perms.can_manage_clinic_financial === true);
  const canRegisterExpenses = isPrivileged || (!isIndependent && !isCommissionBased && perms.can_register_expenses === true);
  const canManagePayments = hasRole('admin') || (!isIndependent && perms.can_manage_payments === true) || isIndependent;
  const canOpenCloseRegister = isPrivileged || (!isIndependent && !isCommissionBased && perms.can_open_close_register === true);
  const canViewDailyRevenue = isPrivileged || (!isIndependent && !isCommissionBased && perms.can_view_daily_revenue === true);

  const canAccessFinancial = isPrivileged || isIndependent || isCommissionBased || canManageClinicFinancial;

  return {
    professionalId: (data?.id as string | undefined) ?? null,
    isPrivileged,
    employmentType,
    isIndependent,
    isCommissionBased,
    canManageProducts,
    canManageOwnProducts,
    onlyOwnProducts,
    canViewAllDocuments,
    canManageOwnDocuments,
    onlyOwnDocuments,
    canAccessFinancial,
    canManageClinicFinancial,
    canRegisterExpenses,
    canManagePayments,
    canOpenCloseRegister,
    canManageOwnRegister: isIndependent,
    canViewDailyRevenue,
    isLoading,
  };
}

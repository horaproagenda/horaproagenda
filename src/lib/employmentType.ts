/**
 * Tipo de vínculo do profissional com a clínica.
 *
 * O tipo é a fonte da verdade para o financeiro: um profissional independente
 * tem financeiro e caixa próprios (separados da clínica) e por isso não recebe
 * nenhuma permissão sobre o financeiro da clínica. Um comissionado só vê seus
 * atendimentos, pagamentos e comissões.
 */
export type EmploymentType = 'independente' | 'comissionado' | 'funcionario' | 'administrador';

export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string; description: string }[] = [
  {
    value: 'independente',
    label: 'Independente',
    description:
      'Financeiro e caixa próprios, totalmente separados da clínica. Acesso total apenas às próprias informações.',
  },
  {
    value: 'comissionado',
    label: 'Comissionado',
    description: 'Acessa somente seus atendimentos, pagamentos e comissões.',
  },
  {
    value: 'funcionario',
    label: 'Funcionário',
    description: 'Trabalha no financeiro da clínica conforme as permissões marcadas.',
  },
  {
    value: 'administrador',
    label: 'Administrador',
    description: 'Acesso total à clínica.',
  },
];

/** Chaves de permissão do bloco Financeiro (as antigas foram removidas). */
export const FINANCIAL_PERMISSION_KEYS = [
  'can_manage_clinic_financial',
  'can_open_close_register',
  'can_register_expenses',
  'can_manage_payments',
  'can_view_daily_revenue',
] as const;

/** Chaves de permissão financeira que deixaram de existir. */
export const REMOVED_FINANCIAL_PERMISSION_KEYS = [
  'can_access_financial',
  'can_share_financial_with_admin',
  'can_view_other_payments',
  'can_view_other_registers',
  'can_manage_own_register',
] as const;

/**
 * Independente e comissionado não recebem permissões do financeiro da clínica:
 * o primeiro tem o seu próprio, o segundo só enxerga suas comissões.
 */
export function financialPermissionsLocked(type: EmploymentType | undefined | null): boolean {
  return type === 'independente' || type === 'comissionado';
}

export function financialLockReason(type: EmploymentType | undefined | null): string | null {
  if (type === 'independente') {
    return 'Profissional independente já tem acesso total ao próprio financeiro e caixa, separados da clínica. Por isso as permissões do financeiro da clínica ficam desativadas.';
  }
  if (type === 'comissionado') {
    return 'Profissional comissionado acessa somente seus atendimentos, pagamentos e comissões. Por isso as permissões do financeiro da clínica ficam desativadas.';
  }
  return null;
}

/** Aplica as regras do tipo de vínculo sobre o mapa de permissões salvo. */
export function normalizePermissionsForEmployment(
  type: EmploymentType | undefined | null,
  permissions: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...permissions };
  for (const key of REMOVED_FINANCIAL_PERMISSION_KEYS) delete next[key];
  if (financialPermissionsLocked(type)) {
    for (const key of FINANCIAL_PERMISSION_KEYS) next[key] = false;
  }
  return next;
}

/** Deriva o tipo de vínculo de um cadastro antigo, que ainda não tem o campo. */
export function inferEmploymentType(professional: {
  employment_type?: string | null;
  app_role?: string | null;
  is_commission_based?: boolean | null;
  permissions?: Record<string, unknown> | null;
}): EmploymentType {
  if (professional.employment_type) return professional.employment_type as EmploymentType;
  if (professional.app_role === 'admin') return 'administrador';
  const perms = (professional.permissions ?? {}) as Record<string, unknown>;
  if (perms.can_access_financial === true || perms.can_manage_own_register === true) return 'independente';
  if (professional.is_commission_based) return 'comissionado';
  return 'funcionario';
}

/**
 * Mantém compatibilidade com as regras de banco já existentes: o profissional
 * independente continua marcado internamente como dono do próprio financeiro e
 * do próprio caixa, mesmo que essas opções não apareçam mais na tela.
 */
export function withCompatFinancialKeys(
  type: EmploymentType | undefined | null,
  permissions: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...permissions };
  const independent = type === 'independente';
  next.can_access_financial = independent;
  next.can_manage_own_register = independent;
  next.can_share_financial_with_admin = false;
  next.can_view_other_payments = false;
  next.can_view_other_registers = false;
  return next;
}

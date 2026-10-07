/**
 * Permissões recomendadas a partir da função no sistema + tipo de vínculo.
 * Usado no cadastro de profissionais para sugerir automaticamente as opções
 * corretas. O administrador continua podendo ajustar cada chave.
 */
import { normalizePermissionsForEmployment, type EmploymentType } from './employmentType';

export type AppRole = 'admin' | 'receptionist' | 'professional';

const OWN_ONLY = {
  can_share_clients_with_admin: true,
  can_view_other_clients: false,
  can_view_only_own_clients: true,
  can_view_other_agendas: false,
  can_view_only_own_agenda: true,
  can_modify_agenda: false,
  can_manage_products: false,
  can_manage_own_products: true,
  can_share_documents_with_admin: true,
  can_view_all_documents: false,
  can_manage_own_documents: true,
  can_share_services_with_admin: true,
  can_view_other_services: false,
  can_view_other_reports: false,
  can_view_only_own_reports: true,
  can_access_audit: false,
  can_access_settings: false,
  can_manage_clinic_financial: false,
  can_open_close_register: false,
  can_register_expenses: false,
  can_manage_payments: false,
  can_view_daily_revenue: false,
};

export function recommendedPermissions(role: AppRole | string, employment: EmploymentType): Record<string, boolean> {
  if (role === 'admin') {
    return Object.fromEntries(Object.keys(OWN_ONLY).map((k) => [k, k !== 'can_view_only_own_clients' && k !== 'can_view_only_own_agenda' && k !== 'can_view_only_own_reports' && k !== 'can_manage_own_products']));
  }
  let p: Record<string, boolean> = { ...OWN_ONLY };
  if (role === 'receptionist') {
    p = {
      ...p,
      can_view_other_clients: true, can_view_only_own_clients: false,
      can_view_other_agendas: true, can_view_only_own_agenda: false,
      can_modify_agenda: true,
      can_view_other_services: true,
      can_view_all_documents: true,
      can_manage_payments: true,
      can_open_close_register: true,
      can_view_daily_revenue: true,
    };
  } else if (employment === 'independente') {
    // Tudo próprio: financeiro/caixa próprios já são garantidos pelo vínculo.
    p = { ...p, can_share_clients_with_admin: false, can_share_documents_with_admin: false, can_share_services_with_admin: false };
  }
  return normalizePermissionsForEmployment(employment, p);
}

export const ROLE_EMPLOYMENT_HINT: Record<string, string> = {
  admin: 'Administrador: acesso total a todos os módulos, inclusive configurações, auditoria e financeiro.',
  receptionist: 'Recepção: vê e organiza a agenda e os clientes de toda a equipe, recebe pagamentos dos profissionais autorizados e opera o caixa. Não gerencia o financeiro nem as configurações.',
  independente: 'Profissional independente: trabalha só com os próprios clientes, agenda, serviços e produtos, com financeiro e caixa próprios. Nada do que ele cadastra é compartilhado por padrão.',
  comissionado: 'Profissional comissionado: vê a própria agenda, os próprios clientes e as próprias comissões. Não acessa o financeiro do estabelecimento.',
  funcionario: 'Profissional funcionário: atende a própria agenda e compartilha seus cadastros com a administração. Permissões financeiras podem ser liberadas individualmente.',
  administrador: 'Vínculo administrador: acesso total.',
};

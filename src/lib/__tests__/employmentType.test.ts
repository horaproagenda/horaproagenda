import { describe, expect, it } from 'vitest';
import {
  EMPLOYMENT_TYPES,
  FINANCIAL_PERMISSION_KEYS,
  REMOVED_FINANCIAL_PERMISSION_KEYS,
  financialLockReason,
  financialPermissionsLocked,
  inferEmploymentType,
  normalizePermissionsForEmployment,
  withCompatFinancialKeys,
} from '@/lib/employmentType';

describe('tipo de vínculo do profissional', () => {
  it('oferece os quatro vínculos exigidos', () => {
    expect(EMPLOYMENT_TYPES.map((t) => t.value)).toEqual([
      'independente',
      'comissionado',
      'funcionario',
      'administrador',
    ]);
  });

  it('trava o financeiro da clínica para independente e comissionado', () => {
    expect(financialPermissionsLocked('independente')).toBe(true);
    expect(financialPermissionsLocked('comissionado')).toBe(true);
    expect(financialPermissionsLocked('funcionario')).toBe(false);
    expect(financialPermissionsLocked('administrador')).toBe(false);
    expect(financialLockReason('independente')).toContain('próprio financeiro');
    expect(financialLockReason('funcionario')).toBeNull();
  });

  it('desliga as permissões da clínica e remove as chaves antigas', () => {
    const result = normalizePermissionsForEmployment('independente', {
      can_manage_clinic_financial: true,
      can_open_close_register: true,
      can_register_expenses: true,
      can_manage_payments: true,
      can_view_daily_revenue: true,
      can_access_financial: true,
      can_manage_own_register: true,
      can_share_financial_with_admin: true,
      can_view_other_payments: true,
      can_view_other_registers: true,
      can_manage_products: true,
    });
    for (const key of FINANCIAL_PERMISSION_KEYS) expect(result[key]).toBe(false);
    for (const key of REMOVED_FINANCIAL_PERMISSION_KEYS) expect(key in result).toBe(false);
    expect(result.can_manage_products).toBe(true);
  });

  it('mantém as permissões marcadas para funcionário', () => {
    const result = normalizePermissionsForEmployment('funcionario', {
      can_manage_clinic_financial: true,
      can_open_close_register: false,
    });
    expect(result.can_manage_clinic_financial).toBe(true);
    expect(result.can_open_close_register).toBe(false);
  });

  it('marca compatibilidade de caixa/financeiro próprio só para independente', () => {
    const independent = withCompatFinancialKeys('independente', {});
    expect(independent.can_access_financial).toBe(true);
    expect(independent.can_manage_own_register).toBe(true);
    expect(independent.can_share_financial_with_admin).toBe(false);

    const employee = withCompatFinancialKeys('funcionario', {});
    expect(employee.can_access_financial).toBe(false);
    expect(employee.can_manage_own_register).toBe(false);
  });

  it('deduz o vínculo de cadastros antigos', () => {
    expect(inferEmploymentType({ employment_type: 'comissionado' })).toBe('comissionado');
    expect(inferEmploymentType({ app_role: 'admin' })).toBe('administrador');
    expect(inferEmploymentType({ permissions: { can_manage_own_register: true } })).toBe('independente');
    expect(inferEmploymentType({ is_commission_based: true })).toBe('comissionado');
    expect(inferEmploymentType({})).toBe('funcionario');
  });
});

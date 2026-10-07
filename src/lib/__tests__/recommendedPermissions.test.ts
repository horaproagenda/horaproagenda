import { describe, it, expect } from 'vitest';
import { recommendedPermissions } from '@/lib/recommendedPermissions';
import { FINANCIAL_PERMISSION_KEYS } from '@/lib/employmentType';

describe('permissões recomendadas por função e vínculo', () => {
  it('administrador recebe acesso total', () => {
    const p = recommendedPermissions('admin', 'administrador');
    expect(p.can_access_settings).toBe(true);
    expect(p.can_manage_clinic_financial).toBe(true);
    expect(p.can_view_other_agendas).toBe(true);
    expect(p.can_view_only_own_agenda).toBe(false);
  });
  it('independente e comissionado nunca recebem financeiro do estabelecimento', () => {
    for (const t of ['independente', 'comissionado'] as const) {
      const p = recommendedPermissions('professional', t);
      for (const k of FINANCIAL_PERMISSION_KEYS) expect(p[k]).toBe(false);
      expect(p.can_view_only_own_agenda).toBe(true);
      expect(p.can_access_settings).toBe(false);
    }
  });
  it('independente não compartilha por padrão', () => {
    expect(recommendedPermissions('professional', 'independente').can_share_clients_with_admin).toBe(false);
  });
  it('recepção vê agenda e clientes de todos, sem configurações', () => {
    const p = recommendedPermissions('receptionist', 'funcionario');
    expect(p.can_view_other_agendas).toBe(true);
    expect(p.can_view_other_clients).toBe(true);
    expect(p.can_manage_clinic_financial).toBe(false);
    expect(p.can_access_settings).toBe(false);
  });
  it('opções "todos" e "somente próprios" nunca ficam ligadas juntas', () => {
    for (const [r, e] of [['professional', 'funcionario'], ['receptionist', 'funcionario'], ['admin', 'administrador']] as const) {
      const p = recommendedPermissions(r, e);
      expect(p.can_view_other_agendas && p.can_view_only_own_agenda).toBe(false);
      expect(p.can_view_other_clients && p.can_view_only_own_clients).toBe(false);
      expect(p.can_manage_products && p.can_manage_own_products).toBe(false);
    }
  });
});

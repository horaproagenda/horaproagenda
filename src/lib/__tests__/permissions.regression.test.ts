/**
 * Testes de regressão de permissões e privacidade.
 *
 * Cada bloco responde: qual era o problema, o que é esperado e o que não pode
 * voltar a acontecer. Espelha as funções de RLS `perm`, `can_see_record` e
 * `can_write_record` — se o comportamento aqui mudar, o backend também mudou
 * indevidamente.
 */
import { describe, it, expect } from 'vitest';
import {
  blankRow,
  presetPermissions,
  normalizeRow,
  evaluate,
  canSeeRecord,
  canWriteRecord,
  PERMISSION_MODULES,
  type PermissionRow,
} from '../permissions';

const PROF_A = 'prof-a';
const PROF_B = 'prof-b';

const rowsFor = (patch: Partial<PermissionRow> & { module: PermissionRow['module'] }) =>
  PERMISSION_MODULES.map(m =>
    m.key === patch.module ? { ...blankRow(m.key), ...patch } : blankRow(m.key),
  );

describe('regressão: permissões por módulo', () => {
  // Problema: usuário sem permissão de Financeiro conseguia ver o módulo.
  it('módulo negado não concede nenhuma ação', () => {
    const rows = rowsFor({ module: 'financeiro' }); // tudo false
    for (const action of ['view', 'create', 'edit', 'delete', 'export', 'view_values'] as const) {
      expect(evaluate(rows, 'financeiro', action)).toBe(false);
    }
  });

  it('negar Financeiro não afeta os outros módulos autorizados', () => {
    const rows = PERMISSION_MODULES.map(m =>
      m.key === 'financeiro' ? blankRow(m.key) : blankRow(m.key, true),
    );
    expect(evaluate(rows, 'financeiro', 'view')).toBe(false);
    expect(evaluate(rows, 'agenda', 'view')).toBe(true);
    expect(evaluate(rows, 'clientes', 'create')).toBe(true);
  });

  // Problema: dados antigos sem colunas novas liberavam tudo por padrão.
  it('linha ausente no banco cai em somente-visualizar/compartilhado', () => {
    const row = normalizeRow('produtos', undefined);
    expect(row.can_view).toBe(true);
    expect(row.can_edit).toBe(false);
    expect(row.can_delete_others).toBe(false);
    expect(row.data_scope).toBe('shared');
  });

  it('colunas ausentes nunca viram true', () => {
    const row = normalizeRow('clientes', { module: 'clientes', can_view: true } as Partial<PermissionRow>);
    expect(row.can_edit_others).toBe(false);
    expect(row.can_view_values).toBe(false);
  });
});

describe('regressão: clientes privados x compartilhados', () => {
  const ownScope = rowsFor({
    module: 'clientes',
    data_scope: 'own',
    can_view: true,
    can_create: true,
    can_edit: true,
  });

  // Problema: cliente privado do Profissional A aparecia para o Profissional B.
  it('Profissional B não vê cliente privado do Profissional A', () => {
    expect(
      canSeeRecord({
        rows: ownScope,
        module: 'clientes',
        ownerProfessionalId: PROF_A,
        visibility: 'private',
        myProfessionalId: PROF_B,
      }),
    ).toBe(false);
  });

  it('nem com view_others nem com escopo da clínica um registro privado é exposto', () => {
    const wide = rowsFor({
      module: 'clientes',
      data_scope: 'all',
      can_view: true,
      can_view_others: true,
    });
    expect(
      canSeeRecord({
        rows: wide,
        module: 'clientes',
        ownerProfessionalId: PROF_A,
        visibility: 'private',
        myProfessionalId: PROF_B,
      }),
    ).toBe(false);
  });

  it('o dono sempre vê o próprio cliente privado', () => {
    expect(
      canSeeRecord({
        rows: ownScope,
        module: 'clientes',
        ownerProfessionalId: PROF_A,
        visibility: 'private',
        myProfessionalId: PROF_A,
      }),
    ).toBe(true);
  });

  it('Administrador vê o cliente privado', () => {
    expect(
      canSeeRecord({
        rows: ownScope,
        module: 'clientes',
        ownerProfessionalId: PROF_A,
        visibility: 'private',
        myProfessionalId: PROF_B,
        isAdmin: true,
      }),
    ).toBe(true);
  });

  it('cliente compartilhado exige escopo > own ou view_others', () => {
    const base = {
      module: 'clientes' as const,
      ownerProfessionalId: PROF_A,
      visibility: 'shared' as const,
      myProfessionalId: PROF_B,
    };
    expect(canSeeRecord({ ...base, rows: ownScope })).toBe(false);
    expect(
      canSeeRecord({
        ...base,
        rows: rowsFor({ module: 'clientes', data_scope: 'own', can_view: true, can_view_others: true }),
      }),
    ).toBe(true);
    expect(
      canSeeRecord({
        ...base,
        rows: rowsFor({ module: 'clientes', data_scope: 'unit', can_view: true }),
      }),
    ).toBe(true);
  });
});

describe('regressão: serviços, pacotes e produtos privados', () => {
  for (const module of ['servicos', 'produtos'] as const) {
    it(`${module}: registro privado de outro profissional fica invisível`, () => {
      const rows = rowsFor({ module, data_scope: 'shared', can_view: true, can_view_others: true });
      expect(
        canSeeRecord({
          rows,
          module,
          ownerProfessionalId: PROF_A,
          visibility: 'private',
          myProfessionalId: PROF_B,
        }),
      ).toBe(false);
    });
  }

  // Problema: profissional editava produto de outro sem permissão.
  it('editar produto de outro exige edit_others', () => {
    const own = rowsFor({ module: 'produtos', data_scope: 'own', can_view: true, can_edit: true });
    expect(
      canWriteRecord({
        rows: own,
        module: 'produtos',
        action: 'edit',
        ownerProfessionalId: PROF_A,
        myProfessionalId: PROF_A,
      }),
    ).toBe(true);
    expect(
      canWriteRecord({
        rows: own,
        module: 'produtos',
        action: 'edit',
        ownerProfessionalId: PROF_A,
        myProfessionalId: PROF_B,
      }),
    ).toBe(false);
    const others = rowsFor({ module: 'produtos', can_view: true, can_edit_others: true });
    expect(
      canWriteRecord({
        rows: others,
        module: 'produtos',
        action: 'edit',
        ownerProfessionalId: PROF_A,
        myProfessionalId: PROF_B,
      }),
    ).toBe(true);
  });

  it('excluir registro de outro exige delete_others; Admin sempre pode', () => {
    const own = rowsFor({ module: 'servicos', can_view: true, can_delete: true });
    expect(
      canWriteRecord({
        rows: own,
        module: 'servicos',
        action: 'delete',
        ownerProfessionalId: PROF_A,
        myProfessionalId: PROF_B,
      }),
    ).toBe(false);
    expect(
      canWriteRecord({
        rows: own,
        module: 'servicos',
        action: 'delete',
        ownerProfessionalId: PROF_A,
        myProfessionalId: PROF_B,
        isAdmin: true,
      }),
    ).toBe(true);
  });
});

describe('regressão: ocultação de valores', () => {
  // Problema: profissional sem "ver valores" via os valores dos relatórios.
  it('view_values é independente de view', () => {
    const rows = rowsFor({ module: 'relatorios', can_view: true, data_scope: 'own' });
    expect(evaluate(rows, 'relatorios', 'view')).toBe(true);
    expect(evaluate(rows, 'relatorios', 'view_values')).toBe(false);
  });

  it('preset profissional não vê valores de relatórios', () => {
    const rows = presetPermissions('professional');
    const rel = rows.find(r => r.module === 'relatorios')!;
    expect(rel.can_view).toBe(true);
    expect(rel.can_view_values).toBe(false);
  });
});

describe('regressão: presets e módulos administrativos', () => {
  // Problema: preset de profissional/recepção abria Configurações e Auditoria.
  for (const preset of ['professional', 'reception', 'financial'] as const) {
    it(`preset ${preset} não acessa configuracoes/auditoria/unidades`, () => {
      const rows = presetPermissions(preset);
      for (const mod of ['configuracoes', 'auditoria', 'unidades'] as const) {
        expect(evaluate(rows, mod, 'view'), `${preset} → ${mod}`).toBe(false);
      }
    });
  }

  it('preset profissional fica restrito aos próprios dados', () => {
    const rows = presetPermissions('professional');
    for (const r of rows) {
      expect(r.data_scope).toBe('own');
      expect(r.can_view_others).toBe(false);
      expect(r.can_edit_others).toBe(false);
      expect(r.can_delete_others).toBe(false);
    }
  });

  it('preset recepção não acessa Financeiro nem exporta', () => {
    const rows = presetPermissions('reception');
    expect(evaluate(rows, 'financeiro', 'view')).toBe(false);
    expect(evaluate(rows, 'clientes', 'export')).toBe(false);
  });

  it('acesso total libera todos os módulos com escopo da clínica', () => {
    const rows = presetPermissions('full');
    for (const r of rows) {
      expect(r.can_view).toBe(true);
      expect(r.data_scope).toBe('all');
    }
  });

  it('a lista de módulos permanece estável (backend usa as mesmas chaves)', () => {
    expect(PERMISSION_MODULES.map(m => m.key)).toEqual([
      'financeiro',
      'clientes',
      'agenda',
      'servicos',
      'produtos',
      'relatorios',
      'documentos',
      'caixa',
      'lembretes',
      'cadastros',
      'configuracoes',
      'auditoria',
      'unidades',
      'salas_compartilhadas',
    ]);
  });
});

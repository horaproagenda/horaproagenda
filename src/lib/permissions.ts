/**
 * Fonte única da verdade das permissões por módulo.
 *
 * As mesmas chaves existem no banco (`public.user_permissions`) e são avaliadas
 * pelas funções `public.perm(module, action)`, `public.can_see_record(...)` e
 * `public.can_write_record(...)` usadas nas policies de RLS. A interface abaixo
 * apenas reflete o que o backend já garante.
 */

export const PERMISSION_MODULES = [
  { key: 'financeiro',          label: 'Financeiro' },
  { key: 'clientes',            label: 'Clientes' },
  { key: 'agenda',              label: 'Agenda' },
  { key: 'servicos',            label: 'Serviços e pacotes' },
  { key: 'produtos',            label: 'Produtos' },
  { key: 'relatorios',          label: 'Relatórios' },
  { key: 'documentos',          label: 'Documentos' },
  { key: 'caixa',               label: 'Caixa' },
  { key: 'lembretes',           label: 'Lembretes' },
  { key: 'cadastros',           label: 'Cadastros' },
  { key: 'configuracoes',       label: 'Sistema / Configurações' },
  { key: 'auditoria',           label: 'Histórico de atividades' },
  { key: 'unidades',            label: 'Unidades' },
  { key: 'salas_compartilhadas',label: 'Salas compartilhadas' },
] as const;

export type PermissionModuleKey = typeof PERMISSION_MODULES[number]['key'];

export const PERMISSION_ACTIONS = [
  { key: 'can_view',          label: 'Visualizar' },
  { key: 'can_create',        label: 'Criar' },
  { key: 'can_edit',          label: 'Editar próprios' },
  { key: 'can_edit_others',   label: 'Editar de outros' },
  { key: 'can_delete',        label: 'Excluir próprios' },
  { key: 'can_delete_others', label: 'Excluir de outros' },
  { key: 'can_export',        label: 'Exportar' },
  { key: 'can_print',         label: 'Imprimir' },
  { key: 'can_view_values',   label: 'Ver valores' },
  { key: 'can_view_others',   label: 'Ver dados de outros' },
  { key: 'can_share',         label: 'Compartilhar' },
] as const;

export type PermissionActionKey = typeof PERMISSION_ACTIONS[number]['key'];

/** Ações aceitas por `public.perm(module, action)`. */
export type PermAction =
  | 'view' | 'create' | 'edit' | 'delete'
  | 'edit_others' | 'delete_others'
  | 'export' | 'print' | 'view_values' | 'view_others' | 'share';

export const DATA_SCOPES = [
  { key: 'own',    label: 'Somente os próprios dados' },
  { key: 'shared', label: 'Próprios + compartilhados' },
  { key: 'unit',   label: 'Toda a unidade' },
  { key: 'all',    label: 'Toda a clínica' },
] as const;

export type DataScope = typeof DATA_SCOPES[number]['key'];

export const DATA_VISIBILITIES = [
  { key: 'private', label: 'Privado (somente eu)' },
  { key: 'shared',  label: 'Compartilhado com autorizados' },
  { key: 'clinic',  label: 'Geral da clínica' },
] as const;

export type DataVisibility = typeof DATA_VISIBILITIES[number]['key'];

export interface PermissionRow {
  module: PermissionModuleKey;
  data_scope: DataScope;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_edit_others: boolean;
  can_delete: boolean;
  can_delete_others: boolean;
  can_export: boolean;
  can_print: boolean;
  can_view_values: boolean;
  can_view_others: boolean;
  can_share: boolean;
}

export function blankRow(module: PermissionModuleKey, all = false): PermissionRow {
  return {
    module,
    data_scope: all ? 'all' : 'own',
    can_view: all,
    can_create: all,
    can_edit: all,
    can_edit_others: all,
    can_delete: all,
    can_delete_others: all,
    can_export: all,
    can_print: all,
    can_view_values: all,
    can_view_others: all,
    can_share: all,
  };
}

/** Módulos exclusivos do Administrador por padrão. */
const ADMIN_ONLY: PermissionModuleKey[] = ['configuracoes', 'auditoria', 'unidades'];

export type PermissionPreset = 'professional' | 'reception' | 'financial' | 'manager' | 'full';

export const PRESET_LABELS: Record<PermissionPreset, string> = {
  professional: 'Profissional (somente seus dados)',
  reception: 'Recepção',
  financial: 'Financeiro',
  manager: 'Gestor',
  full: 'Acesso total',
};

export function presetPermissions(preset: PermissionPreset): PermissionRow[] {
  return PERMISSION_MODULES.map(({ key }) => {
    const row = blankRow(key);
    if (preset === 'full') return blankRow(key, true);

    if (ADMIN_ONLY.includes(key)) return row;

    if (preset === 'manager') {
      return { ...blankRow(key, true), data_scope: 'all' };
    }

    if (preset === 'professional') {
      const own: PermissionModuleKey[] = ['clientes', 'agenda', 'servicos', 'produtos', 'relatorios', 'documentos', 'lembretes'];
      if (!own.includes(key)) return row;
      return {
        ...row,
        data_scope: 'own',
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: true,
        can_print: true,
        can_view_values: key !== 'relatorios',
      };
    }

    if (preset === 'reception') {
      const mods: PermissionModuleKey[] = ['clientes', 'agenda', 'servicos', 'lembretes', 'cadastros', 'documentos'];
      if (!mods.includes(key)) return row;
      return {
        ...row,
        data_scope: 'all',
        can_view: true,
        can_create: true,
        can_edit: true,
        can_view_others: true,
        can_print: true,
      };
    }

    // financial
    const mods: PermissionModuleKey[] = ['financeiro', 'caixa', 'relatorios', 'clientes'];
    if (!mods.includes(key)) return row;
    return {
      ...row,
      data_scope: 'all',
      can_view: true,
      can_create: key !== 'clientes',
      can_edit: key !== 'clientes',
      can_view_values: true,
      can_view_others: true,
      can_export: true,
      can_print: true,
    };
  });
}

/** Normaliza uma linha vinda do banco (colunas podem faltar em dados antigos). */
export function normalizeRow(
  module: PermissionModuleKey,
  raw: Partial<PermissionRow> | undefined,
): PermissionRow {
  const base = blankRow(module);
  if (!raw) return { ...base, can_view: true, data_scope: 'shared' };
  return {
    module,
    data_scope: (raw.data_scope as DataScope) ?? 'shared',
    can_view: !!raw.can_view,
    can_create: !!raw.can_create,
    can_edit: !!raw.can_edit,
    can_edit_others: !!raw.can_edit_others,
    can_delete: !!raw.can_delete,
    can_delete_others: !!raw.can_delete_others,
    can_export: !!raw.can_export,
    can_print: !!raw.can_print,
    can_view_values: !!raw.can_view_values,
    can_view_others: !!raw.can_view_others,
    can_share: !!raw.can_share,
  };
}

const ACTION_TO_COLUMN: Record<PermAction, keyof PermissionRow> = {
  view: 'can_view',
  create: 'can_create',
  edit: 'can_edit',
  delete: 'can_delete',
  edit_others: 'can_edit_others',
  delete_others: 'can_delete_others',
  export: 'can_export',
  print: 'can_print',
  view_values: 'can_view_values',
  view_others: 'can_view_others',
  share: 'can_share',
};

/** Avaliação local (espelha `public.perm`). Admin resolve fora daqui. */
export function evaluate(rows: PermissionRow[], module: PermissionModuleKey, action: PermAction): boolean {
  const row = rows.find(r => r.module === module);
  if (!row) return action === 'view';
  return !!row[ACTION_TO_COLUMN[action]];
}

/** Um registro é visível conforme dono/visibilidade/escopo (espelha `can_see_record`). */
export function canSeeRecord(params: {
  rows: PermissionRow[];
  module: PermissionModuleKey;
  ownerProfessionalId?: string | null;
  visibility?: DataVisibility | null;
  myProfessionalId?: string | null;
  isAdmin?: boolean;
}): boolean {
  const { rows, module, ownerProfessionalId, visibility, myProfessionalId, isAdmin } = params;
  if (isAdmin) return true;
  if (!ownerProfessionalId) return true;
  if (myProfessionalId && myProfessionalId === ownerProfessionalId) return true;

  const scope = rows.find(r => r.module === module)?.data_scope ?? 'shared';
  const viewOthers = evaluate(rows, module, 'view_others');
  switch (visibility ?? 'clinic') {
    case 'private':
      return false;
    case 'shared':
      return scope !== 'own' || viewOthers;
    default:
      return scope !== 'own' || viewOthers;
  }
}

/** Pode editar/excluir conforme dono (espelha `can_write_record`). */
export function canWriteRecord(params: {
  rows: PermissionRow[];
  module: PermissionModuleKey;
  action: 'edit' | 'delete';
  ownerProfessionalId?: string | null;
  myProfessionalId?: string | null;
  isAdmin?: boolean;
}): boolean {
  const { rows, module, action, ownerProfessionalId, myProfessionalId, isAdmin } = params;
  if (isAdmin) return true;
  const isMine = !!ownerProfessionalId && !!myProfessionalId && ownerProfessionalId === myProfessionalId;
  return evaluate(rows, module, isMine ? action : (`${action}_others` as PermAction));
}

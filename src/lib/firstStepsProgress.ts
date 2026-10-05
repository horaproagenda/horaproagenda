// Regras do guia "Primeiros passos": só conta o que a própria pessoa fez.
// Itens que já vêm prontos na conta nova (formas de pagamento, horário padrão,
// modelos) NÃO marcam o passo.

export interface Row { created_at?: string | null; updated_at?: string | null }

/** Margem para separar o que veio pronto do que foi criado ou editado depois. */
const SEED_WINDOW_MS = 10 * 60 * 1000;

const t = (v?: string | null) => (v ? new Date(v).getTime() : NaN);

/** Verdadeiro quando o registro foi criado ou editado pela pessoa depois da criação da conta. */
export function isUserTouched(row: Row, accountCreatedAt?: string | null): boolean {
  const c = t(row.created_at);
  const u = t(row.updated_at);
  const base = t(accountCreatedAt);
  if (!Number.isNaN(u) && !Number.isNaN(c) && u - c > 60_000) return true;
  if (!Number.isNaN(base) && !Number.isNaN(c)) return c - base > SEED_WINDOW_MS;
  return false;
}

/** Modelos que toda conta nova recebe automaticamente no cadastro. */
export const DEFAULT_DOCUMENT_TITLES = [
  'anamnese básica',
  'termo de consentimento',
  'contrato de prestação de serviços',
];

const norm = (s?: string | null) => (s || '').trim().toLowerCase();

/** Documento conta só se for próprio, ou se for um modelo padrão que a pessoa editou. */
export function isUserDocument(row: Row & { title?: string | null }, accountCreatedAt?: string | null): boolean {
  if (DEFAULT_DOCUMENT_TITLES.includes(norm(row.title))) {
    const c = t(row.created_at);
    const u = t(row.updated_at);
    return !Number.isNaN(c) && !Number.isNaN(u) && u - c > 60_000;
  }
  return isUserTouched(row, accountCreatedAt);
}

export interface ProgressInput {
  accountCreatedAt?: string | null;
  settings?: (Row & { opening_time?: string | null; closing_time?: string | null }) | null;
  /** Horário próprio salvo em "Minhas preferências". */
  prefs?: { opening_time?: string | null; closing_time?: string | null }[];
  services: number;
  /** Salas + equipamentos cadastrados. */
  resources?: number;
  clients: number;
  paymentMethods: Row[];
  documents: (Row & { title?: string | null })[];
}

export function computeFirstSteps(i: ProgressInput): Record<string, boolean> {
  const ownHours = (i.prefs || []).some((p) => !!p.opening_time || !!p.closing_time);
  const s = i.settings;
  const settingsHours =
    !!s &&
    !!s.updated_at &&
    t(s.updated_at) - t(s.created_at) > 60_000 &&
    (s.opening_time?.slice(0, 5) !== '08:00' || s.closing_time?.slice(0, 5) !== '20:00');
  return {
    hours: ownHours || settingsHours,
    resources: (i.resources ?? 0) > 0,
    services: i.services > 0,
    clients: i.clients > 0,
    payments: i.paymentMethods.some((r) => isUserTouched(r, i.accountCreatedAt)),
    documents: i.documents.some((r) => isUserDocument(r, i.accountCreatedAt)),
  };
}

/**
 * Listas que alimentam o guia. Qualquer atualização em uma delas (salvar,
 * editar, excluir — nesta tela, em outra aba ou em outro aparelho) faz o guia
 * conferir de novo. Ponto único: não é preciso lembrar disso em cada tela.
 */
export const FIRST_STEPS_SOURCE_KEYS = [
  'business-settings', 'business_settings', 'professional-preferences', 'effective-business-settings',
  'rooms', 'equipment',
  'services', 'package_templates', 'package_template_steps',
  'payment_methods',
  'document_templates',
  'clients',
] as const;

export const FIRST_STEPS_QUERY_KEY = 'first-steps-progress';

export function isFirstStepsSource(key: unknown): boolean {
  return typeof key === 'string' && (FIRST_STEPS_SOURCE_KEYS as readonly string[]).includes(key);
}

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

export interface ProgressInput {
  accountCreatedAt?: string | null;
  settings?: (Row & { opening_time?: string | null; closing_time?: string | null }) | null;
  /** Horário próprio salvo em "Minhas preferências". */
  prefs?: { opening_time?: string | null; closing_time?: string | null }[];
  services: number;
  clients: number;
  paymentMethods: Row[];
  documents: Row[];
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
    services: i.services > 0,
    clients: i.clients > 0,
    payments: i.paymentMethods.some((r) => isUserTouched(r, i.accountCreatedAt)),
    documents: i.documents.some((r) => isUserTouched(r, i.accountCreatedAt)),
  };
}

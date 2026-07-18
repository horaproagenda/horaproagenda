// Planos do Hora Pro.
// Modelo simplificado: existe UM produto no Stripe (Hora Pro - Assinatura) com
// um price recorrente por ciclo. A cobrança é `quantity × price do ciclo`,
// onde `quantity` é o número de usuários (seats) escolhido pelo cliente.
export interface Plan {
  seats: number;
  priceBRL: number; // preço mensal em reais (referência para exibição)
  name: string;
}

// Preço base por usuário/mês (R$). O total mensal do plano é seats × PER_SEAT_MONTHLY_BRL.
export const PER_SEAT_MONTHLY_BRL = 110;

export const PLANS: Plan[] = [
  { seats: 1,  priceBRL: 1  * PER_SEAT_MONTHLY_BRL, name: '1 usuário'   },
  { seats: 3,  priceBRL: 3  * PER_SEAT_MONTHLY_BRL, name: '3 usuários'  },
  { seats: 6,  priceBRL: 6  * PER_SEAT_MONTHLY_BRL, name: '6 usuários'  },
  { seats: 10, priceBRL: 10 * PER_SEAT_MONTHLY_BRL, name: '10 usuários' },
  { seats: 15, priceBRL: 15 * PER_SEAT_MONTHLY_BRL, name: '15 usuários' },
  { seats: 20, priceBRL: 20 * PER_SEAT_MONTHLY_BRL, name: '20 usuários' },
  { seats: 25, priceBRL: 25 * PER_SEAT_MONTHLY_BRL, name: '25 usuários' },
  { seats: 30, priceBRL: 30 * PER_SEAT_MONTHLY_BRL, name: '30 usuários' },
];

/** Seats permitidos no checkout — usado como validação no edge function. */
export const ALLOWED_SEATS: number[] = PLANS.map(p => p.seats);

export const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Períodos de cobrança recorrente disponíveis: mensal, semestral e anual.
// Descontos calibrados para que 1 usuário pague exatamente:
//   Mensal:    R$ 110,00 / mês
//   Semestral: R$ 645,62 a cada 6 meses  (economia ~R$ 14,38)
//   Anual:     R$ 1.276,86 / ano         (economia ~R$ 43,14)
export interface BillingPeriod {
  months: number;
  discount: number; // 0..1 — aplicado ao total do ciclo (seats × mensal × meses)
  label: string;
  badge?: string;
}

export const BILLING_PERIODS: BillingPeriod[] = [
  { months: 1,  discount: 0,                    label: 'Mensal' },
  { months: 6,  discount: 1 - 645.62 / 660,     label: 'Semestral', badge: '-2%' },
  { months: 12, discount: 1 - 1276.86 / 1320,   label: 'Anual',     badge: '-3%' },
];

// Stripe price IDs por ciclo (produto Hora Pro - Assinatura, preço por 1 usuário).
// Conta Stripe: acct_1Tue8WDNBKGVlEDv (Hora Pro Agenda, modo live).
// A quantidade cobrada no checkout é `seats`.
export const BILLING_PRICE_IDS: Record<number, string> = {
  1:  'price_1Tuf4ZDNBKGVlEDvehLJcVJX', // R$ 110,00 / mês
  6:  'price_1Tuf5CDNBKGVlEDvaRVN4VqB', // R$ 645,62 / semestre
  12: 'price_1Tuf5XDNBKGVlEDvwng5c269', // R$ 1.276,86 / ano
};


/** Calcula total para N meses aplicando o desconto correspondente. */
export function periodTotal(monthlyPriceBRL: number, months: number): number {
  const p = BILLING_PERIODS.find(b => b.months === months) ?? BILLING_PERIODS[0];
  return Math.round(monthlyPriceBRL * months * (1 - p.discount) * 100) / 100;
}


export function suggestPlan(seatsNeeded: number): Plan {
  return PLANS.find(p => p.seats >= seatsNeeded) ?? PLANS[PLANS.length - 1];
}

export const APP_MODULES = [
  { key: 'agenda',        label: 'Agenda' },
  { key: 'clientes',      label: 'Clientes' },
  { key: 'financeiro',    label: 'Financeiro' },
  { key: 'caixa',         label: 'Caixa' },
  { key: 'produtos',      label: 'Produtos' },
  { key: 'servicos',      label: 'Serviços' },
  { key: 'cadastros',     label: 'Cadastros' },
  { key: 'relatorios',    label: 'Relatórios' },
  { key: 'documentos',    label: 'Documentos' },
  { key: 'lembretes',     label: 'Lembretes' },
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'auditoria',     label: 'Auditoria' },
  { key: 'assinatura',    label: 'Assinatura' },
] as const;

export type AppModuleKey = typeof APP_MODULES[number]['key'];
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

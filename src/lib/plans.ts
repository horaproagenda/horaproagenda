// Planos do Hora Pro.
// Modelo simplificado: existe UM produto no Stripe (Hora Pro - Assinatura) com
// um price recorrente por ciclo. A cobrança é `quantity × price do ciclo`,
// onde `quantity` é o número de usuários (seats) escolhido pelo cliente.
//
// IMPORTANTE — FONTE ÚNICA DA VERDADE DOS VALORES: o STRIPE.
// Os valores abaixo são apenas FALLBACK (últimos valores conhecidos) usados
// enquanto o app carrega ou se o Stripe estiver indisponível. Os preços reais
// são resolvidos pelas lookup keys do Stripe e expostos por `usePricing()`
// (frontend) e `_shared/pricing.ts` (edge functions).
// Para mudar o preço: crie um preço novo no Stripe transferindo a lookup key.
export interface Plan {
  seats: number;
  priceBRL: number; // preço mensal em reais (referência para exibição)
  name: string;
}

/** Lookup keys fixas no Stripe, por ciclo (meses). */
export const PRICE_LOOKUP_KEYS: Record<number, string> = {
  1: 'horapro_seat_monthly',
  6: 'horapro_seat_semiannual',
  12: 'horapro_seat_annual',
};

/** FALLBACK — valor por usuário em cada ciclo (R$). Real vem do Stripe. */
export const FALLBACK_PER_SEAT_CYCLE_BRL: Record<number, number> = {
  1: 110,
  6: 645.62,
  12: 1276.86,
};

/** FALLBACK do preço base por usuário/mês (R$). Real vem do Stripe. */
export const PER_SEAT_MONTHLY_BRL = FALLBACK_PER_SEAT_CYCLE_BRL[1];

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
// Os descontos são recalculados em tempo real por `usePricing()` a partir dos
// preços reais do Stripe; os valores abaixo são apenas fallback de exibição.
export interface BillingPeriod {
  months: number;
  discount: number; // 0..1 — aplicado ao total do ciclo (seats × mensal × meses)
  label: string;
  badge?: string;
}

export const BILLING_PERIODS: BillingPeriod[] = [
  { months: 1,  discount: 0, label: 'Mensal' },
  {
    months: 6,
    discount: 1 - FALLBACK_PER_SEAT_CYCLE_BRL[6] / (FALLBACK_PER_SEAT_CYCLE_BRL[1] * 6),
    label: 'Semestral',
  },
  {
    months: 12,
    discount: 1 - FALLBACK_PER_SEAT_CYCLE_BRL[12] / (FALLBACK_PER_SEAT_CYCLE_BRL[1] * 12),
    label: 'Anual',
  },
];



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

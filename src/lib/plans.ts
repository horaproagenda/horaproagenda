// Planos mensais do Hora Pro.
// Cada plano define o número máximo de usuários ativos (admin + colaboradores).
export interface Plan {
  productId: string;
  priceId: string;
  seats: number;
  priceBRL: number; // preço mensal em reais
  name: string;
}

// Preço base por usuário/mês (R$). O total do plano é seats × PER_SEAT_MONTHLY_BRL.
export const PER_SEAT_MONTHLY_BRL = 110;

export const PLANS: Plan[] = [
  { productId: 'prod_UdyKWqSfnyVzne', priceId: 'price_1TegO6DgjrAVrKo6qmm4QTAq', seats: 1,  priceBRL: 1  * PER_SEAT_MONTHLY_BRL, name: '1 usuário' },
  { productId: 'prod_UdyLMg0kyRjuD4', priceId: 'price_1TegOYDgjrAVrKo6SWKhm34E', seats: 3,  priceBRL: 3  * PER_SEAT_MONTHLY_BRL, name: '3 usuários' },
  { productId: 'prod_UdyLfa56HjYEki', priceId: 'price_1TegOrDgjrAVrKo6Fvsq1Vku', seats: 6,  priceBRL: 6  * PER_SEAT_MONTHLY_BRL, name: '6 usuários' },
  { productId: 'prod_UdyLncotTRCD59', priceId: 'price_1TegPCDgjrAVrKo6a1AsVWED', seats: 10, priceBRL: 10 * PER_SEAT_MONTHLY_BRL, name: '10 usuários' },
  { productId: 'prod_UdyNFZJ4PBvLLT', priceId: 'price_1TegQXDgjrAVrKo68iqKHYkx', seats: 15, priceBRL: 15 * PER_SEAT_MONTHLY_BRL, name: '15 usuários' },
  { productId: 'prod_UdyO4ihw5Sa6Nf', priceId: 'price_1TegRlDgjrAVrKo6pgIqgceO', seats: 20, priceBRL: 20 * PER_SEAT_MONTHLY_BRL, name: '20 usuários' },
  { productId: 'prod_UdyPoKIa4khU4r', priceId: 'price_1TegSSDgjrAVrKo60IQOSOMn', seats: 25, priceBRL: 25 * PER_SEAT_MONTHLY_BRL, name: '25 usuários' },
  { productId: 'prod_UdyPbVSxOACQ61', priceId: 'price_1TegSvDgjrAVrKo6d1LDLKgI', seats: 30, priceBRL: 30 * PER_SEAT_MONTHLY_BRL, name: '30 usuários' },
];

export const PRODUCT_TO_SEATS: Record<string, number> = Object.fromEntries(
  PLANS.map(p => [p.productId, p.seats])
);

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

// Stripe price IDs por ciclo (produto Hora Pro, preço por 1 usuário).
// A quantidade cobrada no checkout é `seats`.
export const BILLING_PRICE_IDS: Record<number, string> = {
  1:  'price_1TuHspDgjrAVrKo6SqvNvXCD', // R$ 110,00 / mês
  6:  'price_1TuHtBDgjrAVrKo6tBrtH47r', // R$ 645,62 / semestre
  12: 'price_1TuHtUDgjrAVrKo6gUCWH4pH', // R$ 1.276,86 / ano
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

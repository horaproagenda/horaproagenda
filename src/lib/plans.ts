// Planos mensais do Hora Pro.
// Cada plano define o número máximo de usuários ativos (admin + colaboradores).
export interface Plan {
  productId: string;
  priceId: string;
  seats: number;
  priceBRL: number; // preço mensal em reais
  name: string;
}

export const PLANS: Plan[] = [
  { productId: 'prod_UdyKWqSfnyVzne', priceId: 'price_1TegO6DgjrAVrKo6qmm4QTAq', seats: 1,  priceBRL: 59.90,   name: '1 usuário' },
  { productId: 'prod_UdyLMg0kyRjuD4', priceId: 'price_1TegOYDgjrAVrKo6SWKhm34E', seats: 3,  priceBRL: 129.90,  name: '3 usuários' },
  { productId: 'prod_UdyLfa56HjYEki', priceId: 'price_1TegOrDgjrAVrKo6Fvsq1Vku', seats: 6,  priceBRL: 259.80,  name: '6 usuários' },
  { productId: 'prod_UdyLncotTRCD59', priceId: 'price_1TegPCDgjrAVrKo6a1AsVWED', seats: 10, priceBRL: 433.30,  name: '10 usuários' },
  { productId: 'prod_UdyNFZJ4PBvLLT', priceId: 'price_1TegQXDgjrAVrKo68iqKHYkx', seats: 15, priceBRL: 649.50,  name: '15 usuários' },
  { productId: 'prod_UdyO4ihw5Sa6Nf', priceId: 'price_1TegRlDgjrAVrKo6pgIqgceO', seats: 20, priceBRL: 866.00,  name: '20 usuários' },
  { productId: 'prod_UdyPoKIa4khU4r', priceId: 'price_1TegSSDgjrAVrKo60IQOSOMn', seats: 25, priceBRL: 1082.50, name: '25 usuários' },
  { productId: 'prod_UdyPbVSxOACQ61', priceId: 'price_1TegSvDgjrAVrKo6d1LDLKgI', seats: 30, priceBRL: 1299.00, name: '30 usuários' },
];

export const PRODUCT_TO_SEATS: Record<string, number> = Object.fromEntries(
  PLANS.map(p => [p.productId, p.seats])
);

export const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Períodos de pagamento antecipado e respectivos descontos.
export interface BillingPeriod {
  months: number;
  discount: number; // 0..1
  label: string;
  badge?: string;
}

export const BILLING_PERIODS: BillingPeriod[] = [
  { months: 1,  discount: 0,    label: 'Mensal' },
  { months: 3,  discount: 0.02, label: 'Trimestral', badge: '-2%' },
  { months: 6,  discount: 0.03, label: 'Semestral',  badge: '-3%' },
  { months: 12, discount: 0.05, label: 'Anual',      badge: '-5%' },
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

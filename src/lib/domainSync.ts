import type { QueryClient } from '@tanstack/react-query';

/**
 * Mapa ÚNICO de dependências entre telas. Toda alteração (criar, editar,
 * apagar, baixar pagamento) chama `syncDomains` com os domínios afetados,
 * e todas as telas que mostram aqueles dados (Agenda, Clientes, Perfil do
 * Cliente, Caixa, Financeiro, Produtos, Serviços) são atualizadas juntas.
 * Somente telas abertas refazem a busca; as demais revalidam ao abrir.
 */
export const DOMAIN_KEYS = {
  agenda: [
    'appointments', 'client-appointments', 'package_appointments', 'package_details',
    'recurring_appointments', 'dashboard_stats', 'dashboard-stats',
  ],
  clients: ['clients', 'client', 'client_credits', 'clients_credits', 'client_services'],
  packages: ['service_packages', 'client_packages', 'client_packages_with_counts', 'package_appointments'],
  finance: [
    'financial_entries', 'single_sales', 'client-sales', 'package-sales-financial',
    'boleto_installments', 'boleto_installments_all', 'fin_dashboard', 'dashboard_stats',
  ],
  cash: ['cash_transactions', 'cash_registers', 'cash_register_entries'],
  products: ['products', 'product_purchases', 'product_usage_records', 'product_daily_consumption'],
} as const;

export type Domain = keyof typeof DOMAIN_KEYS;

/** Atalhos: o que cada tipo de ação impacta. */
export const ACTION_DOMAINS: Record<string, Domain[]> = {
  appointment: ['agenda', 'clients', 'packages'],
  payment: ['agenda', 'clients', 'packages', 'finance', 'cash'],
  sale: ['finance', 'cash', 'clients', 'packages', 'agenda', 'products'],
  financialEntry: ['finance', 'cash', 'clients'],
  cash: ['cash', 'finance'],
  product: ['products', 'finance', 'cash'],
};

export function keysForDomains(domains: Domain[]): string[] {
  return Array.from(new Set(domains.flatMap((d) => DOMAIN_KEYS[d])));
}

export function syncDomains(queryClient: QueryClient, domains: Domain[]) {
  for (const key of keysForDomains(domains)) {
    queryClient.invalidateQueries({ queryKey: [key], refetchType: 'active' });
  }
}

export function syncAfter(queryClient: QueryClient, action: keyof typeof ACTION_DOMAINS) {
  syncDomains(queryClient, ACTION_DOMAINS[action]);
}

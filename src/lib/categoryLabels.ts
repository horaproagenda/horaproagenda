// Mapeia categorias técnicas (cash_transactions.category e similares)
// para nomes amigáveis em PT-BR usados no Extrato e relatórios financeiros.

const CATEGORY_LABELS: Record<string, string> = {
  sale: 'Venda',
  product_sale: 'Venda de Produto',
  product_purchase: 'Compra de Produto',
  refund: 'Estorno / Devolução',
  package_refund: 'Devolução de Pacote',
  change: 'Troco',
  discount: 'Desconto',
  client_credit: 'Crédito do Cliente',
  commission: 'Comissão',
  despesa: 'Despesa',
  expense: 'Despesa',
  income: 'Receita',
  payment: 'Pagamento',
  installment: 'Parcela',
  boleto: 'Boleto',
  fee: 'Taxa',
  card_fee: 'Taxa de Cartão',
  withdrawal: 'Sangria',
  deposit: 'Suprimento',
  opening: 'Abertura de Caixa',
  closing: 'Fechamento de Caixa',
  single_sale: 'Venda Avulsa',
  package: 'Pacote',
  service: 'Serviço',
  product: 'Produto',
};

export function formatCategoryLabel(category?: string | null): string {
  if (!category) return '-';
  const key = String(category).toLowerCase().trim();
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  // Capitaliza palavras desconhecidas, substituindo _ por espaço
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

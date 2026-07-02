/**
 * Tradução defensiva de chaves cruas de forma de pagamento
 * para nomes exibíveis em pt-BR (CSV/PDF/UI).
 *
 * A app tem tanto formas de pagamento cadastradas em banco (com `name` já
 * legível) quanto chaves internas legadas (`credit_card`, `pix`, `boleto`,
 * `client_credit`...). Quando um relatório mistura as duas fontes, chaves
 * cruas vazam para o PDF como "nomenclatura de programação".
 *
 * Uso: `paymentMethodLabel(raw)` — devolve o nome legível quando a chave é
 * conhecida; caso contrário devolve o próprio valor (que costuma já ser um
 * nome vindo do banco).
 */

const MAP: Record<string, string> = {
  cash: 'Dinheiro',
  dinheiro: 'Dinheiro',
  money: 'Dinheiro',
  especie: 'Dinheiro',
  'espécie': 'Dinheiro',

  pix: 'PIX',
  transfer: 'Transferência',
  transferencia: 'Transferência',
  'transferência': 'Transferência',
  ted: 'Transferência (TED)',
  doc: 'Transferência (DOC)',

  credit: 'Cartão de Crédito',
  credit_card: 'Cartão de Crédito',
  creditcard: 'Cartão de Crédito',
  cartao_credito: 'Cartão de Crédito',
  'cartão_crédito': 'Cartão de Crédito',
  cartao_de_credito: 'Cartão de Crédito',

  debit: 'Cartão de Débito',
  debit_card: 'Cartão de Débito',
  debitcard: 'Cartão de Débito',
  cartao_debito: 'Cartão de Débito',
  'cartão_débito': 'Cartão de Débito',
  cartao_de_debito: 'Cartão de Débito',

  boleto: 'Boleto',
  boleto_bancario: 'Boleto',
  'boleto_bancário': 'Boleto',
  slip: 'Boleto',

  check: 'Cheque',
  cheque: 'Cheque',

  voucher: 'Voucher',
  ticket: 'Voucher',

  client_credit: 'Crédito do cliente',
  credito_cliente: 'Crédito do cliente',
  'crédito_cliente': 'Crédito do cliente',
  saldo_cliente: 'Crédito do cliente',
  wallet: 'Crédito do cliente',

  package: 'Pacote',
  pacote: 'Pacote',
  package_session: 'Sessão de pacote',

  pending: 'Pendente',
  none: 'Sem pagamento',
  na: 'Sem pagamento',
  'n/a': 'Sem pagamento',
};

export function paymentMethodLabel(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '-';
  const value = String(raw).trim();
  if (!value) return '-';
  const key = value
    .toLowerCase()
    .normalize('NFD')
    // remove diacríticos para o lookup, mas mantemos versões acentuadas
    // no MAP para casos em que o campo já vem normalizado.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  if (MAP[key]) return MAP[key];
  if (MAP[value.toLowerCase()]) return MAP[value.toLowerCase()];
  // Já é um nome legível vindo do banco (ex.: "Cartão Visa Crédito").
  return value;
}

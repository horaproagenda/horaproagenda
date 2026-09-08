/**
 * Regras puras do fluxo de estoque de produtos.
 *
 * Centraliza duas contas que estavam espalhadas na UI e causavam erros:
 * 1) Como o estoque total muda quando uma nova compra é registrada.
 * 2) Quanto deve ser descontado do estoque ao encerrar um ciclo de uso.
 */

export interface PurchaseStockInput {
  /** Estoque total atual do produto, antes da compra. */
  currentStock: number;
  /** Quantidade comprada agora (mesma unidade do estoque). */
  purchaseQuantity: number;
}

/**
 * Uma compra SEMPRE soma ao estoque total. Nunca substitui o saldo remanescente,
 * senão a quantidade que ainda não foi usada desaparece do controle.
 */
export function resolveStockAfterPurchase({ currentStock, purchaseQuantity }: PurchaseStockInput): number {
  const stock = Number(currentStock) || 0;
  const qty = Number(purchaseQuantity) || 0;
  return Math.max(0, stock + Math.max(0, qty));
}

export interface CycleDeductionInput {
  /** Estoque total antes de encerrar o ciclo. */
  stockBefore: number;
  /** Quantidade colocada em uso no ciclo (ex.: 100 de 600). 0/null quando não informada. */
  cycleQuantity?: number | null;
  /** Baixa somada dos vínculos com recipiente (modo estimado). */
  estimatedDeduction?: number;
  /** Baixa somada dos vínculos com quantidade exata por atendimento. */
  exactDeduction?: number;
}

/**
 * Quantidade a descontar do estoque total ao encerrar o ciclo.
 *
 * Ordem de prioridade:
 * 1. Quantidade em uso informada no início do ciclo (fonte oficial).
 * 2. Vínculos com serviços/pacotes (recipiente + quantidade exata).
 *
 * Não existe mais nenhum caminho de emergência que consuma a compra inteira ou
 * todo o estoque: sem quantidade informada e sem vínculos, nada é descontado.
 * O resultado é sempre limitado ao estoque disponível e nunca negativo.
 */
export function resolveCycleDeduction(input: CycleDeductionInput): number {
  const stockBefore = Math.max(0, Number(input.stockBefore) || 0);
  const clamp = (v: number) => Math.max(0, Math.min(stockBefore, Number(v) || 0));

  const cycleQuantity = Number(input.cycleQuantity) || 0;
  if (cycleQuantity > 0) return clamp(cycleQuantity);

  const linked = (Number(input.estimatedDeduction) || 0) + (Number(input.exactDeduction) || 0);
  if (linked > 0) return clamp(linked);

  return 0;
}


/** Estoque restante após encerrar o ciclo. */
export function resolveStockAfterCycle(stockBefore: number, deduction: number): number {
  return Math.max(0, (Number(stockBefore) || 0) - (Number(deduction) || 0));
}

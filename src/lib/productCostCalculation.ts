/**
 * Product Cost Calculation
 *
 * Cálculo unificado e correto do custo de produto por uso/aplicação,
 * considerando o método de rastreio (exact vs estimated) e a conversão
 * entre unidades de estoque e do recipiente (ml↔l, g↔kg).
 *
 * Esta é a fonte única da verdade tanto para:
 *  - Precificação de serviços/pacotes (PrecificacaoServicos)
 *  - Cálculo do custo médio por aplicação ao cancelar/devolver pacote
 *  - Relatórios de custo de material
 */

import { convertQuantity } from './productStock';

export interface ProductLink {
  product_id: string;
  quantity_per_use: number;
  tracking_method?: 'exact' | 'estimated' | string | null;
  container_amount?: number | null;
  container_unit?: string | null;
  estimated_appointments?: number | null;
  product?: {
    unit_price?: number | null;
    total_price?: number | null;
    quantity_purchased?: number | null;
    unit?: string | null;
  } | null;
}

/**
 * Calcula o custo monetário de UMA aplicação para um vínculo serviço/pacote→produto.
 *
 * Regras:
 * - Modo `exact`: quantity_per_use está em `stock unit` (mesma do produto).
 *   custo = quantity_per_use * preço_por_unidade_de_estoque
 *
 * - Modo `estimated`: o profissional informa um recipiente (ex.: 100ml) que
 *   rende N atendimentos. O consumo real por uso é container_amount/N,
 *   convertido para unidade de estoque, multiplicado pelo preço por unidade
 *   de estoque do produto. Se faltar dado, cai para o modo exact.
 */
export function calculateProductLinkCostPerUse(link: ProductLink): number {
  const product = link.product;
  if (!product) return 0;

  const stockUnit = product.unit || 'un';
  // Preço por unidade de estoque (ex.: por ml, por g, por un).
  // Damos preferência a total_price/quantity_purchased pois unit_price
  // pode ter sido salvo como preço total — quando ambos divergem usamos
  // o cálculo mais seguro.
  const totalPrice = Number(product.total_price || 0);
  const qtyPurchased = Number(product.quantity_purchased || 0);
  const fromTotal = qtyPurchased > 0 ? totalPrice / qtyPurchased : 0;
  const unitPriceField = Number(product.unit_price || 0);
  const pricePerStockUnit = fromTotal > 0 ? fromTotal : unitPriceField;

  if (pricePerStockUnit <= 0) return 0;

  const tracking = link.tracking_method || 'exact';

  if (tracking === 'estimated') {
    const containerAmount = Number(link.container_amount || 0);
    const containerUnit = link.container_unit || stockUnit;
    const estimatedApps = Number(link.estimated_appointments || 0);

    if (containerAmount > 0 && estimatedApps > 0) {
      // Converte o recipiente para a unidade de estoque
      const containerInStock = convertQuantity(containerAmount, containerUnit, stockUnit) ?? containerAmount;
      const consumptionPerUse = containerInStock / estimatedApps;
      return consumptionPerUse * pricePerStockUnit;
    }
    // Sem dados de estimativa, cai para exact
  }

  // Exact mode (ou fallback): quantity_per_use já está na unidade de estoque
  const qty = Number(link.quantity_per_use || 0);
  return qty * pricePerStockUnit;
}

/**
 * Soma o custo de UMA aplicação considerando todos os produtos vinculados
 * a um serviço (ou template de pacote — uma sessão).
 */
export function calculateTotalCostPerUse(links: ProductLink[]): number {
  return links.reduce((sum, link) => sum + calculateProductLinkCostPerUse(link), 0);
}

/**
 * Custo total de material para um pacote inteiro = custo por sessão × total de sessões.
 */
export function calculatePackageMaterialCost(links: ProductLink[], totalSessions: number): number {
  return calculateTotalCostPerUse(links) * Math.max(0, totalSessions || 0);
}

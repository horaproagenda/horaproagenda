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
export type ProductCostIssue = 'no_product' | 'no_price' | 'missing_estimate' | 'no_quantity' | null;

export interface ProductLinkCostDetail {
  cost: number;
  pricePerStockUnit: number;
  quantityPerUse: number;
  stockUnit: string;
  issue: ProductCostIssue;
}

/** Preço por unidade de estoque: compra mais recente > total/quantidade do cadastro > unit_price. */
export function resolvePricePerStockUnit(
  product: NonNullable<ProductLink['product']>,
  latestPurchaseUnitPrice?: number | null,
): number {
  const latest = Number(latestPurchaseUnitPrice || 0);
  if (latest > 0) return latest;
  const totalPrice = Number(product.total_price || 0);
  const qtyPurchased = Number(product.quantity_purchased || 0);
  const fromTotal = qtyPurchased > 0 ? totalPrice / qtyPurchased : 0;
  if (fromTotal > 0) return fromTotal;
  return Number(product.unit_price || 0);
}

export function getProductLinkCostDetail(
  link: ProductLink,
  latestPurchaseUnitPrice?: number | null,
): ProductLinkCostDetail {
  const product = link.product;
  const stockUnit = product?.unit || 'un';
  if (!product) return { cost: 0, pricePerStockUnit: 0, quantityPerUse: 0, stockUnit, issue: 'no_product' };

  const pricePerStockUnit = resolvePricePerStockUnit(product, latestPurchaseUnitPrice);
  const storedQty = Number(link.quantity_per_use || 0);
  let qty = storedQty;

  if ((link.tracking_method || 'exact') === 'estimated') {
    const containerAmount = Number(link.container_amount || 0);
    const estimatedApps = Number(link.estimated_appointments || 0);
    if (containerAmount > 0 && estimatedApps > 0) {
      const containerInStock = convertQuantity(containerAmount, (link.container_unit || stockUnit) as any, stockUnit as any);
      // Sem conversão possível (ex.: ml → kg), usa a quantidade já salva na unidade de estoque.
      qty = containerInStock !== null ? containerInStock / estimatedApps : storedQty;
    } else if (storedQty <= 0) {
      return { cost: 0, pricePerStockUnit, quantityPerUse: 0, stockUnit, issue: 'missing_estimate' };
    }
  }

  if (qty <= 0) return { cost: 0, pricePerStockUnit, quantityPerUse: 0, stockUnit, issue: 'no_quantity' };
  if (pricePerStockUnit <= 0) return { cost: 0, pricePerStockUnit: 0, quantityPerUse: qty, stockUnit, issue: 'no_price' };
  return { cost: qty * pricePerStockUnit, pricePerStockUnit, quantityPerUse: qty, stockUnit, issue: null };
}

export function calculateProductLinkCostPerUse(link: ProductLink, latestPurchaseUnitPrice?: number | null): number {
  return getProductLinkCostDetail(link, latestPurchaseUnitPrice).cost;
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

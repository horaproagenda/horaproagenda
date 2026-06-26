export type StockUnit = 'un' | 'ml' | 'l' | 'g' | 'kg' | 'other' | string;

// Conversões diretas dentro da mesma família (volume ↔ volume, massa ↔ massa).
const CONVERSIONS: Record<string, Record<string, number>> = {
  l: { ml: 1000 },
  ml: { l: 1 / 1000 },
  kg: { g: 1000 },
  g: { kg: 1 / 1000 },
};

// Pontes volume ↔ massa assumindo densidade ≈ 1 g/ml (água, gel, cremes
// aquosos). Cobre o caso real de comprar 25 kg de gel e usar 500 ml por
// atendimento — a baixa do estoque precisa ser 0,5 kg, não 500 kg.
// fator = (valor em fromUnit) * fator → valor em toUnit.
const CROSS_FAMILY_DENSITY_1: Record<string, Record<string, number>> = {
  ml: { g: 1, kg: 1 / 1000 },
  l: { g: 1000, kg: 1 },
  g: { ml: 1, l: 1 / 1000 },
  kg: { ml: 1000, l: 1 },
};

export function areUnitsCrossFamily(
  fromUnit: StockUnit | null | undefined,
  toUnit: StockUnit | null | undefined,
): boolean {
  if (!fromUnit || !toUnit || fromUnit === toUnit) return false;
  return !!CROSS_FAMILY_DENSITY_1[fromUnit]?.[toUnit];
}

export function convertQuantity(
  value: number,
  fromUnit: StockUnit | null | undefined,
  toUnit: StockUnit | null | undefined,
): number | null {
  if (!Number.isFinite(value)) return null;
  if (!fromUnit || !toUnit) return null;
  if (fromUnit === toUnit) return value;

  const direct = CONVERSIONS[fromUnit]?.[toUnit];
  if (direct !== undefined) return value * direct;

  const cross = CROSS_FAMILY_DENSITY_1[fromUnit]?.[toUnit];
  if (cross !== undefined) return value * cross;

  return null;
}

export function calculateUnitPrice(quantity: number, totalPrice: number): number {
  if (!quantity || quantity <= 0) return 0;
  return totalPrice / quantity;
}

export function calculateTotalPrice(quantity: number, unitPrice: number): number {
  if (!quantity || quantity <= 0) return 0;
  return quantity * unitPrice;
}

export function calculateEstimatedUsagePerAppointment(params: {
  containerAmount: number;
  containerUnit: StockUnit;
  stockUnit: StockUnit;
  estimatedAppointments: number;
}): number {
  const normalizedContainerAmount = convertQuantity(params.containerAmount, params.containerUnit, params.stockUnit) ?? params.containerAmount;
  if (!params.estimatedAppointments || params.estimatedAppointments <= 0) return 0;
  return normalizedContainerAmount / params.estimatedAppointments;
}

export function calculateRemainingAppointments(params: {
  currentStock: number;
  stockUnit: StockUnit;
  trackingMethod: 'exact' | 'estimated';
  quantityPerUse?: number | null;
  containerAmount?: number | null;
  containerUnit?: StockUnit | null;
  estimatedAppointments?: number | null;
}): number | null {
  if (params.currentStock <= 0) return 0;

  if (params.trackingMethod === 'estimated') {
    if (!params.containerAmount || !params.containerUnit || !params.estimatedAppointments || params.estimatedAppointments <= 0) {
      return null;
    }

    const normalizedContainerAmount = convertQuantity(params.containerAmount, params.containerUnit, params.stockUnit) ?? params.containerAmount;
    if (normalizedContainerAmount <= 0) return null;

    return Math.floor((params.currentStock / normalizedContainerAmount) * params.estimatedAppointments);
  }

  if (!params.quantityPerUse || params.quantityPerUse <= 0) {
    return null;
  }

  return Math.floor(params.currentStock / params.quantityPerUse);
}

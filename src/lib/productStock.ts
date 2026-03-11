export type StockUnit = 'un' | 'ml' | 'l' | 'g' | 'kg' | 'other' | string;

const CONVERSIONS: Record<string, Record<string, number>> = {
  l: { ml: 1000 },
  ml: { l: 1 / 1000 },
  kg: { g: 1000 },
  g: { kg: 1 / 1000 },
};

export function convertQuantity(value: number, fromUnit: StockUnit | null | undefined, toUnit: StockUnit | null | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  if (!fromUnit || !toUnit) return null;
  if (fromUnit === toUnit) return value;

  const direct = CONVERSIONS[fromUnit]?.[toUnit];
  if (direct) return value * direct;

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

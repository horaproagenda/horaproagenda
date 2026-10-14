export type UsageState = 'planned' | 'in_use' | 'completed' | 'cancelled';

export function usageDurationDays(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return null;
  return Math.round((last - first) / 86400000) + 1;
}

export function usageClosure(stock: number, quantity: number, appointments: number, alreadyFinished = false) {
  if (!(quantity > 0) || quantity > stock && !alreadyFinished) throw new Error('Quantidade inválida para o estoque.');
  return {
    stockAfter: alreadyFinished ? stock : stock - quantity,
    average: appointments > 0 ? quantity / appointments : null,
  };
}
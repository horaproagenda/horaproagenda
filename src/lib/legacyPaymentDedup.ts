// Deduplication helpers for retroactive ("Histórico antigo") payments.
//
// When a service/package is registered through the "Histórico antigo" dialog we
// persist THREE rows for the very same payment:
//   - `appointments.amount_paid` (the retroactive appointment itself)
//   - `financial_entries` (so it shows up in Financeiro)
//   - `single_sales` (so it shows up in the "Vendas" tab)
//
// The client payment history is built from sales + paid appointments, so
// without dedup the same payment appeared twice. The sale is the source of
// truth; the appointment row must be hidden whenever a matching retroactive
// sale exists.

export const LEGACY_SALE_NOTE = 'Venda retroativa (histórico antigo)';
export const LEGACY_APPOINTMENT_NOTE_PREFIX = '[Histórico]';

const normalizeDate = (value?: string | null): string | null => {
  if (!value) return null;
  return String(value).split('T')[0] || null;
};

const normalizeAmount = (value: unknown): string => (Number(value) || 0).toFixed(2);

export function buildLegacyPaymentKey(params: {
  serviceId?: string | null;
  packageId?: string | null;
  date?: string | null;
  amount: unknown;
}): string | null {
  const date = normalizeDate(params.date);
  const amount = normalizeAmount(params.amount);
  const item = params.packageId || params.serviceId || null;
  if (!date || Number(amount) <= 0) return null;
  return `${item ?? 'none'}|${date}|${amount}`;
}

export interface LegacySaleLike {
  notes?: string | null;
  service_id?: string | null;
  package_id?: string | null;
  paid_at?: string | null;
  sale_date?: string | null;
  final_amount?: number | string | null;
}

/** Keys of all retroactive sales created by the "Histórico antigo" dialog. */
export function buildLegacySaleKeySet(sales: LegacySaleLike[] | null | undefined): Set<string> {
  const keys = new Set<string>();
  (sales || []).forEach((sale) => {
    if (!String(sale?.notes || '').includes(LEGACY_SALE_NOTE)) return;
    const key = buildLegacyPaymentKey({
      serviceId: sale.service_id,
      packageId: sale.package_id,
      date: sale.paid_at || sale.sale_date,
      amount: sale.final_amount,
    });
    if (key) keys.add(key);
  });
  return keys;
}

export function isLegacyRetroactiveAppointment(notes?: string | null): boolean {
  return String(notes || '').startsWith(LEGACY_APPOINTMENT_NOTE_PREFIX);
}

/**
 * True when the retroactive appointment is already represented by a
 * retroactive sale row — in that case the appointment must NOT produce a
 * second payment-history line.
 */
export function hasMatchingLegacySale(
  legacySaleKeys: Set<string>,
  params: { serviceId?: string | null; packageId?: string | null; date?: string | null; amount: unknown }
): boolean {
  const key = buildLegacyPaymentKey(params);
  return !!key && legacySaleKeys.has(key);
}

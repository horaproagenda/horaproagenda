type Cycle = { status: string; stock_quantity?: number | null; appointments_counted: number; appointment_ids?: string[] | null };
type Consumption = { cycle_key?: string | null; service_id: string | null; appointment_id: string | null; quantity_used: number; unit: string; cancelled_at?: string | null };
/** Summarize persisted results, never redistribute stock based on current service links. */
export function productOfficialUsageStats(cycles: Cycle[], consumptions: Consumption[], unit: string, serviceName: (id: string) => string) {
  const completed = cycles.filter(c => c.status === 'completed');
  const totalAppointments = completed.reduce((sum, c) => sum + Number(c.appointments_counted || 0), 0);
  const totalUsed = completed.reduce((sum, c) => sum + Number(c.stock_quantity || 0), 0);
  const groups = new Map<string, { ids: Set<string>; total: number }>();
  for (const row of consumptions) {
    if (row.cancelled_at || !row.cycle_key || !row.service_id || !row.appointment_id) continue;
    const factors: Record<string, [string, number]> = { mg: ['mass', .001], g: ['mass', 1], kg: ['mass', 1000], ml: ['volume', 1], l: ['volume', 1000], un: ['count', 1], other: ['other', 1] };
    const from = factors[row.unit]; const to = factors[unit];
    if (!from || !to || from[0] !== to[0]) continue;
    const group = groups.get(row.service_id) ?? { ids: new Set<string>(), total: 0 };
    group.ids.add(row.appointment_id);
    group.total += Number(row.quantity_used) * from[1] / to[1];
    groups.set(row.service_id, group);
  }
  return {
    totalAppointments, avgPerAppointment: totalAppointments > 0 ? totalUsed / totalAppointments : 0,
    byService: [...groups].map(([id, g]) => ({ service_id: id, service_name: serviceName(id), appointments: g.ids.size, totalQty: g.total, qtyPerUse: g.ids.size ? g.total / g.ids.size : 0 })),
  };
}
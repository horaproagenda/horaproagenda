/** Agrupa lançamentos de ciclo do mesmo dia em uma única linha (só exibição; não altera totais). */
export interface HistoryRow { id: string; when: string; kind: string; label: string; qty: number; count?: number; dateOnly?: boolean }

export function groupCycleHistoryByDay(rows: HistoryRow[]): HistoryRow[] {
  const out: HistoryRow[] = [];
  const groups = new Map<string, HistoryRow>();
  for (const r of rows) {
    if (r.kind !== 'Ciclo de uso') { out.push(r); continue; }
    const day = r.when.slice(0, 10);
    const g = groups.get(day);
    if (g) { g.qty = Math.round((g.qty + r.qty) * 10000) / 10000; g.count = (g.count ?? 1) + 1; }
    else { const n = { ...r, id: `ciclo-${day}`, count: 1, dateOnly: true }; groups.set(day, n); out.push(n); }
  }
  for (const g of groups.values()) {
    g.label = `Consumo do ciclo (${g.count} ${g.count === 1 ? 'atendimento' : 'atendimentos'})`;
  }
  return out;
}

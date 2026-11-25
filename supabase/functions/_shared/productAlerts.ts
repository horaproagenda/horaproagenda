// Regras puras dos avisos de produtos (usadas pelo servidor e pelos testes).
export interface ProductAlertInput {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock_alert: number | null;
  expiry_date: string | null;
  expected_duration_days: number | null;
}
export interface UsageCycle { product_id: string; id: string; status: string; start_date: string | null; end_date: string | null }
export interface ProductAlert { kind: 'stock_out' | 'stock_low' | 'expired' | 'expires_today' | 'expires_soon' | 'in_use_ending'; key: string; title: string; body: string }

export const EXPIRY_SOON_DAYS = 7;
export const IN_USE_ENDING_DAYS = 3;
const DAY = 86_400_000;
const utc = (d: string) => { const [y, m, dd] = d.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, dd); };
const br = (d: string) => d.slice(0, 10).split('-').reverse().join('/');

export function productAlerts(p: ProductAlertInput, cycles: UsageCycle[], today: string): ProductAlert[] {
  const out: ProductAlert[] = [];
  const stock = Number(p.current_stock) || 0;
  const min = Number(p.min_stock_alert) || 0;
  if (stock <= 0) out.push({ kind: 'stock_out', key: `stock_out:${p.id}:${stock}`, title: 'Produto acabou no estoque', body: `${p.name}: estoque zerado. Registre uma nova compra.` });
  else if (min > 0 && stock <= min) out.push({ kind: 'stock_low', key: `stock_low:${p.id}:${stock}`, title: 'Estoque acabando', body: `${p.name}: restam ${stock} ${p.unit} (mínimo ${min}).` });

  if (p.expiry_date) {
    const diff = Math.round((utc(p.expiry_date) - utc(today)) / DAY);
    if (diff < 0) out.push({ kind: 'expired', key: `expired:${p.id}:${p.expiry_date}`, title: 'Produto vencido', body: `${p.name} venceu em ${br(p.expiry_date)}. Descarte o produto.` });
    else if (diff === 0) out.push({ kind: 'expires_today', key: `expires_today:${p.id}:${p.expiry_date}`, title: 'Produto vence hoje', body: `${p.name} vence hoje (${br(p.expiry_date)}).` });
    else if (diff <= EXPIRY_SOON_DAYS) out.push({ kind: 'expires_soon', key: `expires_soon:${p.id}:${p.expiry_date}`, title: 'Produto perto do vencimento', body: `${p.name} vence em ${diff} dia(s), em ${br(p.expiry_date)}.` });
  }

  const mine = cycles.filter(c => c.product_id === p.id);
  const active = mine.find(c => c.status === 'in_use' && c.start_date);
  if (active?.start_date) {
    const done = mine.filter(c => c.status === 'completed' && c.start_date && c.end_date)
      .map(c => Math.max(1, Math.round((utc(c.end_date!) - utc(c.start_date!)) / DAY) + 1));
    const duration = p.expected_duration_days && p.expected_duration_days > 0
      ? p.expected_duration_days
      : done.length ? Math.round(done.reduce((a, b) => a + b, 0) / done.length) : null;
    if (duration) {
      const end = utc(active.start_date) + (duration - 1) * DAY;
      const left = Math.round((end - utc(today)) / DAY);
      if (left <= IN_USE_ENDING_DAYS) {
        const endStr = new Date(end).toISOString().slice(0, 10);
        out.push({ kind: 'in_use_ending', key: `in_use_ending:${active.id}`, title: 'Produto em uso acabando',
          body: left >= 0 ? `${p.name}: o que está em uso deve acabar até ${br(endStr)}.` : `${p.name}: a previsão de término (${br(endStr)}) já passou. Confira e encerre o uso.` });
      }
    }
  }
  return out;
}

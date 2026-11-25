import { describe, it, expect } from 'vitest';
import { productAlerts } from '../../../supabase/functions/_shared/productAlerts';

const base = { id: 'p1', name: 'Luva', unit: 'un', current_stock: 50, min_stock_alert: 10, expiry_date: null, expected_duration_days: null };
const kinds = (p: any, c: any[] = [], t = '2026-11-25') => productAlerts(p, c, t).map(a => a.kind);

describe('avisos de produtos', () => {
  it('estoque zerado e estoque abaixo do mínimo', () => {
    expect(kinds({ ...base, current_stock: 0 })).toEqual(['stock_out']);
    expect(kinds({ ...base, current_stock: 10 })).toEqual(['stock_low']);
    expect(kinds(base)).toEqual([]);
  });
  it('vencido, vence hoje e vence em até 7 dias', () => {
    expect(kinds({ ...base, expiry_date: '2026-11-24' })).toEqual(['expired']);
    expect(kinds({ ...base, expiry_date: '2026-11-25' })).toEqual(['expires_today']);
    expect(kinds({ ...base, expiry_date: '2026-12-02' })).toEqual(['expires_soon']);
    expect(kinds({ ...base, expiry_date: '2026-12-03' })).toEqual([]);
  });
  it('produto em uso acabando pela duração informada (3 dias antes)', () => {
    const c = [{ id: 'c1', product_id: 'p1', status: 'in_use', start_date: '2026-11-01', end_date: null }];
    expect(kinds({ ...base, expected_duration_days: 28 }, c)).toEqual(['in_use_ending']); // termina 28/11
    expect(kinds({ ...base, expected_duration_days: 29 }, c)).toEqual([]); // termina 29/11: 4 dias, ainda não avisa
  });
  it('usa a média dos ciclos concluídos quando não há duração informada', () => {
    const c = [
      { id: 'c0', product_id: 'p1', status: 'completed', start_date: '2026-10-01', end_date: '2026-10-20' },
      { id: 'c1', product_id: 'p1', status: 'in_use', start_date: '2026-11-01', end_date: null },
    ];
    expect(kinds(base, c)).toEqual(['in_use_ending']); // 20 dias -> 20/11 já passou
    expect(kinds(base, c, '2026-11-10')).toEqual([]);
  });
});

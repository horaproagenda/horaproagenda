import { describe, it, expect } from 'vitest';
import { productOfficialUsageStats } from '../productOfficialUsageStats';

describe('consumo oficial persistido', () => {
  it('100 usados e 40 atendimentos registrados resultam em média 2,5', () => {
    expect(productOfficialUsageStats([{ status: 'completed', stock_quantity: 100, appointments_counted: 40 }], [], 'ml', id => id).avgPerAppointment).toBe(2.5);
  });
  it('serviço mantém sua quantidade real sem redistribuição proporcional', () => {
    const rows = [{ cycle_key: 'c', service_id: 's', appointment_id: 'a', quantity_used: 20, unit: 'ml' }];
    const result = productOfficialUsageStats([{ status: 'completed', stock_quantity: 100, appointments_counted: 40 }], rows, 'ml', id => id);
    expect(result.byService[0].totalQty).toBe(20);
  });
  it('cancelado e manual não contam como consumo de ciclo', () => {
    const result = productOfficialUsageStats([], [
      { cycle_key: 'c', service_id: 's', appointment_id: 'a', quantity_used: 20, unit: 'ml', cancelled_at: '2026-10-14' },
      { cycle_key: null, service_id: 's', appointment_id: 'b', quantity_used: 20, unit: 'ml' },
    ], 'ml', id => id);
    expect(result.byService).toEqual([]);
  });
  it('produto sem vínculo (consumo sem serviço) não aparece em consumo por serviço', () => {
    const result = productOfficialUsageStats([{ status: 'completed', stock_quantity: 300, appointments_counted: 21 }], [
      { cycle_key: 'c', service_id: null, appointment_id: 'a', quantity_used: 14.29, unit: 'un' },
    ], 'un', id => id);
    expect(result.byService).toEqual([]);
    expect(result.totalAppointments).toBe(21);
  });
});
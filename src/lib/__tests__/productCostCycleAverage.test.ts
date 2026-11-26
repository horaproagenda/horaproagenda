import { describe, it, expect } from 'vitest';
import { aggregateCycleAverage, getProductLinkCostDetail } from '../productCostCalculation';

const rows = [
  { status: 'completed', total_consumed: 500, appointments_counted: 29, container_unit: 'ml' },
  { status: 'completed', total_consumed: 500, appointments_counted: 10, container_unit: 'ml' },
  { status: 'in_use', total_consumed: null, appointments_counted: 0, container_unit: 'ml' },
];

describe('média dos ciclos na precificação', () => {
  it('soma ciclos encerrados: 1000 ml / 39 atendimentos', () => {
    const avg = aggregateCycleAverage(rows, 'ml')!;
    expect(avg.quantityPerAppointment).toBeCloseTo(1000 / 39, 6);
    expect(avg.cycles).toBe(2);
    expect(avg.appointments).toBe(39);
  });
  it('converte ml para litros', () => {
    expect(aggregateCycleAverage(rows, 'l')!.quantityPerAppointment).toBeCloseTo(1 / 39, 6);
  });
  it('sem ciclo encerrado retorna null', () => {
    expect(aggregateCycleAverage([rows[2]], 'ml')).toBeNull();
  });
  it('vínculo estimado sem rendimento usa a média dos ciclos', () => {
    const avg = aggregateCycleAverage(rows, 'l');
    const d = getProductLinkCostDetail({ product_id: 'p', quantity_per_use: 0, tracking_method: 'estimated', product: { unit: 'l', unit_price: 39 } }, null, avg);
    expect(d.issue).toBeNull();
    expect(d.source).toBe('cycles');
    expect(d.cost).toBeCloseTo(1, 6);
  });
  it('sem ciclos mantém o aviso', () => {
    const d = getProductLinkCostDetail({ product_id: 'p', quantity_per_use: 0, tracking_method: 'estimated', product: { unit: 'l', unit_price: 39 } }, null, null);
    expect(d.issue).toBe('missing_estimate');
  });
});

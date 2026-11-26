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

import { convertQuantityForCost as convertQuantity } from '../productStock';
describe('conversões de medida', () => {
  it('converte entre famílias com densidade 1', () => {
    expect(convertQuantity(500, 'ml', 'kg')).toBeCloseTo(0.5);
    expect(convertQuantity(250, 'g', 'l')).toBeCloseTo(0.25);
    expect(convertQuantity(500, 'ml', 'l')).toBeCloseTo(0.5);
    expect(convertQuantity(1, 'un', 'ml')).toBeNull();
  });
  it('Gel: 500 ml rende 7, R$ 20/kg', () => {
    const d = getProductLinkCostDetail({ product_id: 'g', quantity_per_use: 0, tracking_method: 'estimated', container_amount: 500, container_unit: 'ml', estimated_appointments: 7, product: { unit: 'kg', unit_price: 20 } });
    expect(d.cost).toBeCloseTo((0.5 / 7) * 20, 6);
  });
  it('medida incompatível gera aviso', () => {
    const d = getProductLinkCostDetail({ product_id: 'x', quantity_per_use: 0.5, tracking_method: 'estimated', container_amount: 10, container_unit: 'un', estimated_appointments: 2, product: { unit: 'ml', unit_price: 1 } });
    expect(d.issue).toBe('incompatible_unit');
  });
});

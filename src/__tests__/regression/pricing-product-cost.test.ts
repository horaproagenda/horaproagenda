import { describe, it, expect } from 'vitest';
import { getProductLinkCostDetail } from '@/lib/productCostCalculation';

describe('Precificação: custo de produto por uso', () => {
  it('usa o preço da compra mais recente quando o cadastro está zerado (Álcool 70)', () => {
    const d = getProductLinkCostDetail(
      { product_id: 'a', quantity_per_use: 0.05, tracking_method: 'exact', product: { unit: 'l', total_price: 0, unit_price: 0, quantity_purchased: 5 } },
      8.78,
    );
    expect(d.cost).toBeCloseTo(0.439, 3);
  });

  it('modo estimado sem conversão (ml → kg) usa a quantidade já salva na unidade de estoque (Gel)', () => {
    const d = getProductLinkCostDetail({
      product_id: 'g', quantity_per_use: 0.5, tracking_method: 'estimated', container_amount: 500, container_unit: 'ml', estimated_appointments: 1,
      product: { unit: 'kg', total_price: 270, quantity_purchased: 25, unit_price: 10.8 },
    });
    expect(d.cost).toBeCloseTo(5.4, 2);
  });

  it('modo estimado com conversão ml → l divide o recipiente pelos atendimentos', () => {
    const d = getProductLinkCostDetail({
      product_id: 'x', quantity_per_use: 0, tracking_method: 'estimated', container_amount: 500, container_unit: 'ml', estimated_appointments: 10,
      product: { unit: 'l', total_price: 40, quantity_purchased: 5 },
    });
    expect(d.cost).toBeCloseTo(0.4, 3);
  });

  it('sinaliza quando falta o rendimento do recipiente, em vez de zerar em silêncio', () => {
    const d = getProductLinkCostDetail({
      product_id: 'p', quantity_per_use: 0, tracking_method: 'estimated', container_amount: 1, container_unit: 'un', estimated_appointments: null,
      product: { unit: 'un', total_price: 16, quantity_purchased: 200 },
    });
    expect(d.issue).toBe('missing_estimate');
  });
});

import { describe, expect, it } from 'vitest';
import {
  convertQuantity,
  calculateEstimatedUsagePerAppointment,
  calculateRemainingAppointments,
} from '../productStock';
import { calculateProductLinkCostPerUse, calculateTotalCostPerUse } from '../productCostCalculation';

/**
 * Testes automatizados que espelham a lógica do gatilho SQL
 * `decrease_product_stock_on_appointment_complete`:
 *  - Conversão de unidades (mesma família e cross-family densidade 1)
 *  - Cálculo exato (quantity_per_use direto)
 *  - Cálculo estimado (recipiente / atendimentos estimados)
 *  - Aplicação a vínculos de serviço, template de pacote e etapa de pacote
 */

describe('Conversão de unidades (espelha convert_product_quantity SQL)', () => {
  it('mesma unidade retorna o próprio valor', () => {
    expect(convertQuantity(500, 'ml', 'ml')).toBe(500);
    expect(convertQuantity(2, 'un', 'un')).toBe(2);
  });

  it('volume ↔ volume', () => {
    expect(convertQuantity(1, 'l', 'ml')).toBe(1000);
    expect(convertQuantity(250, 'ml', 'l')).toBe(0.25);
  });

  it('massa ↔ massa', () => {
    expect(convertQuantity(2, 'kg', 'g')).toBe(2000);
    expect(convertQuantity(500, 'g', 'kg')).toBe(0.5);
  });

  it('cross-family assume densidade 1 (gel/água/cremes)', () => {
    // Comprei 25 kg de gel, uso 500 ml por atendimento → baixa = 0,5 kg
    expect(convertQuantity(500, 'ml', 'kg')).toBe(0.5);
    expect(convertQuantity(500, 'ml', 'g')).toBe(500);
    expect(convertQuantity(1, 'l', 'kg')).toBe(1);
    expect(convertQuantity(1000, 'g', 'l')).toBe(1);
  });
});

describe('Modo estimado: recipiente ÷ atendimentos', () => {
  it('recipiente de 500 ml para 10 atendimentos → 50 ml por uso', () => {
    expect(
      calculateEstimatedUsagePerAppointment({
        containerAmount: 500,
        containerUnit: 'ml',
        stockUnit: 'ml',
        estimatedAppointments: 10,
      }),
    ).toBe(50);
  });

  it('recipiente em ml com estoque em kg (densidade 1)', () => {
    // 500 ml para 25 atendimentos com estoque em kg → 0.02 kg por uso
    const result = calculateEstimatedUsagePerAppointment({
      containerAmount: 500,
      containerUnit: 'ml',
      stockUnit: 'kg',
      estimatedAppointments: 25,
    });
    expect(result).toBeCloseTo(0.02, 6);
  });

  it('retorna 0 quando estimated_appointments é 0/negativo', () => {
    expect(
      calculateEstimatedUsagePerAppointment({
        containerAmount: 500,
        containerUnit: 'ml',
        stockUnit: 'ml',
        estimatedAppointments: 0,
      }),
    ).toBe(0);
  });
});

describe('Atendimentos restantes a partir do estoque atual', () => {
  it('modo exato: estoque ÷ quantity_per_use', () => {
    expect(
      calculateRemainingAppointments({
        currentStock: 100,
        stockUnit: 'ml',
        trackingMethod: 'exact',
        quantityPerUse: 8,
      }),
    ).toBe(12);
  });

  it('modo estimado: converte recipiente para unidade de estoque', () => {
    // Estoque 1 l, recipiente 100 ml para 5 atendimentos → 1000 ml / 100 ml * 5 = 50
    expect(
      calculateRemainingAppointments({
        currentStock: 1,
        stockUnit: 'l',
        trackingMethod: 'estimated',
        containerAmount: 100,
        containerUnit: 'ml',
        estimatedAppointments: 5,
      }),
    ).toBe(50);
  });

  it('retorna null quando faltam dados de estimativa', () => {
    expect(
      calculateRemainingAppointments({
        currentStock: 100,
        stockUnit: 'ml',
        trackingMethod: 'estimated',
        containerAmount: null,
        containerUnit: null,
        estimatedAppointments: null,
      }),
    ).toBeNull();
  });
});

describe('Custo por uso de vínculos serviço → produto / template → produto', () => {
  const product = {
    unit: 'ml',
    total_price: 100,
    quantity_purchased: 100, // R$ 1,00 por ml
    unit_price: 1,
  };

  it('modo exato: quantity_per_use × preço por unidade de estoque', () => {
    const cost = calculateProductLinkCostPerUse({
      product_id: 'p1',
      quantity_per_use: 5,
      tracking_method: 'exact',
      product,
    });
    expect(cost).toBe(5); // 5 ml * R$1 = R$5
  });

  it('modo estimado com conversão cross-family (ml→kg densidade 1)', () => {
    const cost = calculateProductLinkCostPerUse({
      product_id: 'p2',
      quantity_per_use: 0,
      tracking_method: 'estimated',
      container_amount: 100,
      container_unit: 'ml',
      estimated_appointments: 10,
      product: {
        unit: 'kg',
        total_price: 1000,
        quantity_purchased: 25, // R$ 40 por kg
      },
    });
    // 100 ml / 10 = 10 ml por uso → 0.01 kg → 0.01 * 40 = R$ 0,40
    expect(cost).toBeCloseTo(0.4, 6);
  });

  it('estimado sem dados cai em fallback exact', () => {
    const cost = calculateProductLinkCostPerUse({
      product_id: 'p3',
      quantity_per_use: 3,
      tracking_method: 'estimated',
      container_amount: null,
      container_unit: null,
      estimated_appointments: null,
      product,
    });
    expect(cost).toBe(3);
  });

  it('soma custo de múltiplos vínculos (serviço + template de pacote)', () => {
    const svcLink = {
      product_id: 'p1',
      quantity_per_use: 2,
      tracking_method: 'exact' as const,
      product,
    };
    const templateLink = {
      product_id: 'p2',
      quantity_per_use: 0,
      tracking_method: 'estimated' as const,
      container_amount: 500,
      container_unit: 'ml',
      estimated_appointments: 10,
      product,
    };
    // 2*1 + 50*1 = 52
    expect(calculateTotalCostPerUse([svcLink, templateLink])).toBe(52);
  });
});

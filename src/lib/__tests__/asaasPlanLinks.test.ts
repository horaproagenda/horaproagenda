import { describe, expect, it } from 'vitest';
import {
  BILLING_CYCLES,
  BILLING_PLANS,
  quoteCycle,
} from '../../../supabase/functions/_shared/billingPlans';
import {
  buildPlanLinkCatalog,
  parsePlanLinkReference,
  pickReusablePaymentLink,
  planLinkPayload,
  planLinkExternalReference,
} from '../../../supabase/functions/_shared/asaasPlanLinks';

describe('catálogo de links de assinatura Hora Pro no Asaas', () => {
  it('gera exatamente 24 planos e cobre cada pacote em cada ciclo', () => {
    const catalog = buildPlanLinkCatalog();

    expect(catalog).toHaveLength(BILLING_PLANS.length * BILLING_CYCLES.length);
    for (const plan of BILLING_PLANS) {
      for (const cycle of BILLING_CYCLES) {
        expect(catalog).toContainEqual(
          expect.objectContaining({ seats: plan.seats, months: cycle.months }),
        );
      }
    }
  });

  it('usa os mesmos valores oficiais de mensal, semestral e anual', () => {
    for (const item of buildPlanLinkCatalog()) {
      const quote = quoteCycle(item.seats, item.months);
      expect(quote).not.toBeNull();
      expect(item.totalCents).toBe(quote?.totalCents);
      expect(planLinkPayload(item)).toMatchObject({
        value: (quote?.totalCents ?? 0) / 100,
        billingType: 'UNDEFINED',
        chargeType: 'RECURRENT',
        subscriptionCycle: item.asaasCycle,
        dueDateLimitDays: 5,
        notificationEnabled: true,
      });
    }
  });

  it('mantém uma referência estável e recuperável para cada link', () => {
    const catalog = buildPlanLinkCatalog();
    const item = catalog.find((entry) => entry.seats === 10 && entry.months === 12);
    expect(item).toBeDefined();
    expect(item?.externalReference).toBe(planLinkExternalReference(10, 12));
    expect(parsePlanLinkReference(item?.externalReference)).toEqual({ seats: 10, months: 12 });
  });

  it('reaproveita o link existente em vez de criar outro', () => {
    const item = buildPlanLinkCatalog()[0];
    const existing = {
      id: 'plink_1',
      name: 'nome antigo',
      description: item.description,
      externalReference: null,
      url: 'https://asaas.com/plink_1',
    };

    expect(pickReusablePaymentLink([existing], item)).toEqual(existing);
    expect(pickReusablePaymentLink([{ ...existing, deleted: true }], item)).toBeNull();
  });

  it('libera todas as formas declaradas no link, sem alterar o cadastro com cartão', () => {
    const item = buildPlanLinkCatalog()[0];
    const payload = planLinkPayload(item);
    expect(payload.billingType).toBe('UNDEFINED');
    expect(item.description).toContain('cartão de crédito');
    expect(item.description).toContain('cartão de débito');
    expect(item.description).toContain('Pix');
    expect(item.description).toContain('boleto');
  });
});

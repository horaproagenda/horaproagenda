import { describe, expect, it } from 'vitest';
import { canonicalOperationPayload } from '../operationRequest';

describe('identidade estável da operação', () => {
  it('nova tentativa com horário de pagamento diferente usa a mesma solicitação', () => {
    expect(canonicalOperationPayload({ original_amount: 100, paid_at: '2026-10-14T00:00:00Z' }))
      .toBe(canonicalOperationPayload({ paid_at: '2026-10-14T00:01:00Z', original_amount: 100 }));
  });
  it('identidade enviada pelo navegador não faz parte dos dados graváveis', () => {
    expect(JSON.parse(canonicalOperationPayload({ created_by: 'outro', account_owner_id: 'outra', original_amount: 100 })))
      .toEqual({ original_amount: 100 });
  });
  it('alterar o valor identifica uma operação diferente', () => {
    expect(canonicalOperationPayload({ original_amount: 100 })).not.toBe(canonicalOperationPayload({ original_amount: 200 }));
  });
  it('valor final não substitui o cálculo oficial', () => {
    expect(JSON.parse(canonicalOperationPayload({ original_amount: 100, discount_amount: 20, final_amount: 1 })))
      .toEqual({ discount_amount: 20, original_amount: 100 });
  });
});
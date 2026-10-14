import { describe, it, expect } from 'vitest';
import { makeClient } from './setup';
describe('venda multi-item protegida no servidor', () => {
 it('dois itens não são criados sem login', async () => {
  const { error } = await makeClient().rpc('create_multi_item_sale_atomic', {
    _request_id: crypto.randomUUID(), _input: {
      client_id: crypto.randomUUID(), sale_date: '2026-10-14', payment_method_id: crypto.randomUUID(),
      items: [{ type: 'service', source_id: crypto.randomUUID(), quantity: 2 }, { type: 'package', source_id: crypto.randomUUID(), quantity: 1 }],
    },
  });
  expect(error).not.toBeNull();
  expect(error?.code).toBe('42501');
 });
});
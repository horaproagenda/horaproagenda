import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitMultiItemSale } from '../multiItemSale';
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
describe('venda inteira pela autoridade oficial', () => {
 beforeEach(() => vi.clearAllMocks());
 it('envia os dois itens, boleto e identificação em uma chamada', async () => {
  const input = { items: [{ type: 'service', quantity: 2 }, { type: 'package', quantity: 1 }], boleto_installments: 3 };
  mock.rpc.mockResolvedValue({ data: { total: 600 }, error: null });
  expect(await submitMultiItemSale(input, 'request')).toEqual({ total: 600 });
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('create_multi_item_sale_atomic', { _input: input, _request_id: 'request' });
 });
 it('falha não é apresentada como sucesso', async () => {
  mock.rpc.mockResolvedValue({ data: null, error: new Error('Estoque insuficiente') });
  await expect(submitMultiItemSale({ items: [] }, 'request')).rejects.toThrow('Estoque insuficiente');
 });
});
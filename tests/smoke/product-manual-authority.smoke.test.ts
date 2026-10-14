import { describe, it, expect } from 'vitest';
import { makeClient } from './setup';
describe('consumo manual bloqueado sem login', () => {
 it('não registra nem baixa estoque anonimamente', async () => {
  const { error } = await makeClient().rpc('record_manual_product_consumption', { _input: { quantity_used: 20, product_id: crypto.randomUUID(), unit: 'ml', consumption_date: '2026-10-14' }, _request_id: crypto.randomUUID() });
  expect(error).not.toBeNull();
 });
 it('não cancela nem devolve estoque anonimamente', async () => {
  const { error } = await makeClient().rpc('cancel_manual_product_consumption', { _id: crypto.randomUUID(), _reason: 'Teste bloqueado' });
  expect(error).not.toBeNull();
 });
});
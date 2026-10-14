import { describe, expect, it } from 'vitest';
import { makeClient } from './setup';

describe('operações oficiais recusam acesso sem sessão', () => {
  it('venda não pode ser registrada por usuário anônimo', async () => {
    const { error } = await makeClient().rpc('create_single_sale_atomic', {
      _request_id: crypto.randomUUID(),
      _sale: { item_type: 'service', original_amount: 100, discount_amount: 0, sale_date: '2026-10-14' },
    });
    expect(error).not.toBeNull();
  });
  it('movimentação não pode ser registrada por usuário anônimo', async () => {
    const { error } = await makeClient().rpc('create_cash_transaction_atomic', {
      _request_id: crypto.randomUUID(),
      _transaction: { type: 'income', amount: 100, category: 'Teste bloqueado' },
    });
    expect(error).not.toBeNull();
  });
});
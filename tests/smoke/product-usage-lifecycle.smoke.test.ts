import { describe, expect, it } from 'vitest';
import { makeClient, authedClient, describeIfCreds, tag } from './setup';

describe('uso de produtos: acesso anônimo', () => {
  it('não permite iniciar ciclo sem login', async () => {
    const { error } = await makeClient().rpc('start_product_usage_cycle', { _product_id: '00000000-0000-0000-0000-000000000000', _start_date: '2026-10-14', _quantity: 100, _unit: 'un' });
    expect(error).not.toBeNull();
  });
});

describeIfCreds('uso de produtos: transação, datas, versão e idempotência', () => {
  it('600/100 mantém 600 ao iniciar, deixa 500 ao encerrar e não repete baixa', async () => {
    const client = await authedClient();
    const { data: product, error: createError } = await client.from('products').insert({ name: tag('Ciclo de uso'), unit: 'un', product_type: 'solid', current_stock: 600, quantity_purchased: 600, is_active: true }).select('id').single();
    expect(createError).toBeNull();
    if (!product) throw new Error('Produto de teste não criado.');
    const { data: cycle, error: startError } = await client.rpc('start_product_usage_cycle', { _product_id: product.id, _quantity: 100, _unit: 'un', _start_date: '2026-10-14' });
    expect(startError).toBeNull();
    if (!cycle?.id) throw new Error('Ciclo de teste não criado.');
    const { data: before } = await client.from('products').select('current_stock').eq('id', product.id).single();
    expect(Number(before?.current_stock)).toBe(600);
    const { error: badDate } = await client.rpc('finish_product_usage_record', { _usage_id: cycle.id, _expected_version: cycle.version, _end_date: '2026-10-13' });
    expect(badDate).not.toBeNull();
    const { error: stale } = await client.rpc('finish_product_usage_record', { _usage_id: cycle.id, _expected_version: 0, _end_date: '2026-10-14' });
    expect(stale).not.toBeNull();
    const { data: closed, error: endError } = await client.rpc('finish_product_usage_record', { _usage_id: cycle.id, _expected_version: cycle.version, _end_date: '2026-10-14' });
    expect(endError).toBeNull();
    expect(Number(closed?.stock_after)).toBe(500);
    expect(Number(closed?.duration_days)).toBe(1);
    const { data: repeated, error: repeatError } = await client.rpc('finish_product_usage_record', { _usage_id: cycle.id, _expected_version: cycle.version, _end_date: '2026-10-14' });
    expect(repeatError).toBeNull();
    expect(Number(repeated?.stock_after)).toBe(500);
    const { data: events } = await client.from('product_usage_events').select('id').eq('usage_id', cycle.id).eq('event_type', 'usage_finished');
    expect(events).toHaveLength(1);
    const { error: missingReason } = await client.rpc('change_product_usage_record', { _usage_id: cycle.id, _expected_version: closed.version, _start_date: '2026-10-14', _end_date: null, _reason: '', _action: 'reopen' });
    expect(missingReason).not.toBeNull();
    await client.rpc('change_product_usage_record', { _usage_id: cycle.id, _expected_version: closed.version, _start_date: '2026-10-14', _end_date: null, _reason: 'Fim do teste isolado', _action: 'cancel' });
    // Histórico de teste preservado, sem remover trilha auditada.
    await client.from('products').update({ is_active: false }).eq('id', product.id);
  });
});
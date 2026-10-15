import { describe, it, expect } from 'vitest';
import { buildReceiptRows } from '@/lib/receiptRows';
describe('recibo com item adicional', () => {
  it('inclui axila R$ 50 com nome e valor', () => {
    const rows = buildReceiptRows({
      main: { item: 'Coxa + canela', type: 'Serviço', quantity: 1, unitPrice: 200, total: 200 },
      persisted: [{ item_type: 'service', service_id: 's1', quantity: 1, unit_price: 50, total_amount: 0 }],
      pending: [],
      nameLookup: (_t, id) => (id === 's1' ? 'Axila' : undefined),
    });
    expect(rows[1]).toMatchObject({ item: 'Axila', total: 50 });
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(250);
  });
});

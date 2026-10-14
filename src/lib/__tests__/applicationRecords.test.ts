import { describe, it, expect } from 'vitest';
import { validateCompletion, buildReferenceItems, emptyItem } from '../applicationRecords';

const base = {
  professional_id: 'p1', procedure_name: 'Preenchimento', performed_at: '2026-10-14T10:00',
  items: [{ ...emptyItem(), product_name_snapshot: 'Produto A', region: 'Lábios', quantity: '2', unit: 'ml' }],
  templateFields: [], values: {},
};

describe('ficha de aplicação', () => {
  it('aceita ficha completa', () => expect(validateCompletion(base)).toEqual([]));
  it('recusa quantidade zero ou negativa', () => {
    expect(validateCompletion({ ...base, items: [{ ...base.items[0], quantity: '0' }] })).toContain('Item 1: quantidade válida');
    expect(validateCompletion({ ...base, items: [{ ...base.items[0], quantity: '-1' }] })).toContain('Item 1: quantidade válida');
  });
  it('exige ao menos um item', () => expect(validateCompletion({ ...base, items: [] })).toContain('Ao menos um item aplicado'));
  it('exige campo obrigatório do modelo', () => {
    const r = validateCompletion({ ...base, templateFields: [{ id: 'obj', label: 'Objetivo', type: 'text', required: true }] });
    expect(r).toContain('Objetivo');
  });
  it('referência não copia produto, lote, validade nem quantidade', () => {
    const [i] = buildReferenceItems([{ ...base.items[0], lot_number: 'ABC', expiration_date: '2027-12-01', technique: 'Retro' }]);
    expect(i.product_name_snapshot).toBe('');
    expect(i.lot_number).toBe('');
    expect(i.expiration_date).toBe('');
    expect(i.quantity).toBe('');
    expect(i.region).toBe('Lábios');
    expect(i.technique).toBe('Retro');
  });
});

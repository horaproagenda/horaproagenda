import { describe, it, expect } from 'vitest';
import {
  buildChangeDescription,
  formatHistoryValue,
  resolveAuthorName,
  HIDDEN_FIELDS,
} from './appointmentHistoryFormat';

const PM_UUID = 'fbe3bc08-b13e-4b57-8fe2-539de8f310eb';
const PROF_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const maps = {
  payment_methods: new Map([[PM_UUID, 'Crédito ao cliente']]),
  professional_id: new Map([[PROF_UUID, 'Maria Tereza']]),
};

describe('formatHistoryValue', () => {
  it('converte UUID de forma de pagamento em nome legível', () => {
    expect(formatHistoryValue('payment_methods', [PM_UUID], maps)).toBe('Crédito ao cliente');
  });

  it('formata valor monetário no padrão brasileiro', () => {
    expect(formatHistoryValue('amount_paid', 150.5, maps)).toMatch(/R\$\s?150,50/);
  });

  it('resolve UUID de profissional pelo nome', () => {
    expect(formatHistoryValue('professional_id', PROF_UUID, maps)).toBe('Maria Tereza');
  });
});

describe('buildChangeDescription', () => {
  it('descreve baixa de pagamento incluindo o nome legível da forma de pagamento', () => {
    const result = buildChangeDescription(
      'UPDATE',
      { amount_paid: 0, payment_status: 'pending', payment_methods: [] },
      { amount_paid: 100, payment_status: 'paid', payment_methods: [PM_UUID] },
      maps
    );
    expect(result.title).toContain('Baixa de pagamento registrada');
    expect(result.title).toContain('Crédito ao cliente');
    expect(result.description).toContain('Crédito ao cliente');
    expect(result.description).not.toContain(PM_UUID);
  });

  it('nunca expõe campos internos como recurring_group_id na descrição', () => {
    const result = buildChangeDescription(
      'UPDATE',
      { recurring_group_id: null, status: 'scheduled' },
      { recurring_group_id: '4cc792d3-03c2-4661-bae7-de0c0c2eb959', status: 'scheduled' },
      maps
    );
    expect(result.description).not.toContain('recurring_group_id');
    expect(result.description).not.toContain('4cc792d3');
  });

  it('campos técnicos estão na lista de ocultos', () => {
    expect(HIDDEN_FIELDS.has('recurring_group_id')).toBe(true);
    expect(HIDDEN_FIELDS.has('updated_at')).toBe(true);
    expect(HIDDEN_FIELDS.has('version')).toBe(true);
  });
});

describe('resolveAuthorName', () => {
  it('substitui email pelo nome do profissional quando disponível', () => {
    const byEmail = new Map([['mariaterezacastro2@gmail.com', 'Maria Tereza Castro']]);
    expect(resolveAuthorName('mariaterezacastro2@gmail.com', byEmail)).toBe('Maria Tereza Castro');
  });

  it('mantém email quando não há profissional vinculado', () => {
    expect(resolveAuthorName('outro@x.com', new Map())).toBe('outro@x.com');
  });

  it('retorna string vazia quando não há email', () => {
    expect(resolveAuthorName(null, new Map())).toBe('');
  });
});

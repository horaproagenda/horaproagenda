import { describe, expect, it } from 'vitest';
import { filterPayables } from '@/lib/payableFilters';

const TODAY = new Date('2026-11-19T12:00:00');

const entries = [
  { id: 'old-unpaid', due_date: '2026-09-10', status: 'pending' },
  { id: 'old-overdue', due_date: '2026-10-05', status: 'overdue' },
  { id: 'old-paid', due_date: '2026-10-20', status: 'paid' },
  { id: 'this-month-pending', due_date: '2026-11-25', status: 'pending' },
  { id: 'this-month-paid', due_date: '2026-11-02', status: 'paid' },
  { id: 'next-month', due_date: '2026-12-01', status: 'pending' },
];

describe('filterPayables', () => {
  it('mostra vencidas/pendentes de meses anteriores até a baixa, ignorando o período', () => {
    const result = filterPayables(entries, {
      dateFilter: ['month'],
      statusFilter: ['overdue_previous'],
      specificMonth: '2026-11',
      today: TODAY,
    });
    expect(result.map((e) => e.id)).toEqual(['old-unpaid', 'old-overdue']);
  });

  it('vencidas de meses anteriores não inclui contas já pagas nem do mês atual', () => {
    const result = filterPayables(entries, {
      dateFilter: ['all'],
      statusFilter: ['overdue_previous'],
      specificMonth: '2026-11',
      today: TODAY,
    });
    expect(result.map((e) => e.id)).not.toContain('old-paid');
    expect(result.map((e) => e.id)).not.toContain('this-month-pending');
  });

  it('mês específico mostra somente as contas do mês escolhido', () => {
    const result = filterPayables(entries, {
      dateFilter: ['specific'],
      statusFilter: ['all'],
      specificMonth: '2026-10',
      today: TODAY,
    });
    expect(result.map((e) => e.id)).toEqual(['old-overdue', 'old-paid']);
  });

  it('mês específico combinado com status pendente', () => {
    const result = filterPayables(entries, {
      dateFilter: ['specific'],
      statusFilter: ['pending'],
      specificMonth: '2026-10',
      today: TODAY,
    });
    expect(result.map((e) => e.id)).toEqual(['old-overdue']);
  });

  it('mantém comportamento atual: este mês, hoje e todos', () => {
    expect(
      filterPayables(entries, {
        dateFilter: ['month'],
        statusFilter: ['all'],
        specificMonth: '2026-11',
        today: TODAY,
      }).map((e) => e.id),
    ).toEqual(['this-month-pending', 'this-month-paid']);

    expect(
      filterPayables(entries, {
        dateFilter: ['today'],
        statusFilter: ['all'],
        specificMonth: '2026-11',
        today: TODAY,
      }).map((e) => e.id),
    ).toEqual([]);

    expect(
      filterPayables(entries, {
        dateFilter: ['all'],
        statusFilter: ['all'],
        specificMonth: '2026-11',
        today: TODAY,
      }),
    ).toHaveLength(entries.length);
  });
});

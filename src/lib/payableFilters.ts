import {
  endOfDay,
  endOfMonth,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns';

export interface PayableLike {
  due_date: string;
  status: string;
}

/**
 * Filtros da página Contas a Pagar.
 *
 * - statusFilter 'overdue_previous': mostra contas vencidas e/ou com valor
 *   pendente de meses anteriores (vencimento antes do mês atual e ainda não
 *   pagas), independentemente do filtro de período — a conta some da lista
 *   somente quando o pagamento é baixado.
 * - dateFilter 'specific': mostra somente as contas do mês escolhido
 *   (specificMonth no formato 'yyyy-MM').
 */
export function filterPayables<T extends PayableLike>(
  entries: T[],
  opts: {
    dateFilter: string[];
    statusFilter: string[];
    specificMonth: string;
    today?: Date;
  },
): T[] {
  const today = opts.today ?? new Date();
  const dateFilter = opts.dateFilter.length ? opts.dateFilter : ['all'];
  const statusFilter = opts.statusFilter.length ? opts.statusFilter : ['all'];

  if (statusFilter.includes('overdue_previous')) {
    const monthStart = startOfMonth(today);
    return entries.filter(
      (e) => e.status !== 'paid' && parseISO(e.due_date) < monthStart,
    );
  }

  return entries.filter((entry) => {
    if (!statusFilter.includes('all')) {
      if (statusFilter.includes('pending') && entry.status === 'paid') return false;
      if (statusFilter.includes('paid') && entry.status !== 'paid') return false;
    }

    if (!dateFilter.includes('all')) {
      const dueDate = parseISO(entry.due_date);
      if (dateFilter.includes('today')) {
        return isWithinInterval(dueDate, { start: startOfDay(today), end: endOfDay(today) });
      }
      if (dateFilter.includes('specific')) {
        const ref = parseISO(`${opts.specificMonth}-01`);
        return isWithinInterval(dueDate, { start: startOfMonth(ref), end: endOfMonth(ref) });
      }
      if (dateFilter.includes('month')) {
        return isWithinInterval(dueDate, { start: startOfMonth(today), end: endOfMonth(today) });
      }
    }
    return true;
  });
}

/**
 * Cadeia de pagamentos parciais de contas a pagar.
 * Uma conta paga em partes (ex.: R$ 780 + R$ 420) fica em várias linhas
 * ligadas pelo root_entry_id. Ela só é "parcial" enquanto alguma parte
 * da cadeia ainda estiver pendente.
 */
export interface ChainEntry {
  id: string;
  status: string;
  amount: number | string;
  notes?: string | null;
  root_entry_id?: string | null;
  original_total_amount?: number | string | null;
}

export function chainOf<T extends ChainEntry>(entry: T, all: T[]): T[] {
  const root = entry.root_entry_id || entry.id;
  return all.filter((e) => e.id === root || e.root_entry_id === root);
}

export type ChainState = 'paid' | 'partial' | 'open';

export function payableChainState<T extends ChainEntry>(entry: T, all: T[]): ChainState {
  if (entry.status !== 'paid') return 'open';
  const chain = chainOf(entry, all);
  const linked = chain.length > 1 || !!entry.root_entry_id;
  const looksPartial = linked || (entry.notes ?? '').includes('Pagamento parcial');
  if (!looksPartial) return 'paid';
  if (chain.length <= 1) return 'partial';
  return chain.every((e) => e.status === 'paid') ? 'paid' : 'partial';
}

/** Total pago somado em toda a cadeia (ex.: 780 + 420 = 1200). */
export function chainPaidTotal<T extends ChainEntry>(entry: T, all: T[]): number {
  return chainOf(entry, all)
    .filter((e) => e.status === 'paid')
    .reduce((s, e) => s + Number(e.amount), 0);
}

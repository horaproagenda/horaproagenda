import { describe, it, expect } from 'vitest';
import { payableChainState, chainPaidTotal } from '../payableChain';

const root = { id: 'r', status: 'paid', amount: 780, notes: 'Pagamento parcial: R$ 780.00 de R$ 1200.00', root_entry_id: 'r' };
const rest = { id: 'x', status: 'paid', amount: 420, notes: 'Saldo restante', root_entry_id: 'r' };

describe('cadeia de pagamento parcial', () => {
  it('780 + 420 pagos = quitado, total 1200', () => {
    expect(payableChainState(root, [root, rest])).toBe('paid');
    expect(chainPaidTotal(root, [root, rest])).toBe(1200);
  });
  it('restante pendente mantém parcial', () => {
    const pend = { ...rest, status: 'pending' };
    expect(payableChainState(root, [root, pend])).toBe('partial');
  });
});

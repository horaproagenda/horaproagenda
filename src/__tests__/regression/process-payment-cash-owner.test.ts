import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('baixa de pagamento grava no caixa com a conta da clínica', () => {
  it('process-payment envia account_owner_id nas movimentações de caixa', () => {
    const s = readFileSync('supabase/functions/process-payment/index.ts', 'utf8');
    const inserts = s.split("from('cash_transactions').insert(").slice(1);
    expect(inserts.length).toBeGreaterThan(0);
    for (const chunk of inserts) {
      expect(chunk.slice(0, chunk.indexOf('});'))).toContain('account_owner_id: callerOwner');
    }
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// Pontos que lançam dinheiro no caixa: todos devem usar o destino único.
const writers = [
  'hooks/useAppointments.ts',
  'hooks/useSingleSales.ts',
  'hooks/useProducts.ts',
  'components/caixa/SaleForm.tsx',
  'components/client-profile/LegacyHistoryDialog.tsx',
  'components/financeiro/PacotesFinanceiro.tsx',
  'components/financeiro/CancelPackageDialog.tsx',
];

describe('destino financeiro único', () => {
  it.each(writers)('%s usa resolveFinancialDestination e não escolhe caixa sozinho', (f) => {
    const s = read(f);
    expect(s).toMatch(/resolveFinancialDestination/);
    expect(s).not.toMatch(/from\('cash_registers'\)\s*\.select\('id'\)\s*\.(eq\('status', 'open'\)|is\('closed_at', null\))/);
  });

  it('pagamento da agenda usa a mesma regra do banco', () => {
    const s = readFileSync(join(root, '..', 'supabase', 'functions', 'process-payment', 'index.ts'), 'utf8');
    expect(s).toContain("rpc('resolve_financial_destination'");
  });
});

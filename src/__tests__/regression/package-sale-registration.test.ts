import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('venda do pacote registrada no Financeiro', () => {
  it('createClientPackage cria a venda na mesma operação com rollback', () => {
    const src = read('src/hooks/useClientPackages.ts');
    expect(src).toContain("from('single_sales')");
    expect(src).toContain("item_type: 'package'");
    // rollback: pacote e sessões são revertidos se a venda falhar
    expect(src).toMatch(/if \(saleError\)[\s\S]{0,400}service_packages'\)\.delete\(\)/);
  });

  it('novo agendamento nunca marca o pacote como pago (só a baixa registra)', () => {
    const src = read('src/components/appointments/NewAppointmentDialog.tsx');
    expect(src).not.toContain('packageAlreadyPaid');
    expect(src).not.toContain('Nenhum valor entra no caixa por aqui');
    expect(src).toMatch(/payment:\s*\{\s*isPaid:\s*false/);
  });

  it('verificação automática regulariza e nunca apaga pacote sem venda', () => {
    const src = read('src/hooks/useSaleFlowIntegrityAutoCheck.ts');
    expect(src).toContain('healPackagesWithoutSale');
    expect(src).not.toContain('heal_orphan_service_packages');
    expect(src).not.toMatch(/\.delete\(\)/);
    const rpc = read('src/lib/healPackagesWithoutSale.ts');
    expect(rpc).toContain('heal_packages_without_sale');
    expect(rpc).not.toMatch(/\.delete\(\)/);
  });
});

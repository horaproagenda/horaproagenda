import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const report = read('src/components/client-profile/ClientReportTab.tsx');
const editDialog = read('src/components/appointments/EditRecurringAppointmentDialog.tsx');

describe('Histórico Detalhado no celular e tablet', () => {
  const detailedHistory = report.slice(
    report.indexOf('{/* Detailed Table */}'),
    report.indexOf('{/* Cancel Sale Dialog */}'),
  );

  it('usa ResponsiveTable e não mantém uma tabela larga exclusiva no celular', () => {
    expect(detailedHistory).toContain('<ResponsiveTable');
    expect(detailedHistory).toContain('data-testid="detailed-history-scroll"');
    expect(detailedHistory).not.toContain('<Table>');
  });

  it('preserva todas as informações e ações nos cartões responsivos', () => {
    for (const key of ['service', 'date', 'time', 'professional', 'application', 'status', 'actions']) {
      expect(detailedHistory).toContain(`key: '${key}'`);
    }
    expect(detailedHistory).toContain("priority: 'actions'");
  });

  it('retira o foco do botão Editar antes de abrir a janela', () => {
    expect(detailedHistory).toContain('event.currentTarget.blur()');
  });

  it('deixa a janela receber foco interno e bloqueia a restauração ao botão antigo', () => {
    const contentLine = editDialog.split('\n').find((line) => line.includes('<DialogContent className="max-w-2xl')) ?? '';
    expect(contentLine).toContain('onCloseAutoFocus={(e) => e.preventDefault()}');
    expect(contentLine).not.toContain('onOpenAutoFocus');
  });
});
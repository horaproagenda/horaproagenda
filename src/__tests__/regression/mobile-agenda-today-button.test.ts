import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const header = read('src/components/agenda/MobileAgendaHeader.tsx');
const agenda = read('src/pages/Agenda.tsx');

describe('Botão Hoje visível no cabeçalho mobile da Agenda', () => {
  // Extrai a linha de navegação de datas (Row 2) do cabeçalho mobile.
  const dateNav = header.slice(
    header.indexOf('{/* Row 2: Date nav */}'),
    header.indexOf('{/* Search input - collapsible */}'),
  );

  it('renderiza um botão Hoje sempre visível na linha de navegação de datas', () => {
    expect(dateNav).toContain('Hoje');
    expect(dateNav).toContain('</Button>');
    // Botão outline destacado da data, fora do menu "Mais ações".
    expect(dateNav).toContain('variant="outline"');
    expect(dateNav).toContain('aria-label="Ir para hoje"');
  });

  it('chama o handler de hoje existente e fica desabilitado quando já é hoje', () => {
    expect(dateNav).toContain('disabled={isToday}');
    expect(dateNav).toContain('onClick={onToday ?? goToToday}');
  });

  it('mantém o handler onToday conectado no smartphone view', () => {
    const smartphoneHeader = agenda.slice(
      agenda.indexOf('<MobileAgendaHeader'),
      agenda.indexOf('/>', agenda.indexOf('<MobileAgendaHeader')),
    );
    expect(smartphoneHeader).toContain('onToday={');
    expect(smartphoneHeader).toContain('setSelectedDate(today)');
    expect(smartphoneHeader).toContain('setMonthStart(startOfMonth(today))');
  });
});

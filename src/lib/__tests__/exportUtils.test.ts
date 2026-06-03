import { describe, it, expect } from 'vitest';
import { buildCsv, parseCsv, escapeCsvCell, detectSeparator } from '@/lib/exportUtils';

describe('exportUtils CSV round-trip', () => {
  it('faz quoting de valores com separador, aspas e quebras de linha', () => {
    expect(escapeCsvCell('simples')).toBe('simples');
    expect(escapeCsvCell('com;ponto')).toBe('"com;ponto"');
    expect(escapeCsvCell('com,virgula')).toBe('"com,virgula"');
    expect(escapeCsvCell('tem "aspas"')).toBe('"tem ""aspas"""');
    expect(escapeCsvCell('linha\nnova')).toBe('"linha\nnova"');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(123)).toBe('123');
  });

  it('detecta separador corretamente', () => {
    expect(detectSeparator('a;b;c\n1;2;3')).toBe(';');
    expect(detectSeparator('a,b,c\n1,2,3')).toBe(',');
    expect(detectSeparator('a\tb\tc')).toBe('\t');
    // ignora separadores dentro de aspas
    expect(detectSeparator('"a,b";c;d')).toBe(';');
  });

  it('round-trip preserva valores complexos com vírgulas, ponto-e-vírgula e quebras', () => {
    const headers = ['Nome', 'Endereço', 'Observações'];
    const rows = [
      ['Maria; Silva', 'Av. Brasil, 100', 'linha 1\nlinha 2'],
      ['João "Jr."', 'Rua A; 50', 'tem "aspas" aqui'],
      ['Ana', 'Rua B', ''],
    ];
    const csv = buildCsv(headers, rows);
    const parsed = parseCsv(csv);

    expect(parsed[0]).toEqual(headers);
    expect(parsed.slice(1)).toEqual(rows);
  });

  it('parser reconhece BOM e CRLF', () => {
    const csv = '\ufeffNome;Idade\r\nMaria;30\r\nJoão;25\r\n';
    expect(parseCsv(csv)).toEqual([
      ['Nome', 'Idade'],
      ['Maria', '30'],
      ['João', '25'],
    ]);
  });

  it('parser não quebra colunas quando o nome contém vírgula', () => {
    const csv = 'Nome;Telefone\n"Souza, João";11999999999';
    const rows = parseCsv(csv);
    expect(rows[1]).toEqual(['Souza, João', '11999999999']);
  });
});

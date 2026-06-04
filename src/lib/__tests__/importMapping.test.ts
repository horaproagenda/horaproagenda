import { describe, it, expect } from 'vitest';
import { mapHeaders, normalizeHeader, getColumnSpecs } from '../importMapping';
import { parseCsv } from '../exportUtils';

describe('normalizeHeader', () => {
  it('remove acentos, espaços e baixa o case', () => {
    expect(normalizeHeader('  Descrição ')).toBe('descricao');
    expect(normalizeHeader('Observações')).toBe('observacoes');
    expect(normalizeHeader('E-MAIL')).toBe('e-mail');
  });
});

describe('mapHeaders - clientes', () => {
  it('mapeia colunas em português com acentos e ordem trocada', () => {
    const headers = ['Telefone', 'Nome', 'E-mail', 'CPF', 'Nascimento', 'Observações', 'Indicação'];
    const result = mapHeaders('clients', headers);
    expect(result.indices.name).toBe(1);
    expect(result.indices.phone).toBe(0);
    expect(result.indices.email).toBe(2);
    expect(result.indices.cpf).toBe(3);
    expect(result.indices.birthdate).toBe(4);
    expect(result.indices.notes).toBe(5);
    expect(result.indices.referral_source).toBe(6);
    expect(result.missingRequired).toEqual([]);
  });

  it('reporta colunas obrigatórias faltando', () => {
    const result = mapHeaders('clients', ['Email', 'CPF']);
    expect(result.missingRequired).toEqual(['Nome', 'Telefone']);
  });

  it('aceita aliases alternativos (celular, whatsapp)', () => {
    const result = mapHeaders('clients', ['Nome', 'Celular']);
    expect(result.indices.phone).toBe(1);
    expect(result.missingRequired).toEqual([]);
  });

  it('não confunde Nome do cliente com Nome do serviço quando ambos presentes', () => {
    const result = mapHeaders('clients', ['Cliente', 'Telefone']);
    expect(result.indices.name).toBe(0);
    expect(result.indices.phone).toBe(1);
  });
});

describe('mapHeaders - serviços', () => {
  it('mapeia preço, duração e categoria', () => {
    const headers = ['Nome', 'Categoria', 'Preço', 'Duração', 'Descrição', 'Retorno'];
    const result = mapHeaders('services', headers);
    expect(result.indices).toMatchObject({
      name: 0,
      category: 1,
      price: 2,
      duration: 3,
      description: 4,
      return_days: 5,
    });
    expect(result.missingRequired).toEqual([]);
  });

  it('falha quando faltar Nome', () => {
    const result = mapHeaders('services', ['Preço', 'Duração']);
    expect(result.missingRequired).toContain('Nome');
  });
});

describe('mapHeaders - pacotes', () => {
  it('mapeia sessões e intervalo via aliases', () => {
    const headers = ['Nome', 'Quantidade', 'Valor', 'Tempo', 'Intervalo_Dias', 'Desc'];
    const result = mapHeaders('package_templates', headers);
    expect(result.indices.name).toBe(0);
    expect(result.indices.total_sessions).toBe(1);
    expect(result.indices.price).toBe(2);
    expect(result.indices.duration).toBe(3);
    expect(result.indices.interval_days).toBe(4);
    expect(result.indices.description).toBe(5);
  });
});

describe('mapHeaders - agendamentos', () => {
  it('exige Data, Horário Início e Cliente', () => {
    const ok = mapHeaders('appointments', [
      'Data',
      'Horário Início',
      'Cliente',
      'Telefone',
      'Serviço',
      'Profissional',
      'Sala',
      'Observações',
    ]);
    expect(ok.missingRequired).toEqual([]);
    expect(ok.indices.date).toBe(0);
    expect(ok.indices.startTime).toBe(1);
    expect(ok.indices.clientName).toBe(2);
    expect(ok.indices.serviceName).toBe(4);
    expect(ok.indices.professionalName).toBe(5);
  });

  it('lista todas obrigatórias quando arquivo só tiver lixo', () => {
    const result = mapHeaders('appointments', ['col1', 'col2']);
    expect(result.missingRequired.sort()).toEqual(['Cliente', 'Data', 'Horário Início'].sort());
  });
});

describe('integração parseCsv + mapHeaders', () => {
  it('mantém integridade de colunas mesmo com vírgulas dentro de aspas', () => {
    const csv = [
      'Nome;Telefone;Observações',
      '"Silva, Maria";11999998888;"Cliente VIP, prefere manhã"',
      'João Souza;11988887777;Sem observações',
    ].join('\r\n');
    const rows = parseCsv(csv);
    expect(rows[1]).toEqual(['Silva, Maria', '11999998888', 'Cliente VIP, prefere manhã']);
    const mapping = mapHeaders('clients', rows[0]);
    expect(mapping.missingRequired).toEqual([]);
    expect(rows[1][mapping.indices.name]).toBe('Silva, Maria');
    expect(rows[1][mapping.indices.notes]).toBe('Cliente VIP, prefere manhã');
  });

  it('detecta separador vírgula e mapeia corretamente', () => {
    const csv = 'Nome,Telefone,Email\nMaria,11999,maria@x.com';
    const rows = parseCsv(csv);
    const mapping = mapHeaders('clients', rows[0]);
    expect(mapping.missingRequired).toEqual([]);
    expect(rows[1][mapping.indices.email]).toBe('maria@x.com');
  });
});

describe('getColumnSpecs', () => {
  it('expõe specs para construir UI de modelo', () => {
    expect(getColumnSpecs('clients').find((c) => c.key === 'name')?.required).toBe(true);
    expect(getColumnSpecs('services').length).toBeGreaterThan(0);
  });
});

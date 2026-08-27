/**
 * Regressão de responsividade e organização visual (auditoria 2026-08-27).
 *
 * Estes testes leem o código-fonte e falham se alguma das proteções
 * aplicadas na auditoria for desfeita.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const indexCss = read('src/index.css');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(resolve(process.cwd(), dir))) {
    const full = join(dir, entry);
    if (statSync(resolve(process.cwd(), full)).isDirectory()) walk(full, acc);
    else if (full.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

// drawer.tsx: a "alça" de arraste tem 100px por design (não é conteúdo).
const FIXED_WIDTH_EXEMPT = ['src/components/ui/drawer.tsx'];
const tsxFiles = walk('src').filter(
  (f) => !f.includes('__tests__') && !f.includes('.test.') && !FIXED_WIDTH_EXEMPT.some((e) => f.endsWith(e.replace('src/', 'src/'))),
);


describe('utilitários de layout compartilhados', () => {
  it('index.css define field-grid, filter-bar, action-row, stack-mobile e page-header-row', () => {
    for (const util of ['.field-grid', '.filter-bar', '.action-row', '.stack-mobile', '.page-header-row']) {
      expect(indexCss).toContain(util);
    }
  });

  it('field-grid começa em uma coluna e só vira duas a partir de 768px', () => {
    const block = indexCss.slice(indexCss.indexOf('.field-grid {'), indexCss.indexOf('.filter-bar {'));
    expect(block).toMatch(/grid-template-columns:\s*1fr/);
    expect(indexCss).toMatch(/@media \(min-width: 768px\)[\s\S]{0,200}\.field-grid/);
  });

  it('filter-bar sempre quebra linha (nunca estoura a largura)', () => {
    const block = indexCss.slice(indexCss.indexOf('.filter-bar {'), indexCss.indexOf('.action-row {'));
    expect(block).toMatch(/flex-wrap:\s*wrap/);
    expect(block).toMatch(/max-width:\s*100%/);
  });

  it('action-row empilha botões em largura total no celular', () => {
    const block = indexCss.slice(indexCss.indexOf('.action-row {'), indexCss.indexOf('.stack-mobile {'));
    expect(block).toMatch(/flex-direction:\s*column/);
    expect(block).toMatch(/width:\s*100%/);
  });

  it('alvos de toque têm altura mínima confortável em telas de toque', () => {
    expect(indexCss).toMatch(/@media \(pointer: coarse\)[\s\S]{0,400}min-height:\s*3[0-9]px/);
  });
});

describe('ResponsiveTable existe e é o padrão para tabelas no celular', () => {
  const src = read('src/components/ui/responsive-table.tsx');

  it('renderiza cartões no celular e tabela em telas largas', () => {
    expect(src).toContain('useIsMobile');
    expect(src).toContain('data-responsive-cards');
    expect(src).toContain('<Table');
  });

  it('não descarta colunas: secundárias e ações continuam no cartão', () => {
    expect(src).toContain("priority === 'secondary'");
    expect(src).toContain("priority === 'actions'");
  });

  it('a tabela de pagamentos do perfil do cliente usa ResponsiveTable', () => {
    const report = read('src/components/client-profile/ClientReportTab.tsx');
    expect(report).toContain('<ResponsiveTable');
    // Regressão: largura mínima gigante forçava rolagem lateral desnecessária.
    expect(report).not.toContain('min-w-[980px]');
  });
});

describe('tabelas no celular mantêm contexto e legibilidade', () => {
  it('a primeira coluna fica fixa e a fonte não cai abaixo de 12px', () => {
    const block = indexCss.slice(indexCss.indexOf('13) TABELAS NO CELULAR'));
    expect(block).toMatch(/position:\s*sticky/);
    expect(block).toMatch(/font-size:\s*0\.75rem/);
  });
});

describe('perfil do cliente organizado', () => {
  const header = read('src/components/client-profile/ClientHeader.tsx');
  const page = read('src/pages/ClienteDetalhes.tsx');

  it('contatos ficam em seções rotuladas e empilhadas no celular', () => {
    expect(header).toContain('stack-mobile');
    expect(header).toContain('Telefone');
    expect(header).toContain('E-mail');
    // Regressão: o e-mail era cortado em 180px sem acesso ao valor completo.
    expect(header).not.toContain('truncate max-w-[180px]');
    expect(header).toContain('break-all');
  });

  it('o cabeçalho empilha avatar/dados/ações sem sobreposição', () => {
    expect(header).toMatch(/flex-col[\s\S]{0,120}sm:flex-row/);
  });

  it('as abas do perfil rolam no celular em vez de comprimir 7 colunas', () => {
    expect(page).toContain('overflow-x-auto');
    expect(page).toContain('lg:grid-cols-7');
    expect(page).not.toContain('grid w-full grid-cols-7');
  });

  it('o cabeçalho da página usa PageHeaderActions (título + ações com quebra)', () => {
    expect(page).toContain('<PageHeaderActions');
    expect(read('src/components/shared/PageHeaderActions.tsx')).toContain('page-header-row');
  });
});

describe('nenhuma largura fixa grande sem contraparte fluida', () => {
  // Problema: w-[180px] em barras de filtro estourava a tela em <400px.
  it('larguras fixas > 64px vêm acompanhadas de largura fluida no celular', () => {
    const violations: string[] = [];
    for (const file of tsxFiles) {
      const src = read(file);
      src.split('\n').forEach((line, i) => {
        if (!line.includes('className')) return;
        for (const m of line.matchAll(/(?<![\w:[-])w-\[(\d{3,})px\]/g)) {
          const px = Number(m[1]);
          if (px <= 64) continue;
          const fluid =
            line.includes('w-full') ||
            line.includes('max-w-') ||
            /(sm|md|lg|xl):w-\[/.test(line) ||
            line.includes('w-[min(');
          if (!fluid) violations.push(`${file}:${i + 1} → ${m[0]}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});

describe('formulários em uma coluna no celular', () => {
  // Problema: diálogos usavam `grid grid-cols-2` fixo, deixando campos
  // estreitos demais e labels sobrepostos em telas de 320-390px.
  const FORMS = [
    'src/components/clients/NewClientDialog.tsx',
    'src/components/client-profile/ClientInfoTab.tsx',
    'src/pages/CadastroCliente.tsx',
    'src/components/produtos/SupplierDialog.tsx',
    'src/components/appointments/ProfessionalAbsenceDialog.tsx',
    'src/components/appointments/NewAppointmentDialog.tsx',
    'src/components/caixa/SingleSaleDialog.tsx',
    'src/components/caixa/SaleForm.tsx',
  ];

  it.each(FORMS)('%s não usa grade de 2/3 colunas já no celular', (file) => {
    const src = read(file);
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => /\bgrid grid-cols-[23]\b/.test(line) && line.includes('<Label') === false)
      .filter(({ line }) => !/sm:grid-cols-[234]/.test(line))
      .map(({ line, i }) => `${file}:${i + 1} → ${line.trim().slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });
});

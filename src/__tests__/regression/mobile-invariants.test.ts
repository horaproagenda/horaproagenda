/**
 * Regressão de layout mobile (iPhone/Android) e responsividade.
 *
 * Estes testes leem o código-fonte e falham se uma alteração futura remover
 * uma das proteções já validadas. Cada bloco cita o problema original.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const indexHtml = read('index.html');
const indexCss = read('src/index.css');
const mainTsx = read('src/main.tsx');

describe('regressão mobile: viewport e zoom (iOS)', () => {
  // Problema: viewport travado impedia o usuário de dar zoom (acessibilidade).
  it('permite zoom do usuário e usa viewport-fit=cover', () => {
    const meta = indexHtml.match(/<meta name="viewport"[^>]*>/)?.[0] ?? '';
    expect(meta).toContain('width=device-width');
    expect(meta).toContain('viewport-fit=cover');
    expect(meta).toContain('user-scalable=yes');
    expect(meta).not.toContain('user-scalable=no');
    expect(meta).not.toMatch(/maximum-scale=1(\.0)?\b/);
  });

  // Problema: Safari dava zoom automático ao focar campos com fonte < 16px.
  it('inputs mantêm font-size de 16px para não haver auto-zoom no iOS', () => {
    expect(indexCss).toMatch(/font-size:\s*16px/);
  });
});

describe('regressão mobile: altura da viewport (100dvh)', () => {
  // Problema: 100vh no Safari deixava conteúdo atrás da barra do navegador.
  it('body usa 100dvh (100vh apenas como fallback anterior)', () => {
    const vhIdx = indexCss.indexOf('min-height: 100vh');
    const dvhIdx = indexCss.indexOf('min-height: 100dvh');
    expect(vhIdx).toBeGreaterThan(-1);
    expect(dvhIdx).toBeGreaterThan(vhIdx);
  });

  it('utilitários h-screen/min-h-screen são reescritos para dvh', () => {
    expect(indexCss).toMatch(/\.min-h-screen[\s\S]{0,120}100dvh/);
    expect(indexCss).toMatch(/\.h-screen[\s\S]{0,120}100dvh/);
  });
});

describe('regressão mobile: teclado virtual', () => {
  // Problema: no Android o teclado cobria campos e botões de salvar.
  it('o tracking de --kb-inset é inicializado no bootstrap', () => {
    expect(mainTsx).toContain('initKeyboardInsetTracking');
  });

  it('o CSS global desconta --kb-inset da altura útil', () => {
    expect(indexCss).toContain('--kb-inset');
    expect(indexCss).toMatch(/calc\(\s*100dvh[^)]*--kb-inset/);
  });

  it('dialog e sheet limitam altura considerando teclado e safe-area', () => {
    const dialog = read('src/components/ui/dialog.tsx');
    const sheet = read('src/components/ui/sheet.tsx');
    for (const src of [dialog, sheet]) {
      expect(src).toMatch(/kb-inset|kbInset/);
    }
  });
});

describe('regressão mobile: safe-areas (notch / Dynamic Island)', () => {
  it('utilitários de safe-area existem', () => {
    for (const util of ['.pt-safe', '.pb-safe', '.pl-safe', '.pr-safe']) {
      expect(indexCss).toContain(util);
    }
    expect(indexCss).toContain('env(safe-area-inset-top');
  });

  // Problema: safe-area aplicada no body + no layout gerava faixa branca dupla.
  it('o body não aplica padding de safe-area (evita contagem dupla)', () => {
    const body = indexCss.slice(indexCss.indexOf('body {'), indexCss.indexOf('body {') + 900);
    expect(body).not.toMatch(/padding(-top|-bottom)?:\s*env\(safe-area/);
  });
});

describe('regressão mobile: rolagem', () => {
  // Problema: tabela larga travava a rolagem vertical da página.
  it('somente [data-table-wrapper] rola horizontalmente', () => {
    expect(indexCss).toContain('[data-table-wrapper]');
    expect(indexCss).toMatch(/\[data-table-wrapper\][\s\S]{0,400}overflow-x:\s*auto/);
  });

  it('nada global bloqueia a rolagem vertical (sem overflow:hidden no html/body)', () => {
    const htmlBody = indexCss.slice(0, indexCss.indexOf('/* Utilities de safe-area'));
    expect(htmlBody).not.toMatch(/\bhtml\s*,?\s*body\s*{[^}]*overflow:\s*hidden/);
  });

  // Problema: textos longos e imagens estouravam a largura em telas de 320px.
  it('quebra de palavra e largura máxima globais estão ativas', () => {
    expect(indexCss).toMatch(/overflow-wrap:\s*(break-word|anywhere)/);
    expect(indexCss).toMatch(/max-width:\s*100%/);
  });
});

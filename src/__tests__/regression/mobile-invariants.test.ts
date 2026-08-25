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

describe('regressão mobile: anti-zoom iOS (fonte ≥16px em TODO campo de texto)', () => {
  // Problema real (2026-08): blocos de "densidade mobile" reduziam a fonte de
  // inputs/selects/textareas para ~10-12px (0.8rem sobre root de 13px, regras
  // de diálogo, barras de filtro e página de configurações). O Safari e o PWA
  // ampliavam a tela ao focar o campo e ela NÃO retornava ao normal depois,
  // tornando o app inutilizável no iPhone. A correção NÃO pode usar
  // user-scalable=no nem maximum-scale=1 (zoom manual é acessibilidade).
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;

  it('nenhuma regra de CSS reduz input/select/textarea/contenteditable abaixo de 16px', () => {
    const violations: string[] = [];
    for (const m of indexCss.matchAll(ruleRe)) {
      const selector = m[1];
      const body = m[2];
      if (!/\b(input|select|textarea)\b|contenteditable/i.test(selector)) continue;
      if (selector.includes('::-')) continue; // pseudo-elementos internos (ex.: ícone do picker)
      // Regras exclusivas de checkbox/radio não são campos de texto.
      if (/\[type=["']?(checkbox|radio)/.test(selector) && !/:not\(\[type=["']?(checkbox|radio)/.test(selector)) continue;
      for (const decl of body.matchAll(/font-size:\s*([^;!}]+)/g)) {
        const value = decl[1].trim();
        if (value.includes('max(16px')) continue;
        if (value === 'inherit' || value.startsWith('var(')) continue;
        const num = parseFloat(value);
        if (value.endsWith('px') && num < 16) {
          violations.push(`${selector.trim()} → ${value}`);
        }
        // root mobile é 13px: rem/em precisa ser ≥ 1.24 para garantir 16px.
        if ((value.endsWith('rem') || value.endsWith('em')) && num < 1.24) {
          violations.push(`${selector.trim()} → ${value} (pode computar <16px com root de 13px)`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('existe uma regra final anti-zoom para telas de toque/estreitas', () => {
    expect(indexCss).toContain('ANTI-ZOOM iOS');
    expect(indexCss).toMatch(/\(pointer:\s*coarse\)/);
    expect(indexCss).toMatch(/font-size:\s*max\(16px,\s*1em\)\s*!important/);
  });

  it('a densidade mobile NÃO reduz a fonte de campos (apenas padding/altura)', () => {
    // Bloco <480px e tablet: inputs devem estar em 16px fixos.
    const smallBlock = indexCss.slice(indexCss.indexOf('@media (max-width: 479px)'), indexCss.indexOf('@media (min-width: 480px) and (max-width: 767px)'));
    const tabletBlock = indexCss.slice(indexCss.indexOf('@media (min-width: 480px) and (max-width: 767px)'), indexCss.indexOf('GLOBAL RESPONSIVE LAYER'));
    for (const block of [smallBlock, tabletBlock]) {
      const inputRule = block.match(/input,\s*select,\s*textarea\s*\{[^}]*\}/)?.[0] ?? '';
      expect(inputRule).toContain('font-size: 16px !important');
    }
  });

  it('nenhuma fonte/trava de zoom proibida (user-scalable=no, maximum-scale=1, gesture*)', () => {
    const cssSemComentarios = indexCss.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const src of [indexHtml, cssSemComentarios, mainTsx]) {
      expect(src).not.toContain('user-scalable=no');
      expect(src).not.toMatch(/maximum-scale=1(\.0)?\b/);
      expect(src).not.toMatch(/gesture(start|end|change)/);
    }
  });

  it('campo focado tem margem de rolagem para não ficar escondido atrás do teclado', () => {
    expect(indexCss).toMatch(/input:focus[\s\S]{0,200}scroll-margin-top/);
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
    expect(indexCss).toMatch(/calc\([^;]*--kb-inset/);
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

/**
 * Regressão do enquadramento em celular (correção 2026-09-15).
 *
 * Bugs originais:
 *  - iPhone: aviso do topo fora da altura do app -> tela cortada e texto
 *    embaixo do relógio/bateria.
 *  - Android: faixa de abas de 5 colunas colapsada pela regra global de grid
 *    virava duas linhas e escrevia por cima do conteúdo (Produtos > detalhes).
 *  - Diálogos limitados a 90vh -> rodapé de ações cortado.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const indexCss = read('src/index.css');
const appLayout = read('src/components/layout/AppLayout.tsx');
const protectedRoute = read('src/components/ProtectedRoute.tsx');
const bannerSlot = read('src/components/layout/ChromeBannerSlot.tsx');
const tabs = read('src/components/ui/tabs.tsx');

describe('aviso do topo não corta a tela', () => {
  it('AppLayout desconta a altura do aviso e o teclado', () => {
    expect(appLayout).toMatch(/height:\s*'calc\(100dvh - var\(--kb-inset, 0px\) - var\(--app-banner-h, 0px\)\)'/);
    expect(appLayout).toMatch(/maxHeight:\s*'calc\(100dvh - var\(--kb-inset, 0px\) - var\(--app-banner-h, 0px\)\)'/);
  });

  it('o aviso é renderizado dentro do ChromeBannerSlot', () => {
    expect(protectedRoute).toContain('ChromeBannerSlot');
    expect(protectedRoute).toMatch(/<ChromeBannerSlot>\{banner\}<\/ChromeBannerSlot>/);
  });

  it('o slot mede a altura e reserva a safe-area do topo', () => {
    expect(bannerSlot).toContain('--app-banner-h');
    expect(bannerSlot).toContain('ResizeObserver');
    expect(bannerSlot).toContain('pt-safe');
  });
});

describe('abas nunca sobrepõem o conteúdo no celular', () => {
  it('TabsList tem altura automática (não corta nem vaza)', () => {
    expect(tabs).toContain('h-auto min-h-10');
    expect(tabs).not.toMatch(/inline-flex h-10 items-center/);
  });

  it('regra global de colapso de grid não atinge barras de abas', () => {
    const collapse = indexCss.slice(
      indexCss.indexOf('.grid.grid-cols-3:not(.no-mobile-collapse)'),
      indexCss.indexOf('/* Barras de abas no celular'),
    );
    const selectors = collapse.match(/\.grid\.grid-cols-\d:not\([^\n]*/g) ?? [];
    expect(selectors.length).toBeGreaterThan(3);
    for (const sel of selectors) {
      expect(sel).toContain(':not([role="tablist"])');
    }
  });

  it('barra de abas rola em uma única linha em telas até 767px', () => {
    const block = indexCss.slice(indexCss.indexOf('/* Barras de abas no celular'));
    expect(block).toMatch(/flex-wrap:\s*nowrap/);
    expect(block).toMatch(/overflow-x:\s*auto/);
    expect(block).toMatch(/grid-template-columns:\s*none/);
    expect(block).toMatch(/white-space:\s*nowrap/);
  });
});

describe('diálogos mantêm o rodapé de ações visível', () => {
  it('altura máxima usa dvh com teclado e safe-area (nunca 90vh)', () => {
    expect(indexCss).not.toMatch(/max-height:\s*90vh/);
    expect(indexCss).toMatch(/\[role="dialog"\]\s*\{\s*max-height:\s*calc\(\s*100dvh/);
  });

  it('não force tamanho de fonte em textos de diálogo', () => {
    expect(indexCss).not.toMatch(/\[role="dialog"\] label \{[\s\S]{0,80}font-size/);
  });
});

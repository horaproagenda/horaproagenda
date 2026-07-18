/**
 * Guarda de regressão da marca visual.
 *
 * O ícone da tela de login já regrediu para um Sparkles genérico no passado.
 * Este teste garante que:
 *   1. `<BrandMark />` renderiza a imagem correta (`horapro-icon.png`)
 *      com `alt="Hora Pro"` e o marcador `data-brand-mark="hora-pro"`.
 *   2. Nenhuma tela de nível superior (Auth, Sidebar, Landing) esteja
 *      usando um lucide `<Sparkles>` dentro de um container de logo
 *      no lugar de `<BrandMark>`.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BrandMark } from '../BrandMark';

describe('BrandMark', () => {
  it('renderiza a imagem oficial do Hora Pro', () => {
    const { getByAltText, container } = render(<BrandMark />);
    const img = getByAltText('Hora Pro') as HTMLImageElement;
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('data-brand-mark')).toBe('hora-pro');
    expect(img.src).toMatch(/horapro-icon/);
    expect(container.querySelector('[data-brand-mark="hora-pro"]')).toBeTruthy();
  });

  it('tela de login usa <BrandMark /> no cabeçalho', () => {
    const source = readFileSync(resolve(__dirname, '../../../pages/Auth.tsx'), 'utf8');
    expect(source).toMatch(/from ['"]@\/components\/brand\/BrandMark['"]/);
    expect(source).toMatch(/<BrandMark\b/);
    // Não pode voltar ao Sparkles como placeholder de logo no header do login.
    expect(source).not.toMatch(/<Sparkles[^>]*text-primary-foreground/);
  });

  it('Sidebar e Landing continuam usando o ícone oficial da marca', () => {
    const files = [
      resolve(__dirname, '../../../components/layout/Sidebar.tsx'),
      resolve(__dirname, '../../../pages/Landing.tsx'),
    ];
    for (const path of files) {
      const source = readFileSync(path, 'utf8');
      expect(source, `${path} deve importar horapro-icon.png ou BrandMark`).toMatch(
        /horapro-icon\.png|components\/brand\/BrandMark/,
      );
    }
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

/**
 * Guarda contra regressão de marca:
 * Se qualquer arquivo de produção (`src/`, `public/`, `index.html`, `vite.config.ts`)
 * voltar a conter o nome antigo, o teste falha imediatamente — impedindo
 * que a marca antiga reapareça em qualquer parte do app.
 *
 * Para adicionar uma exceção legítima, use o array EXCEPTIONS abaixo.
 */

const FORBIDDEN = [/lume\s*agenda/i, /lumeagenda/i, /agendalume/i];

const ROOTS = ['src', 'public', 'index.html', 'vite.config.ts'];

// Arquivos onde a string é histórica (changelog, migrations) e não pode ser removida.
const EXCEPTIONS = new Set<string>([
  // Adicione caminhos relativos ao projeto se precisar de exceção.
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '__tests__']);
const TEXT_EXT = /\.(tsx?|jsx?|css|html|json|md|txt|xml|svg|webmanifest|toml)$/i;

function walk(p: string, acc: string[]) {
  const stat = statSync(p);
  if (stat.isFile()) {
    if (TEXT_EXT.test(p)) acc.push(p);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const name of readdirSync(p)) {
    if (SKIP_DIRS.has(name)) continue;
    walk(path.join(p, name), acc);
  }
}

describe('brand references', () => {
  it('does not contain legacy brand names anywhere in production code', () => {
    const files: string[] = [];
    for (const r of ROOTS) {
      try {
        walk(r, files);
      } catch {
        /* missing root, ignore */
      }
    }

    const offenders: { file: string; match: string }[] = [];
    for (const f of files) {
      const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
      if (EXCEPTIONS.has(rel)) continue;
      // Skip self
      if (rel.endsWith('brand-references.test.ts')) continue;
      const content = readFileSync(f, 'utf8');
      for (const re of FORBIDDEN) {
        const m = content.match(re);
        if (m) offenders.push({ file: rel, match: m[0] });
      }
    }

    if (offenders.length > 0) {
      const msg = offenders
        .map((o) => `  - ${o.file}: "${o.match}"`)
        .join('\n');
      throw new Error(
        `Marca antiga detectada em ${offenders.length} arquivo(s):\n${msg}\n\nUse BRAND.name de @/content/brand.`,
      );
    }

    expect(offenders).toEqual([]);
  });
});

// @ts-nocheck
/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

/**
 * Audita o uso de cores fixas (rosa / fucsia / coral / rose) em componentes.
 * A cor primária do app deve vir de --primary (token do tema, ajustável em
 * Configurações → Aparência). Categorias e gráficos podem usar palettes
 * próprias, mas componentes de UI nunca devem hardcodar essas famílias.
 */

const FORBIDDEN_PATTERNS = [
  /\b(bg|text|border|from|to|via|ring|fill|stroke|shadow|placeholder|caret|outline|decoration|accent)-(pink|fuchsia|rose|coral)-\d{2,3}\b/,
];

const ROOTS = ['src/components', 'src/pages'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);
const TEXT_EXT = /\.(tsx?|jsx?|css)$/i;

// Exceções legítimas (palettes de gráficos, mapeamento explícito por categoria).
const EXCEPTIONS = new Set<string>([
  'src/components/dashboard/ServicesDistribution.tsx',
  'src/components/financeiro/FinancialDashboard.tsx',
  'src/components/client-profile/ClientAppointmentsTab.tsx',
  'src/components/services/ManageProfessionalsDialog.tsx',
  'src/components/documentos/RichTextEditor.tsx',
]);

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

describe('theme colors audit', () => {
  it('no UI component uses hardcoded pink/fuchsia/rose/coral utilities', () => {
    const files: string[] = [];
    for (const r of ROOTS) {
      try { walk(r, files); } catch { /* ignore */ }
    }
    const offenders: { file: string; line: number; match: string }[] = [];
    for (const f of files) {
      const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
      if (EXCEPTIONS.has(rel)) continue;
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((ln, i) => {
        for (const re of FORBIDDEN_PATTERNS) {
          const m = ln.match(re);
          if (m) offenders.push({ file: rel, line: i + 1, match: m[0] });
        }
      });
    }
    if (offenders.length) {
      const msg = offenders.map((o) => `  - ${o.file}:${o.line} → ${o.match}`).join('\n');
      throw new Error(
        `Cores fixas rosa/fucsia/coral encontradas (${offenders.length}). Use tokens do tema:\n${msg}`,
      );
    }
    expect(offenders).toEqual([]);
  });
});

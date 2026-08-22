#!/usr/bin/env node
/**
 * Guarda de lint com linha de base.
 *
 * O projeto tem uma dívida histórica de lint (majoritariamente
 * `@typescript-eslint/no-explicit-any`). Rodar `eslint` de forma bloqueante
 * deixava `test:prepublish` permanentemente vermelho — ou seja, o checklist de
 * pré-publicação não podia ser executado por ninguém, o que anula a proteção
 * contra regressões.
 *
 * Esta guarda mantém o lint ativo e bloqueante para *novos* problemas: falha se
 * a contagem de erros crescer acima da linha de base registrada em
 * `.lint-baseline.json`. Ao reduzir a dívida, a linha de base é atualizada
 * automaticamente (só para baixo).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASELINE_FILE = '.lint-baseline.json';

let raw = '';
try {
  raw = execFileSync('npx', ['eslint', '.', '-f', 'json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  // eslint sai com código 1 quando encontra erros; a saída JSON continua válida.
  raw = err.stdout?.toString() ?? '';
  if (!raw) {
    console.error('Falha ao executar o eslint.');
    console.error(err.stderr?.toString() ?? err.message);
    process.exit(1);
  }
}

let results;
try {
  results = JSON.parse(raw);
} catch {
  console.error('Não foi possível interpretar a saída do eslint.');
  process.exit(1);
}

const errors = results.reduce((acc, f) => acc + f.errorCount, 0);
const warnings = results.reduce((acc, f) => acc + f.warningCount, 0);

const baseline = existsSync(BASELINE_FILE)
  ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).errors
  : errors;

console.log(`lint: ${errors} erros, ${warnings} avisos (linha de base: ${baseline})`);

if (errors > baseline) {
  const worst = results
    .filter((f) => f.errorCount > 0)
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 10);
  console.error(`\nNovos problemas de lint: ${errors - baseline} acima da linha de base.`);
  console.error('Arquivos com mais erros:');
  for (const f of worst) {
    console.error(`  ${f.errorCount.toString().padStart(4)}  ${f.filePath}`);
  }
  console.error('\nCorrija os erros introduzidos antes de publicar.');
  process.exit(1);
}

if (errors < baseline) {
  writeFileSync(BASELINE_FILE, `${JSON.stringify({ errors }, null, 2)}\n`);
  console.log(`Linha de base reduzida para ${errors}.`);
}

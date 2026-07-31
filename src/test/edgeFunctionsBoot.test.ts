import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guarda contra BOOT_ERROR nas edge functions.
 *
 * O erro "Function failed to start (BOOT_ERROR)" acontece quando uma função
 * importa um módulo local que não existe mais (ex.: `_shared/ultramsg.ts`
 * removido). Este teste percorre todas as funções e valida que todo import
 * relativo aponta para um arquivo existente dentro de `supabase/functions`.
 */
const FUNCTIONS_DIR = path.resolve(__dirname, '../../supabase/functions');

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const files = listTsFiles(FUNCTIONS_DIR);
const IMPORT_RE = /(?:from|import)\s+["'](\.[^"']+)["']/g;

describe('edge functions – imports locais (anti BOOT_ERROR)', () => {
  it('encontra arquivos de funções', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('todo import relativo resolve para um arquivo existente', () => {
    const broken: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(IMPORT_RE)) {
        const target = path.resolve(path.dirname(file), match[1]);
        if (!fs.existsSync(target)) {
          broken.push(`${path.relative(FUNCTIONS_DIR, file)} -> ${match[1]}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('nenhuma função referencia provedores removidos (twilio/ultramsg)', () => {
    const offenders = files.filter((file) =>
      /ultramsg|twilio/i.test(fs.readFileSync(file, 'utf8')),
    ).map((f) => path.relative(FUNCTIONS_DIR, f));
    expect(offenders).toEqual([]);
  });

  it('whatsapp-keepalive existe e é público (verify_jwt=false) para o cron', () => {
    expect(fs.existsSync(path.join(FUNCTIONS_DIR, 'whatsapp-keepalive/index.ts'))).toBe(true);
    const config = fs.readFileSync(path.resolve(__dirname, '../../supabase/config.toml'), 'utf8');
    expect(config).toContain('[functions.whatsapp-keepalive]');
  });

  it('o cliente Evolution expõe as ferramentas de reconexão automática', () => {
    const evolution = fs.readFileSync(path.join(FUNCTIONS_DIR, '_shared/evolution.ts'), 'utf8');
    expect(evolution).toContain('export async function evolutionRestart');
    expect(evolution).toContain('export async function evolutionEnsureConnected');
    expect(evolution).toContain('export async function evolutionSetSettings');
    expect(evolution).toContain('alwaysOnline');
  });
});

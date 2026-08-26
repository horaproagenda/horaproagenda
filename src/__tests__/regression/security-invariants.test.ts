/**
 * Regressão de segurança no frontend.
 *
 * Garantem que a proteção não seja "só visual" e que nenhum valor de
 * identidade venha do navegador. Falham se uma alteração futura reintroduzir
 * padrões já corrigidos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir))) {
    const rel = join(dir, entry);
    const abs = resolve(ROOT, rel);
    if (statSync(abs).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walk(rel, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(rel);
    }
  }
  return out;
}

const srcFiles = walk('src').filter(f => !f.includes('__tests__') && !f.endsWith('.test.ts'));
const sources = srcFiles.map(f => ({ file: f, code: read(f) }));

describe('regressão: nenhuma credencial privilegiada no frontend', () => {
  it('service_role nunca aparece no código do app', () => {
    const offenders = sources
      .filter(s => /service_role|SERVICE_ROLE_KEY/.test(s.code))
      .map(s => s.file);
    expect(offenders, `Arquivos com service_role: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('regressão: papel/permissão nunca vêm do navegador', () => {
  // Problema histórico: checagem de admin baseada em localStorage.
  it('nenhum controle de papel usa localStorage/sessionStorage', () => {
    const stripComments = (code: string) =>
      code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const bad = /(local|session)Storage\.[a-zA-Z]+\([^)]{0,80}(is_?admin|isAdmin|\brole\b|super_?admin)/i;
    const offenders = sources.filter(s => bad.test(stripComments(s.code))).map(s => s.file);
    expect(offenders, `Papel lido do storage em: ${offenders.join(', ')}`).toEqual([]);
  });

  it('usePermissions documenta que a UI não é a única barreira', () => {
    const code = read('src/hooks/usePermissions.ts');
    expect(code).toMatch(/RLS/);
    expect(code).toMatch(/can_see_record|can_write_record/);
  });
});

describe('regressão: rotas autenticadas continuam protegidas', () => {
  const app = read('src/App.tsx');
  const PROTECTED = [
    '/dashboard',
    '/agenda',
    '/clientes',
    '/servicos',
    '/cadastros',
    '/caixa',
    '/financeiro',
    '/produtos',
    '/relatorios',
    '/lembretes',
    '/documentos',
    '/configuracoes',
    '/usuarios-conta',
  ];

  for (const path of PROTECTED) {
    it(`${path} está dentro de ProtectedRoute`, () => {
      const line = app
        .split('\n')
        .find(l => l.includes(`path="${path}"`));
      expect(line, `Rota ${path} não encontrada`).toBeTruthy();
      expect(line!).toContain('ProtectedRoute');
    });
  }

  it('/admin exige role de administrador', () => {
    const line = app.split('\n').find(l => l.includes('path="/admin"'))!;
    expect(line).toContain('ProtectedRoute');
    expect(line).toContain('RequireRole');
    expect(line).toContain('admin');
  });

  it('/super-admin não é acessível pelo app', () => {
    const line = app.split('\n').find(l => l.includes('path="/super-admin"'))!;
    expect(line).toContain('Navigate');
  });
});

describe('regressão: salas compartilhadas usam a RPC restrita', () => {
  // Problema: agenda de sala compartilhada exibia cliente/serviço/valor de outro.
  it('a leitura de reservas compartilhadas passa por get_shared_room_bookings', () => {
    const hits = sources.filter(s => s.code.includes('get_shared_room_bookings'));
    expect(hits.length, 'nenhum consumidor da RPC de salas compartilhadas').toBeGreaterThan(0);
  });
});

describe('regressão: segredos em texto puro nunca são lidos pelo app', () => {
  // A senha temporária só sai pela RPC get_professional_temp_password (expira);
  // o SELECT da coluna temp_password foi revogado no banco.
  it('nenhum arquivo seleciona temp_password direto da tabela', () => {
    const offenders = sources
      .filter(s => /\.select\([^)]*temp_password/.test(s.code))
      .map(s => s.file);
    expect(offenders, `Selecionam temp_password: ${offenders.join(', ')}`).toEqual([]);
  });

  it('a senha temporária vem da RPC com expiração', () => {
    const code = read('src/components/services/ProfessionalCredentialView.tsx');
    expect(code).toMatch(/get_professional_temp_password/);
  });

  // Tokens do pool UltraMsg só são usados por funções SECURITY DEFINER.
  it('nenhum arquivo seleciona token_encrypted do pool', () => {
    const offenders = sources
      .filter(s => /\.select\([^)]*token_encrypted/.test(s.code))
      .map(s => s.file);
    expect(offenders, `Selecionam token_encrypted: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('regressão: mensagens de erro humanizadas', () => {
  // Problema: toasts exibiam constraint/código do Postgres ao usuário.
  it('o wrapper global de toast humaniza erros', () => {
    const toast = read('src/lib/toast.ts');
    expect(toast).toMatch(/humanize/i);
  });

  // O alias do Vite manda 'sonner' para o wrapper humanizado; o pacote real é
  // 'sonner-original'. Se o alias cair, toda notificação volta a ser crua.
  it('o alias sonner → src/lib/toast continua configurado no Vite', () => {
    const vite = read('vite.config.ts');
    expect(vite).toMatch(/sonner-original/);
    expect(vite).toMatch(/\^sonner\$/);
    expect(vite).toMatch(/lib\/toast/);
  });

  it('nenhum arquivo do app importa sonner-original direto (só o wrapper)', () => {
    const offenders = sources
      .filter(s => !s.file.startsWith('src/lib/toast'))
      .filter(s => /from\s+['"]sonner-original['"]/.test(s.code))
      .map(s => s.file);
    expect(offenders, `Importam sonner-original direto: ${offenders.join(', ')}`).toEqual([]);
  });
});

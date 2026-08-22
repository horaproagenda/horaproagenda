/**
 * Invariantes funcionais validados na auditoria de 2026-08-22.
 *
 * Cada caso aqui cobre um problema real encontrado na auditoria. Se alguém
 * remover a guarda de clique duplo, o tratamento de erro ou a semântica das
 * páginas públicas, este arquivo falha antes da publicação.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!/node_modules|__tests__/.test(full)) walk(full, out);
    } else if (/\.tsx?$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

describe('auditoria funcional: cliques duplos', () => {
  it('a guarda de ação existe e bloqueia a segunda chamada antes do re-render', () => {
    const src = read('src/hooks/useActionGuard.ts');
    expect(src).toContain('useRef');
    expect(src).toContain('if (lock.current) return');
    expect(src).toContain('finally');
  });

  const financialButtons: Array<[string, string[]]> = [
    ['src/components/financeiro/CategoriasFinanceiras.tsx', ['categoryGuard', 'entryGuard']],
    ['src/components/financeiro/ContasAPagar.tsx', ['submitGuard', 'paymentGuard']],
  ];

  it.each(financialButtons)('%s protege os botões que criam lançamentos', (file, guards) => {
    const src = read(file);
    for (const guard of guards) {
      expect(src).toContain(`${guard}.run(`);
      expect(src).toContain(`disabled={${guard}.running}`);
    }
  });

  it('nenhum botão de ação assíncrona fica sem `disabled` nos arquivos auditados', () => {
    const auditados = [
      'src/components/financeiro/CategoriasFinanceiras.tsx',
      'src/components/financeiro/ContasAPagar.tsx',
      'src/components/services/NewCategoryDialog.tsx',
      'src/pages/Unsubscribe.tsx',
    ];
    const offenders: string[] = [];
    for (const file of auditados) {
      const src = read(file);
      const re = /<Button\b[\s\S]{0,600}?>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const tag = m[0];
        const isAction =
          /type="submit"/.test(tag) ||
          /onClick=\{[^}]*(?:Guard\.run|confirm|handleSubmit|handleConfirmPayment)/.test(tag);
        if (isAction && !/disabled=/.test(tag)) offenders.push(`${file}: ${tag.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('auditoria funcional: nenhuma ação sem resposta', () => {
  it('toda useMutation informa o usuário quando falha', () => {
    const files = walk('src');
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const re = /useMutation\(\{[\s\S]*?\n(?: {2})?\}\);/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (!/onError/.test(m[0])) {
          offenders.push(`${file}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('mensagens de erro do financeiro e do estoque são em linguagem clara', () => {
    expect(read('src/hooks/useBoletoInstallments.ts')).toContain(
      'Não foi possível marcar a parcela como paga',
    );
    expect(read('src/hooks/useProductConsumption.ts')).toContain(
      'Não foi possível registrar o consumo do produto',
    );
    expect(read('src/hooks/useWaitlist.ts')).toContain(
      'Não foi possível remover da lista de espera',
    );
  });
});

describe('auditoria funcional: páginas públicas', () => {
  it('404 é em português, não recarrega a página e permite voltar', () => {
    const src = read('src/pages/NotFound.tsx');
    expect(src).toContain('Página não encontrada');
    expect(src).toContain('<Link to="/">');
    expect(src).toContain('navigate(-1)');
    expect(src).not.toContain('Return to Home');
    expect(src).not.toMatch(/<a href="\//);
  });

  it('404 não é indexado pelos buscadores', () => {
    expect(read('src/pages/NotFound.tsx')).toContain('noindex');
  });

  const publicas: Array<[string, string]> = [
    ['src/pages/Contato.tsx', 'Contato'],
    ['src/pages/TermosDeServico.tsx', 'Termos de Serviço'],
    ['src/pages/PoliticaDePrivacidade.tsx', 'Política de Privacidade'],
  ];

  it.each(publicas)('%s tem exatamente um H1 com o título da página', (file, titulo) => {
    const src = read(file);
    const h1s = src.match(/<h1[\s>]/g) ?? [];
    expect(h1s).toHaveLength(1);
    expect(src).toContain(titulo);
  });
});

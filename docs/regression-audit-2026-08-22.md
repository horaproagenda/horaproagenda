# Auditoria anti-regressão — 22/08/2026

## 1. Erros já corrigidos anteriormente (revisados)

Foram revisados os fluxos com histórico de regressão: autenticação e troca de
senha, primeiro Administrador, permissões por módulo/ação/escopo, privacidade
de clientes/serviços/pacotes/produtos, salas compartilhadas, agenda (dias não
trabalhados, remarcação de pacote sequencial, duração > 8h, troca de
visualização), financeiro (vendas de hoje x valores já pagos, cascata de
lançamentos), estoque (consumo manual/automático e conversões), documentos
(rich text, `{data_extenso}`), WhatsApp (preview, confirmação, loop de
"não entendi") e layout mobile (dvh, teclado, safe-area, rolagem).

### Regressões ativas encontradas

| # | Problema identificado | Causa provável | Arquivos afetados | Função afetada | Correção aplicada |
| - | --------------------- | -------------- | ----------------- | -------------- | ----------------- |
| 1 | Utilitários `h-screen` / `min-h-screen` continuavam resolvendo para `100vh` puro em 34 telas (Landing, Contato, PreencherDocumento, Assinatura…), reintroduzindo o corte de conteúdo atrás da barra do Safari no iPhone | A correção anterior trocou `100vh` por `100dvh` só em `body` e na `AppLayout`; as classes utilitárias do Tailwind ficaram sem override | `src/index.css` | utilitários de altura de tela | Override global `.min-h-screen` / `.h-screen` com fallback `100vh` + `100dvh` |
| 2 | Nenhuma trava impedia que correções validadas fossem desfeitas por edições futuras (o problema relatado) | Correções existiam no código, mas sem teste que falhe quando alguém as remove | novos testes + docs | — | 3 suítes de regressão + lista de comportamentos protegidos + runbook |

### Verificações sem regressão detectada

- **Componentes duplicados:** não há duas implementações ativas do mesmo
  fluxo; `WhatsappInboundPanel` (removido) e `/super-admin` (redirecionado)
  não voltaram.
- **Regras diferentes desktop/mobile:** a lógica de grade da agenda continua
  centralizada em `src/lib/agendaGrid.ts`; a UI apenas consome.
- **Versões antigas de componentes:** nenhuma referência remanescente.
- **Frontend x backend:** `src/lib/permissions.ts` continua espelhando
  `perm` / `can_see_record` / `can_write_record` da RLS.
- **RLS:** leitura anônima bloqueada em 37 tabelas sensíveis (teste novo).
- **Alias de notificações:** `sonner` → `src/lib/toast.ts` intacto, então toda
  notificação continua passando por `humanizeError`.

## 2. Correções aplicadas

1. `src/index.css` — altura de tela sempre em `dvh` nos utilitários.
2. `package.json` — novo script `test:prepublish`
   (lint → typecheck → unit → build → e2e → smoke).

## 3. Testes criados

| Arquivo | Cobertura | Testes |
| ------- | --------- | ------ |
| `src/lib/__tests__/permissions.regression.test.ts` | permissões por módulo/ação/escopo, clientes/serviços/pacotes/produtos privados e compartilhados, ocultação de valores, presets | 19 |
| `src/__tests__/regression/mobile-invariants.test.ts` | viewport/zoom iOS, `100dvh`, `--kb-inset` (teclado Android), safe-areas, rolagem vertical e horizontal de tabelas, overflow em 320px | 12 |
| `src/__tests__/regression/security-invariants.test.ts` | ausência de `service_role` no frontend, papel nunca vindo do navegador, rotas protegidas, `/admin` com role, RPC de salas compartilhadas, alias de notificações humanizadas | 25 |
| `tests/smoke/rls-anon-lockdown.smoke.test.ts` | RLS: anônimo não lê 37 tabelas sensíveis | 37 |

## 4. Testes executados (22/08/2026)

- `bunx vitest run` → **502 testes, 69 arquivos, todos verdes**
  (inclui as 3 novas suítes de regressão).
- `bunx vitest run --config vitest.smoke.config.ts tests/smoke/rls-anon-lockdown.smoke.test.ts`
  → **37/37 verdes** (nenhuma tabela sensível legível por anônimo).
- Build de produção: verificado pelo pipeline automático após as edições.

## 5. Arquivos alterados

- `src/index.css`
- `package.json`
- `docs/protected-behaviors.md` (novo)
- `docs/release-runbook.md` (novo)
- `docs/release-log.md` (novo)
- `docs/regression-guardrails.md` (atualizado)
- `src/lib/__tests__/permissions.regression.test.ts` (novo)
- `src/__tests__/regression/mobile-invariants.test.ts` (novo)
- `src/__tests__/regression/security-invariants.test.ts` (novo)
- `tests/smoke/rls-anon-lockdown.smoke.test.ts` (novo)

## 6. Migrations criadas

Nenhuma. Esta etapa não alterou schema nem policies — só adicionou guardas de
verificação. Toda mudança futura de banco segue `docs/release-runbook.md` §2
(migration versionada, RLS preservada, rollback documentado).

## 7. Publicação e validação

- Versão a publicar: ver `docs/release-log.md` (entrada de 22/08/2026).
- Validação em produção após publicar: login, agenda, financeiro e um
  documento — registrar o resultado no mesmo arquivo.

## 8. Procedimento de rollback

1. Frontend: restaurar a versão estável anterior indicada em
   `docs/release-log.md` pelo histórico do Lovable e publicar de novo.
2. Banco: aplicar a migration inversa descrita no cabeçalho da migration ou
   restaurar o backup criado no passo 1 do runbook.
3. Rodar `bun run test:prepublish` na versão restaurada antes de reabrir o
   acesso.

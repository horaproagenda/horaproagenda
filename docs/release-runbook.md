# Runbook de publicação segura

Objetivo: nenhuma correção validada é perdida por uma alteração futura.
Este runbook é obrigatório antes de clicar em **Publish/Update**.

## 0. Antes de alterar código (auditoria)

1. Ler `docs/protected-behaviors.md` e identificar quais itens a mudança toca.
2. Procurar componentes duplicados que fazem a mesma função
   (`rg -n "<NomeDoComponente" src` — se houver dois, consolidar em um).
3. Conferir se existe regra separada para desktop e mobile no mesmo fluxo
   (regra deve viver em um único arquivo de lógica; a UI só consome).
4. Conferir se frontend e backend concordam: toda permissão do frontend deve
   existir em RLS (`perm`, `can_see_record`, `can_write_record`).
5. Nunca substituir arquivo inteiro quando um patch pontual resolve.
6. Registrar o relatório de mudança (modelo abaixo).

### Modelo de relatório de mudança

```text
Problema identificado:
Causa provável:
Arquivos afetados:
Função afetada:
Correção planejada:
Comportamentos protegidos tocados (nº de protected-behaviors.md):
Testes necessários:
```

## 1. Ambientes

| Ambiente | Onde | Dados |
| -------- | ---- | ----- |
| Desenvolvimento | preview do Lovable | dados de teste da clínica de teste |
| Testes | usuário `SMOKE_TEST_EMAIL` (clínica de teste, dados fictícios) | criados e removidos pelos smoke tests (prefixo `__smoke_`) |
| Produção | `horaproagenda.app` | dados reais — **nunca** usados para testar |

Variáveis de ambiente separadas: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `SMOKE_TEST_EMAIL`, `SMOKE_TEST_PASSWORD`.
Todo dado criado em teste usa `tag()` (`tests/smoke/setup.ts`) para ser
identificável e removível.

## 2. Banco de dados (Supabase)

- Toda mudança de schema/RLS entra por **migration versionada**
  (`supabase/migrations/`), nunca por alteração manual em produção.
- Cada migration precisa: preservar dados existentes, manter RLS habilitada,
  não remover policy de segurança e ter rollback descrito no comentário do topo.
- Depois de qualquer migration, rodar `bun run test:smoke` e revalidar:
  isolamento por clínica e unidade, clientes privados/compartilhados,
  serviços, pacotes, produtos, agenda, salas compartilhadas,
  financeiro e documentos.

## 3. Sequência obrigatória antes de publicar

```bash
bun run test:prepublish
```

Executa, em ordem, e aborta na primeira falha:
lint → typecheck → unit (inclui os testes de regressão) → build → e2e → smoke.

Checklist completo:

1. Backup do banco (Supabase → Database → Backups → criar backup manual).
2. Registrar a versão atual (ver §4) — é o ponto de rollback.
3. `bun run test:prepublish` verde.
4. Testar login, logout e recuperação de senha.
5. Testar dados privados x compartilhados com 2 usuários (Admin + Profissional).
6. Testar as funções principais: agendar, remarcar, cancelar, vender pacote,
   receber pagamento, baixar estoque, gerar documento.
7. iPhone (Safari): rolagem vertical, teclado, safe-area, sem zoom automático.
8. Android (Chrome): rolagem de tabelas, modais, menu inferior.
9. Desktop: sidebar, tabelas largas, atalhos, sem faixa branca.
10. Console e `/tmp/observability` sem erros novos.
11. Corrigir tudo que aparecer.
12. Rodar `bun run test:prepublish` novamente.
13. Publicar.
14. Validação rápida em produção (login + agenda + financeiro + 1 documento).
15. Registrar o resultado em `docs/release-log.md`.

**Se um teste crítico falhar, não publique.**

## 4. Versionamento e rollback

- Cada alteração fica no histórico do projeto com descrição clara: problema
  corrigido, arquivos alterados, testes executados.
- Antes de mudanças grandes, marcar uma **versão estável** em
  `docs/release-log.md` (data + resumo + hash/versão do Lovable).
- Rollback de frontend: restaurar a versão estável anterior no histórico do
  Lovable e publicar novamente.
- Rollback de banco: aplicar a migration inversa descrita no cabeçalho da
  migration ou restaurar o backup do passo 1.
- A versão estável anterior só é descartada depois da nova ser validada em
  produção.
- Não empilhar várias mudanças grandes sem testar cada etapa.

## 5. Monitoramento

- Erros de frontend e backend chegam em `/tmp/observability`
  (`build-errors.log`, `console-logs.log`, `runtime-errors.log`,
  `network-requests.log`) e nos logs das Edge Functions do Supabase.
- Falhas de autenticação, permissão e banco ficam em `audit_log` /
  `audit_logs` (usuário, ação, módulo, registro, data/hora, IP/dispositivo).
- Mensagens ao usuário passam sempre por `humanizeError` (`src/lib/toast.ts`):
  nunca expõem constraint, código ou detalhe de banco.

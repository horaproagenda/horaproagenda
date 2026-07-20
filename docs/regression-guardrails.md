# Guardrails Anti-Regressão

Camadas automáticas que bloqueiam merge/deploy quando algo quebra. Rodam
no GitHub Actions (`.github/workflows/ci.yml`) a cada push e pull request
em `main`. O job `regression-guard` só fica verde quando **todos** os
outros passam.

## Camadas

| Job              | O que valida                                                        | Comando local           |
| ---------------- | ------------------------------------------------------------------- | ----------------------- |
| `lint`           | ESLint em todo o projeto                                            | `bun run lint`          |
| `typecheck`      | `tsc --noEmit` — tipos TS estritos                                  | `bun run typecheck`     |
| `unit`           | Vitest (`src/**/*.test.ts`) — hooks, libs, componentes              | `bun run test:unit`     |
| `build`          | `vite build` de produção — detecta imports quebrados / chunks       | `bun run build`         |
| `e2e-visual`     | Playwright: regressão de utils + snapshots visuais da agenda        | `bun run test` + `bun run test:visual` |
| `smoke`          | Supabase real: fluxos críticos + guardas de integridade de banco    | `bun run test:smoke`    |

### Regressão visual
`e2e/agenda-layout-visual.spec.ts` compara screenshots pixel-a-pixel.
Para atualizar snapshots legítimos: `bunx playwright test --update-snapshots`.

### Guardas de banco (`tests/smoke/db-integrity.smoke.test.ts`)
Detectam regressões que já quebraram o app:
- agendamentos com duração > 8h;
- snapshots de nome de serviço/pacote ausentes;
- contas acima do `seat_limit`.

Precisam de credenciais no GitHub → Settings → Secrets:
- `SMOKE_TEST_EMAIL`
- `SMOKE_TEST_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Sem os secrets, o job passa (`describe.skip`) — mas recomendamos configurar.

## Rodar tudo localmente antes de subir

```bash
bun run test:regression
```

Executa lint → typecheck → unit → build → e2e regression. Falha em
qualquer etapa aborta a sequência.

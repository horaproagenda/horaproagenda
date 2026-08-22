# Log de versões

Registro de cada publicação. A versão estável mais recente é o ponto de
rollback. Não descartar a anterior antes da validação em produção.

Modelo de entrada:

```text
## AAAA-MM-DD — <resumo>
Estável anterior:
Problema corrigido:
Arquivos alterados:
Migrations:
Testes executados:
Publicado por:
Validação em produção:
Rollback (se aplicado):
```

---

## 2026-08-22 — Guardas anti-regressão (candidata a versão estável)

- **Estável anterior:** versão publicada antes desta data no histórico do
  Lovable (mobile hardening) — manter disponível para rollback.
- **Problema corrigido:** correções validadas voltavam a quebrar após novas
  alterações; `h-screen`/`min-h-screen` ainda usavam `100vh` puro (regressão de
  layout no iPhone).
- **Arquivos alterados:** `src/index.css`, `package.json`, novos testes de
  regressão em `src/__tests__/regression/`, `src/lib/__tests__/`,
  `tests/smoke/`, documentação em `docs/`.
- **Migrations:** nenhuma.
- **Testes executados:** `vitest run` → 502/502 verdes;
  `rls-anon-lockdown.smoke` → 37/37 verdes; build de produção verde.
- **Publicado por:** —
- **Validação em produção:** — (preencher após publicar: login, agenda,
  financeiro, documento)
- **Rollback:** não aplicado.

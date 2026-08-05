---
name: Notificações humanizadas
description: Toda notificação/toast passa por humanizeError; proibido exibir códigos de erro, constraints ou texto técnico ao usuário
type: feature
---
- `src/lib/humanError.ts` traduz qualquer erro (string, Error, Postgres/PostgREST, Supabase Auth, HTTP, rede, chunk) em explicação clara em PT-BR, com o que aconteceu e o que fazer.
- `src/lib/toast.ts` substitui globalmente o pacote `sonner` via alias no Vite/Vitest/tsconfig (`sonner` -> `src/lib/toast.ts`, pacote real via `sonner-original`). Todo `toast(...)`, `toast.error/success/warning/info/message` e a `description` são humanizados automaticamente.
- O hook legado `src/hooks/use-toast.ts` também humaniza `title` e `description`.
- Regra: nunca exibir código de erro, número de status, nome de constraint ou mensagem em inglês em notificações. Ao adicionar novas mensagens, escrever contexto + explicação (ex.: "Erro ao salvar cliente: ...").

# Smoke Tests

Testes automatizados de fumaça que validam fluxos críticos via API Supabase.

## Como rodar

```bash
SMOKE_TEST_EMAIL=seu-email@dominio.com \
SMOKE_TEST_PASSWORD=suasenha \
bunx vitest run --config vitest.smoke.config.ts
```

Sem as variáveis, todos os testes ficam em `skip` com instrução clara.

## O que cobrem

- `appointments.smoke.test.ts` — criação, edição, cancelamento
- `inventory.smoke.test.ts` — estoque decrementa ao concluir agendamento
- `payments.smoke.test.ts` — venda paga gera entrada no caixa
- `packages.smoke.test.ts` — pacote standard e sequential com etapa
- `commission.smoke.test.ts` — leitura da configuração de comissão
- `realtime.smoke.test.ts` — INSERT em appointments propaga via WebSocket

## Limpeza

Cada arquivo limpa as entidades criadas no `afterAll`. Tudo recebe sufixo `__smoke_<timestamp>` para facilitar identificar/limpar manualmente em caso de falha.

## Recomendação

Use uma conta de teste (admin) dedicada — não a conta principal de produção.

# Corrigir falha ao criar agendamentos ("conflitos" falsos e erro genérico)

## Causa raiz confirmada

Os logs da função `create-appointment` mostram, em cada tentativa de criação, o erro real do banco:

```text
Insert error: { code: "42703", message: "column pp.professional_id does not exist" }
```

O gatilho `tg_block_non_working_days()` (que bloqueia domingos/sábados) consulta as preferências do profissional assim:

```sql
FROM public.professional_preferences pp
WHERE pp.professional_id = NEW.professional_id
```

Mas a tabela `professional_preferences` **não tem** a coluna `professional_id` — ela é ligada pelo `user_id` do profissional (confirmado no schema). Resultado: **qualquer** agendamento com profissional selecionado quebra o gatilho, e nenhum registro é inserido.

Isso explica as duas mensagens:
- "0 agendamentos criados. Sessões 1, 2, 3, 4 tiveram conflitos" — a criação de séries trata qualquer falha como se fosse conflito de horário, mesmo quando o erro é outro.
- "Erro ao criar agendamento: Não foi possível concluir esta ação agora…" — mensagem genérica exibida para o erro técnico do gatilho.

## O que será corrigido

1. **Gatilho de dias não atendidos**: corrigir a consulta para resolver o `user_id` do profissional (via tabela `professionals`) antes de ler `professional_preferences`, mantendo a regra: preferência do profissional prevalece sobre a configuração do estabelecimento; sem preferência, vale o estabelecimento. Agendamentos voltam a ser criados normalmente e o bloqueio de domingo continua funcionando.

2. **Mensagens honestas na criação em série**: no fluxo de séries/pacotes, deixar de rotular toda falha como "conflito". Cada sessão que falhar passa a mostrar o motivo real devolvido pelo servidor (ex.: fora do horário de funcionamento, profissional ocupado, dia não atendido), já em português e sem códigos técnicos, seguindo o padrão de notificações humanizadas do app.

3. **Varredura preventiva**: revisar as demais funções/gatilhos ligados a agendamento que leem preferências do profissional para garantir que todas usam a coluna correta, evitando que o mesmo tipo de erro volte por outro caminho.

## Verificação

- Testar criação de agendamento avulso com profissional em dia de semana (deve criar).
- Testar criação de série/pacote com 4 sessões (todas devem ser criadas).
- Testar tentativa em domingo com atendimento desligado (deve recusar com a mensagem clara de domingo).
- Testar conflito real (mesmo profissional, mesmo horário) — deve informar "Profissional ocupado".
- Conferir os logs da função `create-appointment` sem o erro `42703`.

## Detalhes técnicos

- Migração no banco: `CREATE OR REPLACE FUNCTION public.tg_block_non_working_days()` com o join corrigido (`professionals.user_id` → `professional_preferences.user_id`).
- Ajuste em `src/hooks/useRecurringAppointments.ts` para coletar e exibir o motivo real de cada sessão falha (usa `errors[].message` / `error` da resposta da Edge Function) em vez do texto fixo "tiveram conflitos".
- Ajuste equivalente na mensagem de falha de sessões em `src/components/appointments/NewAppointmentDialog.tsx`.

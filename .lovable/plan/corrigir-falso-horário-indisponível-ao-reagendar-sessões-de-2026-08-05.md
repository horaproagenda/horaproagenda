# Corrigir falso "horário indisponível" ao reagendar sessões de pacote

## Causa confirmada

O pacote "Axila + Virilha Completa" tem `duration = 760` minutos no cadastro (duração somada das 14 sessões, não de uma sessão). Os agendamentos reais desse pacote no banco têm 60 minutos cada — inclusive o de 13/08 às 19:00 e nenhum registro existe em 14/08 às 19:00.

Ao reagendar pelo gerenciador de sessões do pacote, a verificação de conflito usa `packageInfo.duration` cru (760 min). Assim, um horário de 19:00 passa a "ocupar" quase 13 horas (até ~07:40 do dia seguinte) e colide com qualquer atendimento do mesmo profissional na manhã seguinte — gerando o aviso de horário indisponível mesmo com a agenda livre.

Dois agravantes no mesmo fluxo:
- a lista de agendamentos usada na checagem só exclui `cancelled`; status `missed` e `rescheduled` (que não ocupam horário) entram como bloqueio;
- a busca traz agendamentos de todos os profissionais/salas visíveis e sem limite explícito, então pode ser truncada em 1000 linhas e ainda comparar registros irrelevantes.

## O que será corrigido

1. **Duração por sessão, não do pacote**: usar a duração real da sessão — duração do agendamento já existente, depois a duração do serviço da sessão, e só então a duração do pacote já sanitizada pelo utilitário existente (`getSchedulingDurationMinutes`, que descarta valores acima de 8h como erro de cadastro, caindo em 60 min).
2. **Aplicar a duração correta em todos os pontos**: pré-visualização de conflito, reagendamento de sessão única e reagendamento em massa (inclusive no cálculo do `end_time` gravado no agendamento, hoje também inflado).
3. **Filtro de bloqueio correto**: desconsiderar `cancelled`, `missed` e `rescheduled` na checagem de conflito.
4. **Busca de agenda escopada**: consultar só os agendamentos do profissional e/ou sala do pacote, com janela a partir de ontem e limite explícito, evitando truncamento silencioso.
5. **Mensagem de erro mais útil**: quando houver conflito real, informar data/hora do agendamento que está ocupando o horário, em vez de apenas "já possui atendimento neste horário".

## Verificação

- Reagendar a sessão de 13/08 19:00 para 14/08 19:00 e confirmar que salva sem aviso.
- Reagendar para um horário realmente ocupado do mesmo profissional e confirmar que o bloqueio continua aparecendo, com a referência do agendamento conflitante.
- Conferir no banco que o agendamento movido continua com 60 minutos (`end_time - start_time`) e que a sessão do pacote acompanhou a nova data.

## Detalhes técnicos

- Arquivo principal: `src/components/services/PackageSessionsManager.tsx` (`fetchPackageInfo`, `checkConflict`, `findNextAvailableSlot`, `handleReschedule`).
- Reutilização de `getSchedulingDurationMinutes` de `src/lib/duration.ts` (mesma proteção já usada no `AppointmentDetailDialog`).
- Sem mudanças de banco: o gatilho `appointment_has_conflict` já compara o intervalo real gravado e não é a origem do falso positivo.

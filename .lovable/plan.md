## Problema

No agendamento automático de pacotes, sessões podem terminar com 1 dia de intervalo (ex.: 29/08 → 30/08) mesmo com intervalo configurado de 30 dias.

Ao ler o código de `src/components/appointments/NewAppointmentDialog.tsx` (cálculo da prévia, resolução de conflitos e criação em lote) e `src/lib/packageScheduling.ts`, encontrei três pontos que quebram o intervalo:

1. **Intervalo zero vira 1 dia** — na montagem da prévia, o intervalo usado é `Math.max(intervalDays, 1)`. Etapas com `interval_after_days = 0` (existem no banco, ex.: última etapa dos pacotes "Axila + Virilha Completa" e "Buço + axila + virilha completa") geram gap de exatamente 1 dia em vez de cair no intervalo padrão do pacote.
2. **Resolver conflito quebra a corrente** — quando uma data tem conflito, a sugestão automática ("Usar: ..." / "Auto-resolver todos") pula para o próximo horário livre ou simplesmente `+1 dia`, e as sessões seguintes **não são recalculadas**. Assim uma sessão empurrada para 29/08 fica colada na seguinte, que continua em 30/08.
3. **Edição manual de uma data intermediária** também não propaga para as datas seguintes: só a data editada muda, o restante mantém as datas antigas.

(Não há, hoje, séries salvas no banco com gap de 1 dia menor que o intervalo — a quebra aparece na prévia/no momento da criação.)

## O que será feito

**1. Intervalo efetivo confiável (`NewAppointmentDialog.tsx`)**
- Criar helper para resolver o intervalo entre a etapa i-1 e a etapa i: usar `interval_after_days` da etapa anterior somente quando for um número > 0; caso contrário, cair para o intervalo do pacote (`interval_days`) e, por fim, para o padrão.
- Remover o `Math.max(intervalDays, 1)` como piso — o piso passa a ser o intervalo configurado do pacote.

**2. Recalcular a corrente sempre que uma data muda**
- Extrair a lógica de encadeamento (intervalo + dia útil/feriado + horário preferido) para um utilitário puro novo, `src/lib/autoScheduleChain.ts`, com função `rebuildChainFromIndex(dates, index, newDate, intervals, options)`.
- `updateEditableDate(index, newDate)` passa a recalcular todas as datas posteriores a partir da data editada, respeitando os intervalos de cada etapa. Datas anteriores ficam intocadas.
- O mesmo vale para aplicar uma sugestão de conflito e para "Auto-resolver todos".

**3. Sugestão de conflito respeita o intervalo mínimo**
- Ao procurar alternativa: primeiro tentar outros horários **no mesmo dia**; se não houver, avançar por dias úteis a partir do dia original — e, ao aplicar, reencadear as sessões seguintes (item 2), garantindo que nenhuma sessão fique a menos que o intervalo configurado da anterior.

**4. Guarda na criação em lote**
- No loop de criação, antes de `findNextAvailablePackageSlot`, garantir que `futureDate` seja pelo menos `dataAnterior + intervalo` (o `findNextAvailablePackageSlot` só desloca minutos, então mantém a data). Se o slot livre encontrado violar o intervalo, empurrar para o próximo dia útil válido.
- Adicionar validação de bloqueio no submit: se alguma sessão da prévia estiver com gap menor que o intervalo configurado, mostrar aviso com botão de correção automática.

## Testes / anti-regressão

- Novo arquivo `src/lib/__tests__/autoScheduleChain.test.ts` cobrindo:
  - intervalo de 30 dias mantido ao longo de N sessões;
  - `interval_after_days = 0/null` cai no intervalo do pacote (nunca 1 dia);
  - editar uma data intermediária reencadeia as posteriores mantendo o intervalo;
  - ajuste de dia útil/feriado nunca reduz o gap abaixo do intervalo.
- Rodar `bunx vitest run` e o typecheck.

## Detalhes técnicos

Arquivos afetados: `src/components/appointments/NewAppointmentDialog.tsx` (prévia, `updateEditableDate`, `previewDateConflicts`, auto-resolver, loop de criação), novo `src/lib/autoScheduleChain.ts`, novo teste. Nenhuma migração de banco necessária — a correção é de lógica de agendamento no cliente; dados já salvos não são alterados.

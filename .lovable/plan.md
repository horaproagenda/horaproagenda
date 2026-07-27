## Diagnóstico (verificado no código)

Em `src/components/appointments/NewAppointmentDialog.tsx`:

- Série de **pacotes** (auto-agendamento): `updateEditableDate` (linha 692) já usa `rebuildChainFromIndex`, então alterar uma data reencadeia as seguintes.
- Série de **serviços repetidos** ("Repetir serviço"): `updateEditableServiceDate` (linha ~710) apenas troca a data no índice editado — **as datas seguintes não são recalculadas**. É aqui que o usuário precisa corrigir cada data manualmente.
- Além disso, o efeito que sincroniza `editableServiceDates` com `calculateServicePreviewDates` reseta as edições sempre que qualquer dependência muda, e a série de serviços não passa por `enforceChainMinimums` (nenhuma verificação de intervalo mínimo/violação, ao contrário da série de pacotes).

## O que será feito

1. **Intervalos da série de serviços**
   - Criar `serviceChainIntervals` (array com `effectiveIntervalDays` repetido por `repeatCount - 1`) e `serviceChainOptions` (`intervals`, `isAllowedDay` = dia útil/sem feriado nacional ou dia da semana preferido, `preferredDayOfWeek: servicePreferredDayOfWeek`, `applyTime` com `preferredTime`), reutilizando `src/lib/autoScheduleChain.ts`.

2. **Propagação ao editar uma data de serviço**
   - `updateEditableServiceDate` passa a usar `rebuildChainFromIndex(prev, index, newDate, serviceChainOptions)`, recalculando todas as datas posteriores e mantendo as anteriores intactas.
   - Ao editar o índice 0, sincronizar `date`/`time` principais (mesmo comportamento já usado na série de pacotes).

3. **Aviso e correção de intervalo na série de serviços**
   - Calcular `serviceIntervalViolations` com `findChainViolations` e exibir o mesmo aviso "Corrigir intervalos" já existente na prévia de pacotes, aplicando `enforceChainMinimums`.

4. **Preservar as edições manuais**
   - No efeito que sincroniza `editableServiceDates`, comparar assinatura (timestamps concatenados) antes de sobrescrever — mesmo padrão já usado na prévia de pacotes — para que o reencadeamento não seja descartado por re-render.

5. **Criação em lote**
   - No loop de criação dos serviços repetidos, usar as datas de `editableServiceDates` já reencadeadas e garantir gap mínimo com `nextChainDate` antes de procurar slot livre, igual à série de pacotes.

## Testes

- Estender `src/lib/__tests__/autoScheduleChain.test.ts` com casos da série de serviços: editar a 2ª de 5 datas reencadeia as demais mantendo o intervalo; dia da semana preferido é respeitado; ajuste por feriado/dia útil nunca reduz o gap.
- Rodar `bunx vitest run` e o typecheck.

## Detalhes técnicos

Arquivos afetados: `src/components/appointments/NewAppointmentDialog.tsx` (novos memos de opções da série de serviços, `updateEditableServiceDate`, efeito de sincronização, aviso de violação, loop de criação) e `src/lib/__tests__/autoScheduleChain.test.ts`. Nenhuma alteração de banco de dados.

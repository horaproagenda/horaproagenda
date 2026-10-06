# Corrigir o desconto que não é gravado nos agendamentos repetidos

## O que foi confirmado
Conferi os 4 agendamentos que você acabou de criar (13/10, 20/10, 27/10 e 03/11). Os quatro estão ligados entre si como uma série, mas todos com desconto **R$ 0,00**. A série anterior, de 30/09, está igual.

## Causa
O desconto não é salvo junto com o agendamento. O app cria o agendamento sem desconto e só depois tenta acrescentá-lo, em uma segunda etapa que falha sem avisar:

1. **"Somente neste agendamento" (opção já marcada ao abrir o formulário):** o app espera 1,5 segundo e procura o primeiro agendamento pela data e hora. Mas os 4 agendamentos são criados um de cada vez e levaram cerca de 3 segundos. Por isso, a busca roda antes do primeiro ficar pronto ou não o encontra, e o desconto nunca é gravado. Nenhuma mensagem aparece.
2. **"Aplicar em todos":** o desconto só é acrescentado depois que cada agendamento é criado. Se essa etapa falhar, o agendamento fica sem desconto, também sem aviso.
3. **Agendamento único com desconto:** usa a mesma correção feita depois, com o mesmo risco.
4. **Na gravação do agendamento:** o desconto só é aceito quando já existe um pagamento informado. Sem pagamento, ele é ignorado.

## Correções
1. **O desconto é gravado no mesmo momento em que o agendamento é criado**, em uma única etapa, para qualquer tipo de agendamento, com ou sem pagamento.
2. **Na repetição automática**, cada sessão já é criada com o desconto certo:
   - em "Aplicar em todos", todas as sessões recebem os R$ 10;
   - em "Somente neste", só a 1ª sessão recebe.
   A busca atrasada de 1,5 segundo é removida.
3. **O desconto nunca pode ser maior que o valor do serviço.** O valor a receber é sempre calculado como preço menos desconto, e a situação (pendente, parcial ou pago) usa esse valor.
4. **Conferência depois de salvar:** se alguma sessão ficar sem o desconto pedido, o app avisa com uma mensagem clara.
5. **Escolha mais clara no formulário:** a opção mostra em qual sessão o desconto vale, por exemplo "Só na 1ª sessão" ou "Em todas as 4 sessões".
6. **Agendamentos já criados:** os 4 agendamentos de hoje não recebem os R$ 10 automaticamente. Você pode aplicar o desconto editando cada um, ou peço a sua autorização para corrigir esses 4.
7. **Teste de proteção:** confirma que a série é criada com desconto em todas as sessões ou só na 1ª, e que agendamentos sem pagamento também guardam o desconto.

## Detalhes técnicos
- `supabase/functions/create-appointment/index.ts`: aceitar `discount_amount` sempre e gravar no insert, com limite entre 0 e o preço do serviço. O `derivedStatus` passa a usar `preço - desconto`.
- `src/hooks/useRecurringAppointments.ts`: enviar `discount_amount` no corpo de cada `create-appointment`, conforme o novo parâmetro `discount_scope: 'all' | 'first'`. Tirar o desconto do `update` posterior, que mantém apenas `recurring_group_id`. Depois de salvar, conferir os agendamentos criados e mostrar aviso se houver divergência.
- `NewAppointmentDialog.tsx`: remover o `setTimeout` das linhas 1676 a 1698 e o update posterior da linha 1748; enviar o desconto no corpo da criação. Ajustar o rótulo do switch.
- Novo teste: `src/__tests__/regression/recurring-discount.test.ts`.
- Rodar `tsgo` e `bunx vitest run`.

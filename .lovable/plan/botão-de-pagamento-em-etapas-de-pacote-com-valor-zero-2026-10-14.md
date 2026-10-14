# Botão de pagamento em etapas de pacote com valor zero

## O que os dados mostram
- Hoje existem 68 agendamentos ativos de serviços que custam R$ 0,00.
- 18 deles estão ligados a um pacote. Desses, 7 estão com o pacote ainda não pago (ex.: pacote de R$ 1.500 com R$ 0 recebido).
- Os outros 50 não estão ligados a pacote nenhum. Em vários deles o cliente tem exatamente um pacote. Esses agendamentos são tratados como avaliação gratuita avulsa, então o botão de pagamento nunca aparece.
- A tela do agendamento só considera o pacote quando o vínculo existe e quando os dados dele foram carregados junto. Se o vínculo falta ou os dados não chegam, ela usa o preço da etapa (R$ 0) e esconde o botão.

## O que muda para a usuária
- Etapa de pacote (mesmo valendo R$ 0) mostra um bloco **Pacote vinculado**: nome, valor total, pago, saldo e status (Pago / Parcialmente pago / Pendente), com o botão **Ver pacote**.
  - Com saldo: botão **Dar baixa no pacote**. O pagamento é registrado no pacote, não na etapa.
  - Quitado: selo **Pacote pago**, sem botão de baixa.
- Serviço avulso com valor: continua **Dar baixa no pagamento**.
- Serviço avulso de R$ 0: nenhum botão de pagamento.
- Usar uma etapa do pacote nunca gera cobrança nova.
- Pagar duas vezes fica bloqueado: o servidor recusa uma baixa que ultrapasse o saldo do pacote.

## Correção dos agendamentos antigos
- O sistema procura agendamentos de R$ 0 sem vínculo cujo serviço seja uma etapa do único pacote ativo daquele cliente. Só esses são ligados ao pacote.
- Os casos ambíguos (cliente com mais de um pacote compatível, ou serviço que não faz parte do pacote) não são alterados. Antes, eu te mostro a lista.
- Nenhum pagamento já registrado é apagado ou recriado.
- Não mexo nos horários de Lívia Santana Duque.

## Detalhes técnicos
- Nova regra única em `src/lib/paymentAction.ts`: `getPaymentAction(appointment, pkg)` devolve `{ kind: 'package_pay' | 'package_paid' | 'single_pay' | 'none', balance }`. Ela decide primeiro pelo vínculo com o pacote e só depois pelo preço do serviço.
- `AppointmentDetailDialog` passa a usar essa regra no aviso de saldo, no botão e no bloco do pacote. Se o vínculo existir mas os dados do pacote não vierem junto, ela busca o pacote (total e valor recebido) pelo identificador do vínculo.
- O saldo do pacote é calculado pelo total do pacote menos o que foi recebido no pacote todo, e não pelo `amount_paid` da etapa.
- Uma migração liga as etapas sem vínculo de forma conservadora, por cliente + serviço da etapa + pacote ativo único, criando ou reaproveitando a sessão livre do pacote. Antes dela, roda uma consulta para listar os casos que seriam ligados.
- Uma trava no servidor impede registrar no pacote um recebimento acima do saldo.
- Testes de `getPaymentAction`, um por linha da tabela pedida: avulso R$ 0 sem baixa; pacote pendente "Dar baixa no pacote"; pacote pago "Pacote pago"; parcial mostra o saldo; avulso com valor mostra baixa individual; segunda baixa no mesmo saldo bloqueada.

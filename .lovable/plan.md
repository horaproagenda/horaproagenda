# Iago Henrique Gonçalves (conta lumeagenda54)

## O que a verificação mostrou
- O sistema não mistura nem liga as duas contas. Cada conta tem o seu próprio cadastro do Iago e os seus próprios serviços.
- Na conta lumeagenda54, 73 clientes entraram de uma vez em 20/07/2026. O pacote do Iago foi marcado em 27/07/2026, com o seu login, já como "Axila + braços + peito + costas + virilha + coxa + canela + dedos dos pés e mãos".
- Depois disso, nenhum processo automático trocou o serviço das aplicações. O registro de alterações confirma isso.

## O que vou fazer (como você escolheu)
1. As 3 aplicações que ainda não foram feitas (03/11/2026, 14/12/2026 e 18/01/2027) passam para o serviço "Axila, peito, abdomen, coxa, canela, dedos do pé" da sua conta lumeagenda54.
2. Ficam iguais: datas, horários, profissional, o valor de cada aplicação, o boleto parcelado e as aplicações já concluídas.
3. A troca fica registrada no histórico de alterações, com o motivo "correção solicitada pela proprietária".
4. Depois confiro se as 3 aplicações estão com o novo serviço e se nada mais mudou.

## Detalhes técnicos
- Atualizar `service_id` (f974719b…) e `service_name_snapshot` apenas nos agendamentos b3415236, 1cfe317c e cc218af7 (cliente 9dc4721f, dono 47165cc3).
- Não alterar `price_snapshot`, `amount_paid`, `payment_status`, `start_time`/`end_time` nem os boletos.
- Se alguma trava do banco bloquear a troca de serviço de sessão de pacote, paro e explico, sem forçar.

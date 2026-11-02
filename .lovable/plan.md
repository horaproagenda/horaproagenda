# Iago Henrique Gonçalves: o que aconteceu com as aplicações

## O que encontrei
Nenhum atendimento foi alterado. Existem **dois cadastros de "Iago Henrique Gonçalves"**, cada um em uma conta diferente do Hora Pro:

| Conta (login) | Cliente cadastrado em | Serviço das aplicações | Quem marcou |
|---|---|---|---|
| mariaterezacastro2@gmail.com (conta principal) | 21/03/2026 | Axila, peito, abdômen, coxa, canela, dedos do pé (R$ 350) | Maria Tereza, em 15/06/2026 |
| lumeagenda54@gmail.com (conta antiga "Lume Agenda") | 20/07/2026 | Axila + braços + peito + costas + virilha + coxa + canela + dedos dos pés e mãos (R$ 380, pacote de 9) | Conta lumeagenda54, em 27/07/2026 |

- Na conta principal, os 12 atendimentos continuam com o serviço original. As aplicações futuras (01/08, 29/08, 26/09, 24/10, 21/11, 19/12) não foram mexidas desde 06/07/2026. O registro de alterações também não mostra nenhuma mudança.
- O pacote "corpo inteiro" foi marcado em 27/07/2026, dentro da outra conta. As duas contas não compartilham dados.

**Causa:** você estava usando a conta lumeagenda54 quando viu a agenda, e lá o Iago tem o outro pacote. Não houve troca de serviço feita pelo sistema.

## O que proponho
1. **Não alterar nenhum dado.** Os atendimentos e o boleto parcelado de cada conta ficam como estão.
2. **Mostrar com qual conta você está entrando:** colocar o e-mail da conta no menu lateral e no topo, no celular e no computador. Assim fica fácil perceber quando você está na conta antiga.
3. **Se quiser,** você decide depois o que fazer com a conta lumeagenda54: manter, ou parar de usar. Não apago nada sem você pedir.

## Detalhes técnicos
- Clientes `52019b99…` (dono 60a460b5) e `9dc4721f…` (dono 47165cc3). O isolamento entre as contas (`account_owner_id` + RLS) funcionou como deveria.
- Item 2: usar o e-mail da sessão já carregado no layout. É só uma mudança de tela; a lógica fica igual.

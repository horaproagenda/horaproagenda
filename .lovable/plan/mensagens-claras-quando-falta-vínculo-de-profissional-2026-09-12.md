# Mensagens claras quando falta vínculo de profissional

## Problema

Um usuário com função de profissional que não tem cadastro correspondente na lista de profissionais fica sem nenhum agendamento visível (as regras de acesso escondem tudo) e, ao tentar salvar, recebe a mensagem enganosa "Este agendamento foi alterado por outro usuário".

Causa: quando as regras de acesso escondem a linha, a gravação simplesmente não retorna nada, e o aplicativo interpreta isso como disputa de edição entre usuários.

## O que muda

### 1. Aviso quando falta o vínculo
- Ao entrar na agenda, se o usuário tem função de profissional mas nenhum cadastro de profissional vinculado, aparece um aviso fixo no topo da página: explica que o cadastro dele ainda não está vinculado, que por isso a agenda aparece vazia, e orienta pedir ao administrador para vincular o acesso ao cadastro do profissional.
- O aviso substitui o texto genérico de "nenhum agendamento encontrado" nesse caso, para não parecer que a agenda está apenas vazia.

### 2. Mensagem correta ao salvar
- Ao salvar/editar/reagendar um agendamento, quando o salvamento é bloqueado por falta de permissão, a mensagem passa a ser de permissão — e, se o motivo for a ausência do vínculo, a mensagem diz exatamente isso e o que pedir ao administrador.
- A mensagem de "alterado por outro usuário" fica reservada para o caso real de outra pessoa ter alterado o registro.

## Detalhes técnicos

- `src/hooks/useCurrentProfessional.ts`: expor um estado explícito `hasProfessionalLink` (falso quando nem o vínculo direto nem o fallback por e-mail encontram cadastro), já resolvido antes das telas decidirem o que mostrar.
- `src/hooks/useAppointments.ts`: criar `AppointmentPermissionError` e `MissingProfessionalLinkError` ao lado do `AppointmentConflictError`. Antes de lançar conflito (nos pontos onde a linha ou o retorno vem vazio: leitura inicial, RPC de pacote, guarda de versão e fallback final), distinguir os casos:
  1. registro realmente não existe mais → conflito/registro removido;
  2. registro existe para o servidor mas não é retornado ao usuário → erro de permissão;
  3. usuário com função de profissional e sem cadastro vinculado → erro de vínculo ausente.
  A checagem 3 usa a mesma resolução por `user_id`/e-mail já existente (`get_professional_id_for_user`).
- `src/lib/humanError.ts`: mapear os novos erros e os códigos de violação de política (`42501`, `PGRST301`) para textos de permissão em linguagem clara, sem códigos.
- Agenda (`src/pages/Index.tsx` / componentes de agenda) e diálogos de agendamento: renderizar o aviso de vínculo ausente e usar a mensagem tratada nos `onError`.
- Nenhuma alteração de banco, de regras de acesso ou de permissões: só mensagens e um aviso na interface.

## Testes

- Teste de regressão garantindo que retorno vazio por permissão não produz mais a mensagem de concorrência.
- Teste garantindo que usuário profissional sem cadastro vinculado recebe a mensagem de vínculo ausente.
- Verificação de tipos e compilação.

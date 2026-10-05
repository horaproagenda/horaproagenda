# Corrigir o guia "Primeiros passos" na Agenda

## Causas encontradas
1. **Horários aparecem como feitos sem ninguém ter mexido.** O guia considera o passo feito quando o horário é diferente de 08:00 às 18:00. Mas toda conta nova já começa com 08:00 às 20:00, então o passo sempre aparece como feito. Ele também marca como feito quando a pessoa pula a configuração inicial.
2. **Horários salvos não são reconhecidos.** O horário de início e fim de cada profissional é salvo em "Minhas preferências" (Configurações), mas o guia procura em outro lugar. Na tela, os campos aparecem vazios porque o horário só aparece como dica cinza dentro do campo, e por isso parece que nada foi cadastrado.
3. **Formas de pagamento sempre aparecem como feitas.** Toda conta nova já recebe cerca de 9 formas de pagamento prontas (Pix, dinheiro, cartão etc.). O guia conta essas formas prontas como se a pessoa tivesse configurado.
4. **Documentos podem aparecer como feitos.** O guia conta também os modelos que já vêm prontos ou que são compartilhados, e não só os que a pessoa criou. Ainda falta confirmar isso em uma conta nova.
5. **Ações feitas demoram para aparecer como feitas.** O guia guarda o resultado da última conferência e não confere de novo logo depois que a pessoa cadastra um serviço, um cliente ou um documento.

## O que vou fazer
- **Horários:** marcar como feito só quando a pessoa salvar o horário de verdade. Vale tanto o horário do profissional em "Minhas preferências" quanto o horário geral do negócio alterado nas Configurações. Pular a configuração inicial deixa de marcar esse passo.
- **Horários na tela:** mostrar o horário atual do negócio já preenchido nos campos, com o aviso "horário padrão — ajuste se necessário", no lugar de campos vazios.
- **Formas de pagamento:** só marcar quando a pessoa criar, editar, ativar ou desativar uma forma de pagamento. As que vêm prontas deixam de contar.
- **Documentos e anamnese:** contar só os documentos criados pela própria conta (incluindo os modelos prontos que a pessoa escolher usar).
- **Serviços e clientes:** contar só o que é da própria conta.
- **Atualização na hora:** o guia confere de novo assim que algo é salvo e quando a pessoa volta para a Agenda.
- **Marcação manual:** continua existindo, ao tocar no círculo do passo.

## Testes
- Teste de proteção: uma conta nova, com os horários e formas de pagamento que já vêm prontos, deve começar com 0 de 5 passos feitos.
- Conferir no app com uma conta nova: o guia começa com 0 de 5, e cada passo é marcado na hora em que for feito.

## Detalhes técnicos
- `FirstStepsCard.tsx`: as contagens passam a filtrar `account_owner_id` (via `current_account_owner_id`).
- Horas: `professional_preferences.opening_time/closing_time` não nulos, ou `business_settings.updated_at > created_at` com horário alterado. Remover `onboarding_completed_at` da regra.
- Pagamentos: considerar só registros com `updated_at > created_at` ou criados depois da conta (os que vêm prontos têm o mesmo horário de criação da conta).
- Documentos: `document_templates` / `client_documents` da própria conta.
- `staleTime: 0`, `refetchOnWindowFocus`, e `invalidateQueries(['first-steps-progress'])` nos fluxos de salvar serviço, cliente, forma de pagamento, documento e preferências.
- Configurações: os campos de horário recebem o valor efetivo, em vez de mostrá-lo só como dica cinza.

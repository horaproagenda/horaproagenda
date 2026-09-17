# Voltar a editar agendamentos (agenda e perfil do cliente)

## O que está acontecendo hoje

Ao revisar o aplicativo, encontrei três situações que juntas explicam a sensação de que "o botão de editar sumiu":

1. **Na tela de detalhes do agendamento** o único acesso à edição é um lápis minúsculo, sem texto, no canto superior direito — e ele só aparece para Administrador e Recepção. Quem tem perfil de Profissional não vê nenhuma forma de editar, mesmo nos atendimentos que ele mesmo realiza.
2. **No perfil do cliente, na aba de agendamentos, não existe nenhuma ação de editar.** Clicar na linha só serve para selecionar o agendamento (exportar/WhatsApp). Não é possível abrir nem alterar o agendamento a partir dali.
3. **Nos cartões de agendamento** o menu com "Editar" só aparece quando o mouse passa por cima. No celular e no tablet (onde não existe "passar o mouse") ele fica invisível. Além disso, na tela inicial esse "Editar" está desligado: ao clicar, nada acontece.

Também confirmei que não há bloqueio de "em edição por outro usuário" travando os agendamentos e que as permissões gravadas no banco estão íntegras — o problema é de interface e de regra de quem pode editar.

## O que vou fazer

**1. Botão de editar visível e com texto**
- Na tela de detalhes, trocar o lápis solto por um botão "Editar" com ícone e texto, com tamanho de toque adequado no celular, sempre no topo do agendamento.

**2. Editar disponível para quem realmente atende**
- Administrador e Recepção continuam editando tudo.
- Profissional passa a editar os agendamentos que ele pode ver/atender (mesma regra de acesso já aplicada no banco).
- Quando a alteração for barrada por permissão, mostrar mensagem clara ("Você não tem permissão para alterar este agendamento"), em vez de o botão simplesmente desaparecer.

**3. Editar no perfil do cliente**
- Na aba de agendamentos do cliente, cada agendamento ganha ação de abrir os detalhes e um botão "Editar" que já abre o modo de edição, com as mesmas regras de permissão.

**4. Cartões de agendamento utilizáveis no toque**
- O menu de ações dos cartões passa a ficar sempre visível (sem depender do mouse) e o "Editar" da tela inicial passa a abrir de fato a edição.

**5. Proteção contra repetir o problema**
- Testes que falham se o botão de editar deixar de existir na tela de detalhes, no perfil do cliente ou se a permissão do profissional for removida.

## Detalhes técnicos

- `AppointmentDetailDialog.tsx`: substituir `canEdit = hasRole('admin') || hasRole('receptionist')` por uma regra centralizada em um novo `src/lib/appointmentEditAccess.ts` (`canEditAppointment({ roles, professionalId, appointment, scopeFlags })`), alinhada às políticas de UPDATE de `appointments` e a `can_access_appointment()`; botão com rótulo, `min-h-9`, mantendo `disabled` para lock ativo.
- Erros de gravação continuam passando por `resolveBlockedWriteError` (`AppointmentPermissionError` / `MissingProfessionalLinkError`) já existente em `useAppointments`.
- `ClientAppointmentsTab.tsx`: renderizar `AppointmentDetailDialog` (novo estado local `selectedAppointment` + prop opcional `startInEditMode`) e ação "Editar" por linha/cartão, sem interferir no modo de seleção.
- `AppointmentCard.tsx`: remover `opacity-0 group-hover:opacity-100` do gatilho do menu (usar `opacity-100 md:opacity-60 md:group-hover:opacity-100`); `Index.tsx` passa `onEdit`; remover o import morto de `AppointmentCard` em `Agenda.tsx`.
- Testes em `src/__tests__/regression/appointment-edit-access.test.ts` + verificação com `bunx tsgo --noEmit`, `bun run test:prepublish` e checagem do build.

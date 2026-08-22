# Sistema completo de usuários, permissões e privacidade

Objetivo: o Administrador controla, por profissional, o que ele acessa, o que executa, o que vê e se os dados que cria são privados ou compartilhados — com as regras aplicadas no banco (RLS), não apenas na interface.

O projeto já tem base parcial: `user_permissions` (módulo + ver/criar/editar/excluir), `professional_preferences` com flags (`can_view_other_clients`, `can_view_only_own_products`, etc.), `has_permission()`, `professional_permission()` e isolamento multi-tenant por `account_owner_id`. O trabalho é ampliar essa base, não recomeçar.

## O que será construído

### Fase 1 — Modelo de permissões e visibilidade (base)
- Ampliar `user_permissions` com as ações que faltam: `can_export`, `can_print`, `can_view_values`, `can_view_others`, `can_share`, `can_edit_others`, `can_delete_others`, e `data_scope` (`own` | `shared` | `unit` | `all`).
- Ampliar o enum de módulos com `unidades` e `salas_compartilhadas`.
- Adicionar em clientes, serviços, pacotes (`package_templates`, `service_packages`), produtos e documentos: `owner_professional_id` e `visibility` (`private` | `shared` | `clinic`). Padrão para registros criados por profissional: `private`; criados pelo Administrador: `clinic`. Registros existentes migram como `clinic` para não quebrar nada.
- Funções SQL de decisão, usadas por RLS e pelo front:
  - `perm(module, action)` — lê `user_permissions` com fallback por papel;
  - `can_see_record(owner_professional_id, visibility, module)` — aplica escopo próprio/compartilhado/clínica;
  - `can_write_record(...)` — separa editar/excluir próprios de editar/excluir de outros.
- Reescrever as políticas RLS de clientes, serviços, pacotes, produtos, documentos, agenda e financeiro em cima dessas funções, mantendo a policy RESTRICTIVE de tenant e o acesso total do Administrador.

### Fase 2 — Cadastro do profissional e matriz de permissões
- Cadastro do profissional passa a ter: nome, e-mail, telefone, cargo/especialidade, perfil, unidades, status ativo/inativo, data de cadastro (já existentes ou adicionados) mais as abas de permissões.
- Nova tela/aba **Matriz de permissões** (editável pelo Administrador), uma linha por módulo e colunas: Visualizar, Criar, Editar próprios, Editar outros, Excluir, Exportar, Imprimir, Ver valores, Ver dados de outros, Compartilhar, além do seletor de escopo (Próprios / Compartilhados / Toda a unidade / Toda a clínica).
- Presets rápidos por perfil (Profissional, Recepção, Financeiro, Gestor) para não configurar 12 módulos à mão.
- Gravação via edge function `admin-set-user-permissions` já existente, ampliada e com validação de tenant.

### Fase 3 — Aplicação nas telas
- Hook `usePermissions` ampliado (`can(module, action)`, `scope(module)`, `canSeeValues(module)`).
- Guardas de rota por módulo (não só ocultar menu: URL direta cai em "Acesso negado").
- Botões de criar/editar/excluir/exportar/imprimir desabilitados conforme permissão; colunas de valores ocultas quando `can_view_values` está desligado.
- Nos formulários de cliente, serviço, pacote, produto e documento: seletor **Privado / Compartilhado / Geral da clínica**, visível apenas para quem tem permissão de compartilhar.
- Listas, buscas, filtros e relatórios passam a filtrar por escopo — cliente privado de outro profissional não aparece em nenhuma busca.

### Fase 4 — Agenda e salas compartilhadas
- Permissões de agenda separadas: ver própria agenda, ver agenda de outros, criar, editar, cancelar, confirmar, ver cliente, ver serviço, ver valores, ver observações, ver documentos, gerenciar horários de salas.
- Preferência por profissional para sala compartilhada:
  - **Opção A (padrão)**: dos atendimentos de outros profissionais vê apenas sala, data, início, término e status — o card mostra "Reservado";
  - **Opção B**: o Administrador libera individualmente cliente, serviço, valor, profissional responsável, status, observações, documentos e financeiro.
- A ocultação é feita no servidor: uma função/view devolve o agendamento de outro profissional já mascarado, então mudar id na URL ou na requisição não revela nada.

### Fase 5 — Unidades
- Nova tabela `units` (por tenant) e `professional_units` (vínculo N:N), com seleção de unidades no cadastro do profissional.
- Registros ganham `unit_id`; escopo `unit`/`all` passa a considerar as unidades vinculadas. Contas com uma única unidade continuam funcionando igual (unidade padrão criada automaticamente).

### Fase 6 — Histórico e testes
- Auditoria de permissões e visibilidade: quem criou/editou/excluiu, quem alterou visibilidade, quem compartilhou, quem alterou permissões, com data/hora — via triggers gravando em `audit_logs`, e tela de histórico para o Administrador.
- Testes cobrindo os 20 cenários pedidos: isolamento de clientes/serviços/produtos privados, uso de compartilhados, edição indevida bloqueada, Administrador vê tudo, bloqueio por URL direta, sala compartilhada só com horário, liberação seletiva de serviço/valor, relatórios e financeiro por permissão, documentos privados, auditoria de permissões, e regressão de layout mobile (rolagem de tela e rolagem independente de tabelas).

## Detalhes técnicos
- Migrações: novas colunas em `user_permissions`; `owner_professional_id` + `visibility` (enum `data_visibility`) em `clients`, `services`, `package_templates`, `service_packages`, `products`, `client_documents`, `document_templates`; triggers de autofill de `owner_professional_id` a partir de `auth.uid()`; GRANTs explícitos em toda tabela nova.
- RLS: policies permissivas por papel + RESTRICTIVE de tenant preservadas; novas policies chamam as funções `SECURITY DEFINER` com `search_path = public` para evitar recursão.
- Edge functions que gravam dados sensíveis validam permissão e tenant antes de escrever.
- Front: `src/lib/permissions.ts` como fonte única dos módulos/ações; `RequirePermission` ao lado do `RequireRole` atual.

## Ordem de entrega
Fases 1 a 3 primeiro (base + matriz + telas), depois 4 (agenda/salas), 5 (unidades) e 6 (auditoria e testes). Cada fase entra funcionando, sem quebrar o que já existe.

## Fora do escopo
Nenhuma mudança em cobrança/Stripe, WhatsApp ou fluxo de agendamento além do necessário para aplicar permissões.

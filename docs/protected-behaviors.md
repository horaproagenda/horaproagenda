# Comportamentos protegidos (não podem voltar a quebrar)

Lista permanente. **Toda alteração** precisa manter estes comportamentos.
Cada item aponta o teste automatizado ou a validação documentada que o cobre.

Legenda de cobertura:
- `unit` → `bun run test:unit` (Vitest, `src/**/*.test.ts`)
- `e2e` → `bun run test` / `bun run test:visual` (Playwright, `e2e/`)
- `smoke` → `bun run test:smoke` (Supabase real, `tests/smoke/`)
- `manual` → checklist documentado em `docs/release-runbook.md`

## Autenticação e conta

| # | Comportamento protegido | Cobertura |
| - | ----------------------- | --------- |
| 1 | Login com e-mail/senha funciona e redireciona para `/dashboard` | `manual` (runbook §4) + `smoke` (`setup.ts` autentica em todo smoke) |
| 2 | Logout limpa a sessão e volta para `/auth` | `manual` (runbook §4) |
| 3 | Recuperação de senha: código do e-mail é aceito (normalização de espaços/caixa, janela de validade) | `unit` `verifyCodeNormalization.test.ts` |
| 4 | Troca de senha exige política mínima e dá feedback humanizado | `unit` `passwordPolicy.test.ts`, `humanError.test.ts` |
| 5 | Primeiro Administrador é o próprio usuário autenticado (sem formulário duplicado) e recebe role + permissões totais | `unit` `signup-admin-role.test.ts` + `smoke` (`ensure_primary_admin_setup`) |
| 6 | Cadastro de profissionais respeita `seat_limit` da assinatura | `unit` `seatUsage.test.ts` + `smoke` `seat-usage.smoke.test.ts` |
| 7 | Assinatura: plano + cartão no cadastro, 20 dias grátis, cobrança automática ao fim; falha → 2 dias de carência com aviso → suspensão sem apagar dados; ações de pagamento só para admin | `unit` `subscriptionAccess.test.ts`, `subscriptionReminders.test.ts`, `plans.test.ts` |

## Permissões e privacidade

| # | Comportamento protegido | Cobertura |
| - | ----------------------- | --------- |
| 8 | Permissões por módulo: módulo negado não aparece no menu **e** o backend bloqueia | `unit` `permissions.regression.test.ts` + RLS (`perm()`) |
| 9 | Permissões por ação (criar/editar/excluir próprios vs. de outros) | `unit` `permissions.regression.test.ts` |
| 10 | Permissões por unidade / `data_scope` (`own`, `shared`, `unit`, `all`) | `unit` `permissions.regression.test.ts` |
| 11 | Clientes privados: só o dono e o Admin veem (inclusive via URL direta) | `unit` `permissions.regression.test.ts` + RLS `can_see_record` |
| 12 | Clientes compartilhados: visíveis a quem tem escopo ≥ `shared` ou `view_others` | `unit` `permissions.regression.test.ts` |
| 13 | Serviços privados / pacotes privados seguem a mesma regra de visibilidade | `unit` `permissions.regression.test.ts` |
| 14 | Produtos privados x compartilhados; edição de produto de outro exige `edit_others` | `unit` `permissions.regression.test.ts` + `smoke` `inventory.smoke.test.ts` |
| 15 | Ocultação de valores (`view_values`) esconde valores sem esconder o registro | `unit` `permissions.regression.test.ts` |
| 16 | Salas compartilhadas: outro profissional vê só início/término (sem cliente, serviço, valor, observações) | RPC `get_shared_room_bookings` + `unit` `security-invariants.test.ts` (o frontend não consulta `appointments` de terceiros direto) |
| 17 | Nenhum valor de identidade vem do navegador (`user_id`, `account_owner_id`, `role`, `visibility` derivados no backend) | `unit` `security-invariants.test.ts` |
| 18 | RLS ativa: usuário anônimo não lê nenhuma tabela sensível | `smoke` `rls-anon-lockdown.smoke.test.ts` |
| 19 | Isolamento por clínica (`account_owner_id`) em todas as tabelas de negócio | `smoke` `db-integrity.smoke.test.ts` + linter Supabase |

## Operação (agenda, financeiro, produtos, documentos)

| # | Comportamento protegido | Cobertura |
| - | ----------------------- | --------- |
| 20 | Agenda: nenhum agendamento em dia não trabalhado (trigger + UI) | `smoke` `appointments.smoke.test.ts` |
| 21 | Agenda: remarcar pacote sequencial altera só os campos mudados, sem falso conflito | `smoke` `package-reschedule.smoke.test.ts` + `e2e` `sequential-package-*` |
| 22 | Agenda: duração nunca estoura 8h (bug histórico do pacote sequencial) | `smoke` `db-integrity.smoke.test.ts` |
| 23 | Agenda: mudar Semana/Dia/Mês não reseta a data; domingos ocultos não desalinham a grade | `unit` `agendaGrid` (via `regression-utils`) + `e2e` `agenda-layout-visual.spec.ts` |
| 24 | Pacotes: sessões numeradas em ordem, sem sessão fantasma, saldo correto | `smoke` `packages.smoke.test.ts`, `db-integrity.smoke.test.ts` |
| 25 | Financeiro: "vendas de hoje" não conta valores já pagos | `unit` `paymentStatus.test.ts`, `legacyPaymentDedup.test.ts` |
| 26 | Financeiro: cascata de lançamentos e comissões a partir das vendas | `smoke` `commission.smoke.test.ts`, `payments.smoke.test.ts` |
| 27 | Estoque: consumo manual x automático, conversões kg/g/mg e L/ml | `unit` `productUsageCalc.test.ts`, `productStockFlow.test.ts`, `productCycleAnalytics.test.ts` |
| 28 | Estoque: baixa de produto ao concluir atendimento | `unit` `productStockDeduction.test.ts` + `smoke` `product-stock-deduction.smoke.test.ts` |
| 29 | Documentos: negrito/cor/imagens preservados no PDF; `{data_extenso}` por extenso | `unit` `documentRichContent.test.ts` |
| 30 | Relatórios/exportação: colunas obrigatórias (retorno, profissional, sala, equipamento) | `unit` `exportUtils.test.ts`, `importMapping.test.ts` |
| 31 | Notificações: nunca exibir código/constraint de banco ao usuário | `unit` `humanError.test.ts`, `edgeFunctionError.test.ts` |
| 32 | WhatsApp: preview antes do envio; confirmação/cancelamento lidos corretamente; sem loop de "não entendi" | `unit` `whatsappIntent.test.ts`, `whatsappReplyDecision.test.ts` + `e2e` `whatsapp-document-send.spec.ts` |
| 33 | Sincronização em tempo real (Realtime) sem duplicidade | `smoke` `realtime.smoke.test.ts` + `e2e` `cross-device-sync.spec.ts` |
| 34 | Privacidade: quem pode compartilhar escolhe a visibilidade no cadastro (padrão "Geral da clínica"); quem não pode segue privado | `unit` `recordVisibility.test.ts` |
| 35 | Pacote sequencial: nenhuma rotina em segundo plano apaga pacote/agendamento por falta de venda no Caixa (`heal_orphan_service_packages` exige pacote sem venda, sem agendamento vinculado e com mais de 24h) | `unit` `sequentialPackageIntegrity.test.ts` |
| 36 | Pacote sequencial: sessão sem vínculo é revertida e o total só é informado após conferência no banco; intervalos por etapa respeitados mesmo iniciando em data passada | `unit` `sequentialPackageIntegrity.test.ts` |


## Layout e dispositivos

| # | Comportamento protegido | Cobertura |
| - | ----------------------- | --------- |
| 34 | Responsividade: sem overflow horizontal da página (320px → desktop) | `unit` `mobile-invariants.test.ts` + `e2e` visual |
| 35 | Rolagem vertical sempre funciona no mobile | `unit` `mobile-invariants.test.ts` |
| 36 | Rolagem horizontal só dentro de `[data-table-wrapper]` | `unit` `mobile-invariants.test.ts` |
| 37 | iPhone: `100dvh` (nunca `100vh` puro), safe-areas, sem auto-zoom (TODA fonte de campo ≥16px, regra final `max(16px,1em)` em telas de toque; proibido `user-scalable=no`/`maximum-scale=1`) | `unit` `mobile-invariants.test.ts` + `manual` (runbook §7) |
| 38 | Android: teclado virtual não cobre campos/botões (`--kb-inset`) | `unit` `mobile-invariants.test.ts` + `manual` (runbook §8) |
| 39 | Desktop: nenhuma faixa branca de safe-area duplicada; sidebar e tabelas intactas | `e2e` `agenda-layout-visual.spec.ts` + `manual` (runbook §9) |
| 40 | Menu mobile navega para todos os módulos autorizados | `e2e` `sidebar-mobile-nav.spec.ts` |

| 41 | Utilitários de layout (`.field-grid`, `.filter-bar`, `.action-row`, `.stack-mobile`, `.page-header-row`) existem e são mobile-first | `unit` `responsive-layout-invariants.test.ts` |
| 42 | Tabelas longas viram cartões no celular via `ResponsiveTable` (sem perder colunas nem ações) | `unit` `responsive-layout-invariants.test.ts` |
| 43 | Perfil do cliente: nome/telefone/e-mail em seções rotuladas, empilhadas no celular, sem truncar o e-mail | `unit` `responsive-layout-invariants.test.ts` |
| 44 | Abas do perfil rolam no celular (nunca 7 colunas comprimidas) | `unit` `responsive-layout-invariants.test.ts` |
| 45 | Nenhuma largura fixa > 64px sem contraparte fluida (`w-full` / `max-w-` / breakpoint) | `unit` `responsive-layout-invariants.test.ts` |
| 46 | Formulários em 1 coluna no celular (`sm:grid-cols-2/3` apenas acima de 640px) | `unit` `responsive-layout-invariants.test.ts` |

## Regra de ouro

Ao corrigir um novo erro: **adicione uma linha nesta tabela e um teste**.
Nenhuma correção validada pode existir sem teste que a proteja.

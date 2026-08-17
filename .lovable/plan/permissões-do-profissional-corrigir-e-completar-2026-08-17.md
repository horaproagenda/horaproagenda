# Permissões do profissional — corrigir e completar

Objetivo: quando o administrador liberar uma função ao profissional em "Gerenciamento de profissionais", essa função precisa realmente funcionar (hoje o banco bloqueia várias delas, mesmo com a permissão ligada).

## O que foi verificado no banco (estado atual)

| Área | Situação real hoje |
|---|---|
| Clientes | Profissional consegue **criar e ver** os próprios clientes, mas **não consegue editar nem excluir** (política só permite admin/recepção) |
| Lembretes | Profissional **não tem nenhum acesso** (ver/criar/editar/excluir são só admin/recepção) |
| Produtos | Profissional só **visualiza**; criar/editar/excluir são só admin/recepção |
| Serviços e pacotes | Profissional já pode criar/editar/excluir os próprios |
| Salas e equipamentos | Profissional já **apenas visualiza** (herdado do administrador) — correto, mantém |
| Formas de pagamento | Profissional já visualiza |
| Acesso a serviços/pacotes de outros profissionais | **Não existe** essa opção no cadastro do profissional |

## Correções

1. **Clientes próprios**: liberar editar e excluir para o profissional quando o cliente estiver atribuído a ele. Continua sem enxergar clientes de outros, salvo quando o admin ligar "Ver clientes de todos".
2. **Lembretes**: todo profissional passa a ver, criar, editar e excluir **os próprios** lembretes (sempre disponível, sem depender de chave extra).
3. **Produtos**: quando "Cadastrar e editar produtos" estiver ligado, o profissional realmente cria, edita e exclui os produtos que cadastrou.
4. **Serviços e pacotes próprios**: manter o CRUD próprio e garantir que a página Serviços/Pacotes mostre e permita as ações corretas ao profissional.
5. **Nova permissão no cadastro do profissional**: "Ver serviços e pacotes de outros profissionais" (padrão desligado). Ligada, o profissional visualiza (sem editar) os serviços/pacotes dos colegas — usado na agenda para escolher serviço.
6. **Salas e equipamentos**: permanecem cadastrados apenas pelo administrador e ficam visíveis a todos os profissionais (uso compartilhado).
7. **Baixa de pagamento coerente**: com "Dar baixa em pagamentos" ligado, o profissional passa a poder — de fato — dar baixa nos agendamentos, registrar vendas de serviços/pacotes/produtos, criar boletos parcelados e ver as formas de pagamento; os botões correspondentes deixam de ficar escondidos/travados.
8. **Agenda**: com "Alterar agenda" ligado, criar/editar/excluir agendamentos funciona de ponta a ponta (inclusive quando o serviço é de outro profissional, se a permissão do item 5 estiver ligada).

## Detalhes técnicos

- Migração de RLS nas tabelas `clients` (UPDATE/DELETE por `assigned_professional_id`), `reminders` (CRUD próprio por `created_by`/profissional), `products` (CRUD próprio quando `can_manage_products`), `services`/`service_packages` (SELECT ampliado quando a nova flag estiver ligada). Todas as políticas continuam dentro da policy RESTRICTIVE de isolamento por `account_owner_id`.
- Nova coluna booleana em `professionals` para "ver serviços/pacotes de outros" (default `false`), exposta em `PERMISSIONS_CONFIG` de `ManageProfessionalsDialog.tsx` na categoria Serviços.
- Frontend: hooks `useClients`, `useReminders`, `useProducts`, `useServices`, `useServicePackages` passam a respeitar as flags do profissional; botões de criar/editar/excluir e de baixa de pagamento condicionados às permissões reais.
- Verificação: rodar o smoke de RLS logado como profissional (criar/editar/excluir cliente próprio, lembrete, produto, serviço, agendamento e baixa de pagamento) e conferir que o acesso a dados de outros profissionais continua bloqueado quando as flags estão desligadas.

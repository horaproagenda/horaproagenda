# Plano: Permissões + Configurações por Profissional

Multi-fase. Cada fase = 1 rodada.

## Fase 1 (migração — agora)
- Nova tabela `professional_preferences` (1 linha por user) com TODAS as colunas customizáveis (override do `business_settings`):
  - horários (opening/closing, saturday/sunday open+close, slot_interval, work_saturdays, work_sundays, timezone)
  - prefs agenda (drag_and_drop_enabled, auto_complete_appointments)
  - automações (5 toggles + reminder_hours_before, quiet_hours_start/end)
- RLS: cada usuário lê/escreve só a própria linha; admin pode ler/escrever de qualquer usuário da conta.
- Função `public.get_effective_business_settings(_user_id)` retorna merge (override > global > default).
- `whatsapp_templates` já tem `professional_id` ✅ — só falta UI.

## Fase 2 (hooks + UI)
- `useBusinessSettings` passa a aceitar `scope: 'mine' | 'global'`; default `mine` para non-admin (lê via RPC merged), `global` para admin.
- `useWhatsappTemplates` filtra por professional_id quando não-admin.
- Configurações: exibe seção "Minhas configurações" sempre; "Configurações globais da conta" só para admin.

## Fase 3 (permissões + escopo de produtos)
- Adicionar à matriz do `ManageProfessionalsDialog`:
  - `can_view_only_own_products` / `can_view_all_products`
  - (já existe equivalente para clientes/agenda/relatórios — replicar padrão)
- `useProducts` respeita `can_view_only_own_products` filtrando por `created_by`.
- Documentar no card "WhatsApp" do cadastro que o número informado será o usado para conectar em Configurações > WhatsApp.

## Fase 4 (polimento)
- Realtime nas novas tabelas, testes smoke, atualizar memórias.

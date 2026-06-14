---
name: Multi-tenant isolation
description: account_owner_id column + RESTRICTIVE RLS policies + autofill trigger isolate every clinic
type: feature
---
Multi-tenant model: cada clínica = um `profiles.account_owner_id` (default = próprio user id).

**Tabelas com `account_owner_id` NOT NULL:** appointments, professionals, business_settings, user_roles, professional_credentials, professional_whatsapp_credentials, clients, financial_entries, single_sales, cash_*, audit_logs, access_logs, products, product_purchases, suppliers, banks, card_*, payment_methods, reminders, goals, financial_categories, boleto_*, services, package_templates, whatsapp_templates, equipment, rooms, professional_absences, professional_service_commissions, client_documents, client_credit_transactions, client_services, treatment_photos, service_packages, service_products, package_appointments, package_template_*, waitlist, quotes, whatsapp_*, appointment_*, document_*, dismissed_notifications, product_daily_consumption.

**Helpers:**
- `public.get_account_owner_for_user(uuid)` — resolve `profiles.account_owner_id` (fallback = próprio id)
- `public.current_account_owner_id()` — `auth.uid()` → dono
- `public.tg_autofill_account_owner_id()` — BEFORE INSERT trigger: tenta `auth.uid()` → `NEW.user_id` → `NEW.created_by` → primeiro admin (fallback de migração)
- `public.is_super_admin(uuid)` — bypass global de RLS para suporte

**Padrão de RLS:** policies "permissivas" originais (por role) + uma policy RESTRICTIVE `tenant_isolation_restrictive` em cada tabela, exigindo `is_super_admin OR account_owner_id = current_account_owner_id()`. Em `appointments`, `professionals`, `business_settings`, `user_roles`, `professional_credentials`, `professional_whatsapp_credentials` as policies originais foram reescritas combinando role + tenant.

**Defesa adicional:**
- `REVOKE SELECT (temp_password) ON professional_credentials FROM authenticated, anon` (column-level).
- Edge functions admin-* validam que o user_id alvo pertence ao mesmo `account_owner_id` do caller (via profiles).

**Ao criar nova tabela:** adicione `account_owner_id uuid NOT NULL`, autofill trigger e RESTRICTIVE tenant policy. Use `INSERT ... as never` no TS quando o tipo gerado não incluir `account_owner_id` (trigger preenche).

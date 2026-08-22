/**
 * Guarda de RLS: usuário anônimo não pode ler nenhuma tabela sensível.
 *
 * Roda sem credenciais (usa apenas a anon key) — é a rede de segurança mais
 * importante contra uma migration futura abrir dados privados por engano.
 *
 * Problema histórico: policies com `TO public` / `USING (true)` expondo PII.
 * Comportamento esperado: leitura anônima retorna erro de permissão OU 0 linhas.
 * O que não pode voltar: qualquer linha retornada sem autenticação.
 */
import { describe, it, expect } from 'vitest';
import { makeClient } from './setup';

const SENSITIVE_TABLES = [
  'clients',
  'appointments',
  'professionals',
  'profiles',
  'user_roles',
  'user_permissions',
  'financial_entries',
  'financial_categories',
  'payments_audit',
  'products',
  'product_usage_records',
  'services',
  'service_packages',
  'package_appointments',
  'client_documents',
  'document_templates',
  'treatment_photos',
  'cash_registers',
  'cash_transactions',
  'business_settings',
  'professional_credentials',
  'professional_whatsapp_credentials',
  'ultramsg_instance_pool',
  'whatsapp_messages',
  'audit_log',
  'audit_logs',
  'access_logs',
  'account_subscriptions',
  'interest_leads',
  'room_members',
  'rooms',
  'equipment',
  'payment_methods',
  'reminders',
  'quotes',
  'suppliers',
  'waitlist',
] as const;

describe('RLS: bloqueio anônimo', () => {
  const client = makeClient();

  for (const table of SENSITIVE_TABLES) {
    it(`anon não lê ${table}`, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (client as any).from(table).select('*').limit(1);
      if (error) {
        // Erro de permissão é o resultado desejado.
        expect(error.message).toBeTruthy();
        return;
      }
      expect(
        data ?? [],
        `Tabela ${table} retornou dados para usuário anônimo — RLS aberta!`,
      ).toEqual([]);
    });
  }
});

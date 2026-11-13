import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TRIAL_DAYS } from '@/lib/plans';

/**
 * Regressão: o período de teste gratuito oficial é de 20 dias.
 * O cadastro (complete-signup) chegou a gravar 7 dias por um cálculo
 * legado, encurtando o trial de novos usuários. Este teste falha se
 * o prazo voltar a ser hardcoded diferente de TRIAL_DAYS.
 */
describe('período de teste gratuito de 20 dias', () => {
  it('TRIAL_DAYS oficial é 20', () => {
    expect(TRIAL_DAYS).toBe(20);
  });

  it('complete-signup usa TRIAL_DAYS compartilhado, sem cálculo legado de 7 dias', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../supabase/functions/complete-signup/index.ts'),
      'utf8',
    );
    expect(src).toContain('TRIAL_DAYS');
    expect(src).not.toContain('7 * 24 * 60 * 60 * 1000');
    expect(src).not.toMatch(/TRIAL_DAYS\s*=\s*(7|30)\b/);
  });

  it('billingPlans (backend) define TRIAL_DAYS = 20', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../supabase/functions/_shared/billingPlans.ts'),
      'utf8',
    );
    expect(src).toMatch(/TRIAL_DAYS\s*=\s*20\b/);
  });

  it('aviso de exclusão de conta não menciona 7 dias de teste', () => {
    const src = readFileSync(
      resolve(__dirname, '../../components/settings/DeleteMyAccountDialog.tsx'),
      'utf8',
    );
    expect(src).not.toContain('de 7 dias');
    expect(src).toContain('TRIAL_DAYS');
  });
});

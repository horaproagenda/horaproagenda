import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fn = readFileSync(resolve(__dirname, '../../../supabase/functions/process-payment/index.ts'), 'utf8');
const dialog = readFileSync(resolve(__dirname, '../../components/appointments/AppointmentDetailDialog.tsx'), 'utf8');

describe('baixa de pagamento: profissional independente recebe na própria conta e caixa', () => {
  it('consulta o tipo de vínculo do profissional do atendimento', () => {
    expect(fn).toContain("rpc('resolve_financial_destination'");
    expect(fn).toContain("dest?.employment_type === 'independente'");
  });

  it('bloqueia a baixa quando o independente não tem caixa próprio aberto', () => {
    expect(fn).toContain('Abra o caixa do profissional antes de registrar este pagamento.');
    expect(fn).toContain('const ownRegister = dest?.cash_register_id ? { id: dest.cash_register_id } : null;');
  });

  it('nunca usa o caixa enviado pelo cliente quando o profissional é independente', () => {
    expect(fn).toContain('targetCashRegisterId = ownRegister.id;');
    expect(fn).toContain("cash_register_id: targetCashRegisterId,");
    // O insert de caixa não pode voltar a usar diretamente o caixa do corpo da requisição
    expect(fn).not.toContain('cash_register_id: body.cash_register_id,');
  });

  it('registra a movimentação na conta financeira do destino', () => {
    expect(fn).toContain("from('financial_movements')");
    expect(fn).toContain('financial_account_id: targetFinancialAccountId,');
    expect(fn).toContain("movement_type: 'entrada'");
    expect(fn).toContain('cash_session_id: targetCashRegisterId,');
  });

  it('marca o profissional nos registros financeiros e de caixa', () => {
    expect(fn).toContain('professional_id: targetProfessionalId,');
    expect(fn).toContain("const targetProfessionalId: string | null = dest?.professional_id ?? null;");
  });

  it('cria as contas financeiras quando ainda não existem', () => {
    expect(fn).toContain("rpc('ensure_financial_accounts', { _owner: callerOwner })");
  });

  it('a tela de baixa envia o caixa do profissional independente', () => {
    expect(dialog).toContain("appointmentProfessionalEmployment === 'independente'");
    expect(dialog).toContain('paymentTargetRegister?.id,');
    expect(dialog).toContain('Abra o caixa do profissional antes de registrar este pagamento.');
    expect(dialog).not.toContain('currentOpenRegister?.id,');
  });
});

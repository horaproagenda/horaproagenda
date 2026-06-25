/**
 * Regression guard: WhatsApp QR/conexão não pode expor busca por profissionais
 * nem permitir que um login conecte, consulte ou envie por profissional de outra clínica.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('WhatsApp isolamento por login/profissional', () => {
  const settings = read('src/components/settings/WhatsappSettings.tsx');
  const connect = read('supabase/functions/whatsapp-connect/index.ts');
  const qr = read('supabase/functions/whatsapp-get-qrcode/index.ts');
  const check = read('supabase/functions/whatsapp-check-connection/index.ts');
  const send = read('supabase/functions/whatsapp-send/index.ts');

  it('não exibe busca ou seleção de profissional na configuração de WhatsApp', () => {
    expect(settings).not.toMatch(/SearchableSelect/);
    expect(settings).not.toMatch(/Buscar profissional/);
    expect(settings).not.toMatch(/Selecione um profissional/);
  });

  it('conecta e gera QR somente para o profissional vinculado ao usuário logado', () => {
    expect(connect).toMatch(/requested_professional_id/);
    expect(connect).toMatch(/requested_professional_id !== professional_id/);
    expect(qr).toMatch(/requested_professional_id/);
    expect(qr).toMatch(/requested_professional_id !== professional_id/);
    expect(check).toMatch(/requested_professional_id/);
    expect(check).toMatch(/requested_professional_id !== professional_id/);
  });

  it('envio manual não aceita professional_id diferente do login autenticado', () => {
    expect(send).toMatch(/professional_id && professional_id !== currentProfId/);
    expect(send).toMatch(/const targetProf = currentProfId \|\| null/);
  });

  it('não usa credencial global Evolution no fluxo de QR/conexão manual', () => {
    expect(connect).not.toMatch(/getEvolutionConfig|evolutionGetQrCode/);
    expect(qr).not.toMatch(/getEvolutionConfig|evolutionGetQrCode/);
    expect(check).not.toMatch(/getEvolutionConfig|evolutionStatus/);
    expect(send).not.toMatch(/getEvolutionConfig|evolutionSendText/);
  });
});
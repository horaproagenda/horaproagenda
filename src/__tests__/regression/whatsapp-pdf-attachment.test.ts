import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('PDF do documento vai como arquivo no WhatsApp, não como link', () => {
  it('o botão envia o PDF anexado e não cola o link na mensagem', () => {
    const src = read('src/components/documentos/ClientDocumentViewDialog.tsx');
    expect(src).toContain('document: { url: signed.signedUrl');
    expect(src).not.toContain('O link fica disponível por 7 dias');
  });
  it('a função de envio usa o envio de documento da Evolution', () => {
    expect(read('supabase/functions/whatsapp-send/index.ts')).toContain('whatsappSendDocument');
    const evo = read('supabase/functions/_shared/evolution.ts');
    expect(evo).toContain('/message/sendMedia/');
    expect(evo).toContain("mediatype: 'document'");
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ClientDocumentViewDialog } from './ClientDocumentViewDialog';

describe('ClientDocumentViewDialog WhatsApp send', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('opens document sending through wa.me first and keeps the expected message for WhatsApp Web fallback', async () => {
    const replace = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({
      closed: false,
      opener: null,
      location: { replace, href: '' },
    } as unknown as Window);

    render(
      <ClientDocumentViewDialog
        open
        onOpenChange={vi.fn()}
        client={{ name: 'Maria Silva', phone: '(11) 98765-4321', email: 'maria@example.com' }}
        document={{
          id: 'doc-1',
          title: 'Termo de Consentimento',
          type: 'contract',
          content: 'Autorizo o procedimento estético facial.',
          created_at: '2026-06-01T10:00:00',
          signed_at: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^whatsapp$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /enviar documento pelo whatsapp/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/5511987654321?text=')));
    const waUrl = new URL(replace.mock.calls[0][0]);
    const waMessage = waUrl.searchParams.get('text') || '';
    expect(waMessage).toContain('📄 *Termo de Consentimento*');
    expect(waMessage).toContain('Contrato');
    expect(waMessage).toContain('⚠️ Aguardando assinatura');
    expect(waMessage).toContain('Autorizo o procedimento estético facial.');
    expect(waMessage).toContain('Documento gerado em 01/06/2026 às 10:00');

    await waitFor(
      () => expect(replace).toHaveBeenCalledWith(expect.stringContaining('https://web.whatsapp.com/send?phone=5511987654321&text=')),
      { timeout: 1500 },
    );
    const webUrl = new URL(replace.mock.calls[1][0]);
    expect(webUrl.searchParams.get('text')).toBe(waMessage);
  });
});
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ClientDocumentViewDialog } from './ClientDocumentViewDialog';

describe('ClientDocumentViewDialog WhatsApp send', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('opens document sending directly through WhatsApp Web with the expected message', async () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window);

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

    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining('https://web.whatsapp.com/send?phone=5511987654321&text='),
        '_blank',
        'noopener,noreferrer',
      ),
    );
    const webUrl = new URL((window.open as any).mock.calls[0][0]);
    const message = webUrl.searchParams.get('text') || '';
    expect(message).toContain('📄 *Termo de Consentimento*');
    expect(message).toContain('Contrato');
    expect(message).toContain('⚠️ Aguardando assinatura');
    expect(message).toContain('Autorizo o procedimento estético facial.');
    expect(message).toContain('Documento gerado em 01/06/2026 às 10:00');
    expect(webUrl.href).not.toContain('api.whatsapp.com');
    expect(webUrl.href).not.toContain('wa.me');
  });
});
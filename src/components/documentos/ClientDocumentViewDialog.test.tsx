import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ClientDocumentViewDialog } from './ClientDocumentViewDialog';

const invokeMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: any[]) => invokeMock(...args),
    },
  },
}));

describe('ClientDocumentViewDialog WhatsApp send', () => {
  afterEach(() => {
    vi.useRealTimers();
    invokeMock.mockReset();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('sends the document through the connected WhatsApp instance with the expected message', async () => {
    invokeMock.mockResolvedValue({
      data: { success: true, provider: 'evolution', route: 'evolution-api', instance: 'default' },
      error: null,
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);

    render(
      <ClientDocumentViewDialog
        open
        onOpenChange={vi.fn()}
        client={{ id: 'client-1', name: 'Maria Silva', phone: '(11) 98765-4321', email: 'maria@example.com' }}
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

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('whatsapp-send', expect.any(Object)));
    const payload = invokeMock.mock.calls[0][1].body;
    expect(payload.phone).toBe('(11) 98765-4321');
    expect(payload.client_id).toBe('client-1');
    const message = payload.message;
    expect(message).toContain('📄 *Termo de Consentimento*');
    expect(message).toContain('Contrato');
    expect(message).toContain('⚠️ Aguardando assinatura');
    expect(message).toContain('Autorizo o procedimento estético facial.');
    expect(message).toContain('Documento gerado em 01/06/2026 às 10:00');
    expect(openSpy).not.toHaveBeenCalled();
  });
});
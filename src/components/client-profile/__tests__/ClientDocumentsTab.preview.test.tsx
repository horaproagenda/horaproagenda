import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ClientDocumentsTab } from '../ClientDocumentsTab';

vi.mock('@/hooks/useClientProfile', () => ({
  useUploadFile: () => ({ uploadFile: vi.fn() }),
}));
vi.mock('@/hooks/useDocumentTemplates', () => ({
  useDocumentTemplates: () => ({ templates: [], refetch: vi.fn() }),
}));
vi.mock('@/hooks/useDocumentFillLinks', () => ({
  useDocumentFillLinks: () => ({ links: [], createLink: vi.fn(), refetch: vi.fn() }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasRole: () => true, user: { id: 'u1' } }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

describe('ClientDocumentsTab file preview', () => {
  beforeEach(() => {
    // jsdom polyfill
    if (!('createObjectURL' in URL)) {
      // @ts-expect-error jsdom
      URL.createObjectURL = vi.fn(() => 'blob:mock');
      // @ts-expect-error jsdom
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    }
  });

  const renderTab = () =>
    render(
      <ClientDocumentsTab
        documents={[]}
        clientId="client-1"
        onAddDocument={vi.fn().mockResolvedValue(undefined)}
      />,
    );

  it('shows an image preview when the selected file is an image', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /novo documento|adicionar|documento/i }).closest('button')!);

    // Open dialog
    const addButtons = screen.getAllByRole('button');
    const openBtn = addButtons.find((b) => /adicionar|novo/i.test(b.textContent || ''));
    if (openBtn) fireEvent.click(openBtn);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const imgFile = new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [imgFile], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      const preview = document.querySelector('img[alt^="Prévia de"]');
      expect(preview).toBeTruthy();
      expect(preview?.getAttribute('src')).toBe('blob:mock');
    });
  });

  it('shows a PDF preview when the selected file is a PDF', async () => {
    renderTab();
    const addButtons = screen.getAllByRole('button');
    const openBtn = addButtons.find((b) => /adicionar|novo/i.test(b.textContent || ''));
    if (openBtn) fireEvent.click(openBtn);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const pdfFile = new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { value: [pdfFile], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      const preview = document.querySelector('object[type="application/pdf"]');
      expect(preview).toBeTruthy();
      expect(preview?.getAttribute('data')).toBe('blob:mock');
    });
  });
});

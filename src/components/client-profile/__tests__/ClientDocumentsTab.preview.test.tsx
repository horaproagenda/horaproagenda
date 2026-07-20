import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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

const openUploadTab = () => {
  fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
  fireEvent.click(screen.getByRole('tab', { name: /upload manual/i }));
};

describe('ClientDocumentsTab file preview', () => {
  beforeEach(() => {
    if (typeof URL.createObjectURL !== 'function') {
      (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:mock';
      (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  const renderTab = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ClientDocumentsTab
            documents={[]}
            clientId="client-1"
            onAddDocument={vi.fn().mockResolvedValue(undefined)}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('renders an image preview when the selected file is an image', async () => {
    renderTab();
    openUploadTab();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const imgFile = new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [imgFile], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      const preview = document.querySelector('img[alt^="Prévia de"]') as HTMLImageElement | null;
      expect(preview).toBeTruthy();
      expect(preview?.getAttribute('src')).toBe('blob:mock');
    });
  });

  it('renders a PDF preview when the selected file is a PDF', async () => {
    renderTab();
    openUploadTab();

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

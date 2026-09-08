import { describe, it, expect, vi, beforeEach } from 'vitest';

const addImage = vi.fn();
const addPage = vi.fn();
const save = vi.fn();

vi.mock('jspdf', () => ({
  default: class {
    internal = {
      pageSize: { getWidth: () => 210, getHeight: () => 297 },
    };
    addImage = addImage;
    addPage = addPage;
    save = save;
  },
}));

// Canvas com altura equivalente a ~2,5 páginas A4.
vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({
    width: 1588,
    height: Math.round((1588 / 210) * 297 * 2.5),
    toDataURL: () => 'data:image/jpeg;base64,AAAA',
  })),
}));

describe('downloadRichDocumentPdf', () => {
  beforeEach(() => {
    addImage.mockClear();
    addPage.mockClear();
    save.mockClear();
    // Canvas de fatia usado para recortar cada folha.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '',
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,AAAA');
  });

  it('gera uma folha por fatia, sem repetir conteúdo entre páginas', async () => {
    const { downloadRichDocumentPdf } = await import('../richDocumentPdf');

    await downloadRichDocumentPdf({ title: 'Anamnese', bodyHtml: '<p>Olá</p>' });

    // 3 folhas para 2,5 páginas de conteúdo → 2 quebras de página.
    expect(addImage).toHaveBeenCalledTimes(3);
    expect(addPage).toHaveBeenCalledTimes(2);
    // Cada imagem começa no topo da folha (escala correta, sem corte deslocado).
    for (const call of addImage.mock.calls) {
      expect(call[3]).toBe(0);
    }
    expect(save).toHaveBeenCalledTimes(1);
  });
});

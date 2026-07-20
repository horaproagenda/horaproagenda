import { describe, expect, it } from 'vitest';
import { detectFilePreviewKind } from '../filePreview';

const makeFile = (name: string, type = '') => new File([new Uint8Array([1])], name, { type });

describe('detectFilePreviewKind', () => {
  it('returns null for no file', () => {
    expect(detectFilePreviewKind(null)).toBeNull();
    expect(detectFilePreviewKind(undefined)).toBeNull();
  });

  it('detects images via MIME type', () => {
    expect(detectFilePreviewKind(makeFile('foto.png', 'image/png'))).toBe('image');
    expect(detectFilePreviewKind(makeFile('scan.jpg', 'image/jpeg'))).toBe('image');
  });

  it('detects images via file extension when MIME is missing', () => {
    expect(detectFilePreviewKind(makeFile('foto.PNG'))).toBe('image');
    expect(detectFilePreviewKind(makeFile('a.webp'))).toBe('image');
  });

  it('detects PDFs via MIME type and extension', () => {
    expect(detectFilePreviewKind(makeFile('doc.pdf', 'application/pdf'))).toBe('pdf');
    expect(detectFilePreviewKind(makeFile('DOC.PDF'))).toBe('pdf');
  });

  it('returns "other" for unsupported files', () => {
    expect(detectFilePreviewKind(makeFile('doc.docx', 'application/msword'))).toBe('other');
    expect(detectFilePreviewKind(makeFile('a.zip'))).toBe('other');
  });
});

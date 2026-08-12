import { describe, it, expect } from 'vitest';
import { fillDocumentHtml, isRichDocument, sanitizeRichDocumentHtml } from '../documentRichContent';
import { buildDocumentDateTimeValues, formatDocumentDateExtended } from '../documentTemplateFields';

describe('documentRichContent', () => {
  it('detects rich documents', () => {
    expect(isRichDocument('<p>Olá</p>')).toBe(true);
    expect(isRichDocument('Olá {nome}')).toBe(false);
  });

  it('keeps bold, colors and images while filling variables', () => {
    const html = '<p><strong>Cliente:</strong> <span style="color: rgb(255, 0, 0)">{nome}</span></p><p><img src="data:image/png;base64,AAA" alt="logo" /></p>';
    const out = fillDocumentHtml(html, { formData: { nome: 'Maria' } });
    expect(out).toContain('<strong>Cliente:</strong>');
    expect(out).toContain('color: rgb(255, 0, 0)');
    expect(out).toContain('Maria');
    expect(out).toContain('data:image/png;base64,AAA');
  });

  it('answers Sim/Não and checkboxes per visual line', () => {
    const html = '<p>Alergia? ( ) Sim ( ) Não</p><p>Fuma? ( ) Sim ( ) Não</p>';
    const out = fillDocumentHtml(html, { yesNoAnswers: { question_0: 'sim', question_1: 'nao' } });
    expect(out).toContain('Alergia? (X) Sim ( ) Não');
    expect(out).toContain('Fuma? ( ) Sim (X) Não');
  });

  it('keeps unfilled variables when requested', () => {
    const out = fillDocumentHtml('<p>{nome} - {servico}</p>', { formData: { nome: 'Ana' }, keepUnfilledVariables: true });
    expect(out).toContain('Ana - {servico}');
  });

  it('strips scripts and unsafe styles', () => {
    const out = sanitizeRichDocumentHtml('<p style="color:red;position:fixed">x</p><script>alert(1)</script>');
    expect(out).not.toContain('script');
    expect(out).toContain('color:red');
    expect(out).not.toContain('position');
  });

  it('spells the date out for data_extenso', () => {
    const values = buildDocumentDateTimeValues(new Date('2026-08-12T15:00:00Z'));
    expect(values.data_extenso).toBe('12 de agosto de 2026');
    expect(values.data).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(formatDocumentDateExtended(new Date('2026-01-05T15:00:00Z'))).toBe('5 de janeiro de 2026');
  });
});

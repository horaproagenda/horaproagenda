import { describe, it, expect } from 'vitest';
import { fillDocumentHtml, fillDocumentHtmlWithReport } from '../documentRichContent';
import { buildFilledDocumentContent, htmlToPlainText, listDocumentFields, tokenizeDocument } from '../documentTemplateFields';

// Modelo rico com parágrafos vazios, negrito e <br> — o formato que trocava as respostas de lugar.
const RICH = [
  '<p><strong>Nome:</strong> {nome}</p>',
  '<p><br></p>',
  '<p>Já fez laser antes? ( ) Sim ( ) Não</p>',
  '<p>Se sim, quais áreas? [TEXTO_LIVRE]</p>',
  '<p></p><p>Quantas aplicações?<br>[TEXTO_LIVRE]</p>',
  '<p><b>Alergia?</b> ( ) Sim ( ) Não</p>',
  '<p>Frequência:[TEXTO_LIVRE] Observação:[TEXTO_LIVRE]</p>',
  '<p>Aceito os termos ( )</p>',
].join('');

function fieldsOnScreen(html: string) {
  return tokenizeDocument(htmlToPlainText(html)).flat().filter(t => t.type !== 'text');
}

describe('mapeamento de campos do documento', () => {
  it('cada resposta da tela vai para o mesmo campo no documento salvo', () => {
    const screen = fieldsOnScreen(RICH);
    const additionalInfo: Record<string, string> = {};
    const yesNoAnswers: Record<string, 'sim' | 'nao'> = {};
    const checkboxAnswers: Record<string, boolean> = {};
    screen.forEach(t => {
      if (t.type === 'freeText') additionalInfo[t.fieldKey] = `RESP<${t.label}>`;
      if (t.type === 'yesno') yesNoAnswers[t.fieldKey] = t.label.startsWith('Alergia') ? 'nao' : 'sim';
      if (t.type === 'checkbox') checkboxAnswers[t.fieldKey] = true;
    });
    const out = fillDocumentHtml(RICH, { formData: { nome: 'Ana' }, additionalInfo, yesNoAnswers, checkboxAnswers });
    const text = htmlToPlainText(out);
    expect(text).toContain('quais áreas? RESP<Se sim, quais áreas?>');
    expect(text).toContain('RESP<Quantas aplicações?>');
    expect(text).toContain('Frequência:RESP<Frequência> Observação:RESP<Observação>');
    expect(text).toContain('Já fez laser antes? (X) Sim ( ) Não');
    expect(text).toContain('Alergia? ( ) Sim (X) Não');
    expect(text).toContain('Aceito os termos (X)');
  });

  it('todo campo da tela existe no documento final (nenhum sem destino)', () => {
    const screen = fieldsOnScreen(RICH).filter(t => t.type !== 'variable').map(t => t.fieldKey);
    const placedKeys = fillDocumentHtmlWithReport(RICH, {}).placedKeys.filter(k => k !== 'nome');
    expect(new Set(placedKeys)).toEqual(new Set(screen));
  });

  it('ids não dependem do número da linha', () => {
    const a = listDocumentFields('A? [TEXTO_LIVRE]\nB? [TEXTO_LIVRE]').map(f => f.fieldKey);
    const b = listDocumentFields('\n\n\nA? [TEXTO_LIVRE]\n\nB? [TEXTO_LIVRE]').map(f => f.fieldKey);
    expect(a).toEqual(['texto_livre_0', 'texto_livre_1']);
    expect(b).toEqual(a);
  });

  it('documento simples mantém cada resposta no seu campo', () => {
    const out = buildFilledDocumentContent({
      content: 'Áreas? [TEXTO_LIVRE]\n\nDor? [TEXTO_LIVRE]',
      formData: {}, yesNoAnswers: {}, additionalInfo: { texto_livre_0: 'axila', texto_livre_1: 'baixa' },
    });
    expect(out).toBe('Áreas? axila\n\nDor? baixa');
  });
});

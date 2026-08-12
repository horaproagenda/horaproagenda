import DOMPurify from 'dompurify';
import {
  createTokenCounters,
  tokenizeDocumentSegment,
  type DocumentFieldToken,
} from './documentTemplateFields';

/**
 * Tools to keep document formatting (bold, colors, alignment, images, tables)
 * intact through the whole pipeline: template -> filling -> save -> view -> PDF.
 */

const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'font-size',
  'font-family',
  'text-decoration',
  'text-decoration-line',
  'text-align',
  'width',
  'max-width',
  'height',
  'min-height',
  'margin',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'padding',
  'border',
  'border-collapse',
  'border-radius',
  'display',
  'aspect-ratio',
  'line-height',
  'vertical-align',
  'list-style-type',
]);

const filterStyleAttribute = (value: string): string =>
  value
    .split(';')
    .map(decl => decl.trim())
    .filter(Boolean)
    .filter(decl => {
      const prop = decl.split(':')[0]?.trim().toLowerCase();
      if (!prop || !ALLOWED_STYLE_PROPS.has(prop)) return false;
      // Block css functions that can be used to fetch remote content / scripts
      return !/(url\s*\(|expression\s*\(|javascript:)/i.test(decl);
    })
    .join('; ');

let hookRegistered = false;
const registerHook = () => {
  if (hookRegistered) return;
  hookRegistered = true;
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    const el = node as Element;
    if (!el.getAttribute) return;
    const style = el.getAttribute('style');
    if (style) {
      const safe = filterStyleAttribute(style);
      if (safe) el.setAttribute('style', safe);
      else el.removeAttribute('style');
    }
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') || '';
      const isSafeImage = /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src) || /^https?:\/\//i.test(src);
      if (!isSafeImage) el.remove();
    }
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  });
};

/**
 * Sanitizes rich document HTML while preserving bold, colors, alignment,
 * images (including inline base64) and tables.
 */
export function sanitizeRichDocumentHtml(html: string | null | undefined): string {
  if (!html) return '';
  registerHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'div', 'span', 'br', 'hr', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
      'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
      'img', 'a', 'font',
    ],
    ALLOWED_ATTR: [
      'style', 'class', 'src', 'alt', 'title', 'href', 'target', 'rel', 'width', 'height',
      'colspan', 'rowspan', 'align', 'color', 'face', 'size', 'data-align',
    ],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|data:image\/)/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'formaction', 'xlink:href', 'srcset'],
  });
}

/** True when the stored content carries HTML markup (rich document). */
export function isRichDocument(content: string | null | undefined): boolean {
  if (!content) return false;
  return /<(p|div|span|br|b|strong|i|em|u|h[1-6]|ul|ol|li|table|img|font)\b[^>]*>/i.test(content);
}

export interface DocumentFillValues {
  formData?: Record<string, string>;
  yesNoAnswers?: Record<string, 'sim' | 'nao' | ''>;
  additionalInfo?: Record<string, string>;
  checkboxAnswers?: Record<string, boolean>;
  /** When true, `{variavel}` placeholders without a value stay untouched. */
  keepUnfilledVariables?: boolean;
}

export function resolveDocumentTokenValue(token: DocumentFieldToken, values: DocumentFillValues): string {
  const { formData = {}, yesNoAnswers = {}, additionalInfo = {}, checkboxAnswers = {} } = values;
  switch (token.type) {
    case 'text':
      return token.value;
    case 'variable': {
      const value = formData[token.fieldKey] ?? formData[token.fieldKey.toLowerCase()] ?? '';
      if (!value && values.keepUnfilledVariables) return `{${token.name}}`;
      return value;
    }
    case 'yesno': {
      const answer = yesNoAnswers[token.fieldKey] || '';
      if (answer === 'sim') return '(X) Sim ( ) Não';
      if (answer === 'nao') return '( ) Sim (X) Não';
      return '( ) Sim ( ) Não';
    }
    case 'checkbox':
      return checkboxAnswers[token.fieldKey] ? '(X)' : '( )';
    case 'freeText':
    case 'blankField':
      return additionalInfo[token.fieldKey] || '';
    default:
      return '';
  }
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TABLE', 'UL', 'OL']);

interface LineGroup {
  index: number;
  nodes: Text[];
}

/**
 * Groups the text nodes of an HTML document by "visual line", mirroring the
 * newline logic of htmlToPlainText so field keys (which are line-indexed)
 * stay identical between the plain-text and HTML pipelines.
 */
function collectLineGroups(root: HTMLElement): LineGroup[] {
  const groups: LineGroup[] = [];
  let lineIndex = 0;
  let current: LineGroup = { index: 0, nodes: [] };
  let dirty = false;

  const breakLine = () => {
    groups.push(current);
    lineIndex += 1;
    current = { index: lineIndex, nodes: [] };
    dirty = false;
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current.nodes.push(node as Text);
      if ((node.textContent || '').length) dirty = true;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      breakLine();
      return;
    }
    const isBlock = BLOCK_TAGS.has(el.tagName);
    if (isBlock && dirty) breakLine();
    Array.from(el.childNodes).forEach(walk);
    if (isBlock) breakLine();
  };

  Array.from(root.childNodes).forEach(walk);
  groups.push(current);
  return groups;
}

/**
 * Fills a rich (HTML) document template: replaces {variables}, Yes/No answers,
 * checkboxes and free-text placeholders inside TEXT NODES ONLY, so every bit of
 * formatting, color and every image is preserved exactly as edited.
 */
export function fillDocumentHtml(html: string, values: DocumentFillValues): string {
  const safeHtml = sanitizeRichDocumentHtml(html);
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return safeHtml;

  const doc = new DOMParser().parseFromString(`<div id="__doc_root">${safeHtml}</div>`, 'text/html');
  const root = doc.getElementById('__doc_root');
  if (!root) return safeHtml;

  collectLineGroups(root).forEach(group => {
    const counters = createTokenCounters();
    group.nodes.forEach(textNode => {
      const original = textNode.textContent || '';
      if (!original) return;
      const tokens = tokenizeDocumentSegment(original, group.index, counters);
      const filled = tokens.map(token => resolveDocumentTokenValue(token, values)).join('');
      if (filled !== original) textNode.textContent = filled;
    });
  });

  return root.innerHTML;
}

/** Wraps a filled document body in printable A4 HTML (print window / PDF). */
export function buildPrintableDocumentHtml(opts: {
  title: string;
  bodyHtml: string;
  headerLines?: string[];
  footerHtml?: string;
}): string {
  const { title, bodyHtml, headerLines = [], footerHtml = '' } = opts;
  const header = headerLines.filter(Boolean).map(l => `<p class="meta">${l}</p>`).join('');
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>${title}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; line-height: 1.55; font-size: 12px; }
  h1.doc-title { font-size: 18px; text-align: center; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #374151; }
  .meta { margin: 2px 0; font-size: 10px; color: #4b5563; }
  .doc-body { margin-top: 14px; }
  .doc-body img { max-width: 100%; height: auto; }
  .doc-body table { border-collapse: collapse; max-width: 100%; }
  .doc-body td, .doc-body th { border: 1px solid #d1d5db; padding: 4px 6px; }
  .doc-footer { margin-top: 28px; border-top: 1px solid #d1d5db; padding-top: 8px; font-size: 10px; color: #6b7280; }
</style></head>
<body>
  <h1 class="doc-title">${title}</h1>
  ${header}
  <div class="doc-body">${bodyHtml}</div>
  ${footerHtml ? `<div class="doc-footer">${footerHtml}</div>` : ''}
</body></html>`;
}

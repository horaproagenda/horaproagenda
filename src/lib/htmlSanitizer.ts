/**
 * HTML sanitization utilities for safe document.write() usage
 * Used in print functionality to prevent XSS attacks
 */
import DOMPurify from 'dompurify';

/**
 * Escapes HTML special characters to prevent XSS
 * Use for user-editable text fields (names, emails, notes, etc.)
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitizes content that may contain intentional HTML (like <br>)
 * while removing potentially dangerous tags/attributes
 */
export function sanitizeDocumentContent(content: string | null | undefined): string {
  if (!content) return '';
  let safe = escapeHtml(content);
  safe = safe.replace(/\n/g, '<br>');
  return safe;
}

/**
 * Sanitizes rich HTML content using DOMPurify.
 * Handles known bypass vectors: vbscript:, SVG animations, MathML,
 * protocol handlers, event handlers, etc.
 */
export function sanitizeHtmlContent(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'],
    FORBID_ATTR: ['style', 'formaction', 'xlink:href'],
  });
}

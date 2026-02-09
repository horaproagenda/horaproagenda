/**
 * HTML sanitization utilities for safe document.write() usage
 * Used in print functionality to prevent XSS attacks
 */

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
 * Use for document content fields that have newline-to-br conversion
 */
export function sanitizeDocumentContent(content: string | null | undefined): string {
  if (!content) return '';
  
  // First escape all HTML
  let safe = escapeHtml(content);
  
  // Then convert newlines to <br> (which is now safe because it's escaped)
  // Since we escaped the HTML, \n is still \n, so convert it to actual <br>
  safe = safe.replace(/\n/g, '<br>');
  
  return safe;
}

/**
 * Sanitizes content for HTML display, allowing only safe tags
 * Removes scripts, event handlers, and other dangerous content
 */
export function sanitizeHtmlContent(html: string | null | undefined): string {
  if (!html) return '';
  
  // Remove script tags and their content
  let safe = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers (onclick, onerror, etc.)
  safe = safe.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  safe = safe.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: URLs
  safe = safe.replace(/javascript\s*:/gi, '');
  
  // Remove data: URLs that could contain scripts
  safe = safe.replace(/data\s*:\s*text\/html/gi, '');
  
  // Remove style expressions (IE-specific XSS vector)
  safe = safe.replace(/expression\s*\(/gi, '');
  
  // Remove iframe, object, embed tags
  safe = safe.replace(/<(iframe|object|embed|link|meta|base)[^>]*>/gi, '');
  
  return safe;
}

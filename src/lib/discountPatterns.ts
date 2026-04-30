/**
 * Configurable discount detection patterns.
 * 
 * To adjust which entries are treated as discounts,
 * simply add/remove patterns here — no component code changes needed.
 */

/** Patterns matched against the LOWERCASED, TRIMMED description */
export const DISCOUNT_DESCRIPTION_PATTERNS: RegExp[] = [
  /^desconto$/,                                        // exact match
  /^desconto\s*[-–—:]/,                                // "Desconto - ...", "Desconto: ..."
  /^desconto\s+(de|do|da|no|na|em|sobre|aplicado|concedido)/i, // "Desconto de 10%"
  /^desc\.\s*[-–—:]/,                                  // abbreviated "Desc. - ..."
  /^abatimento/,                                       // synonyms
  /^bonificação/,
  /^cortesia/,
];

/** Financial entry types that represent discounts (only when description also matches) */
export const DISCOUNT_ENTRY_TYPES: string[] = ['credit'];

/** Payment method names that indicate a discount (case-insensitive exact match) */
export const DISCOUNT_PAYMENT_METHODS: string[] = [
  'desconto',
  'cortesia',
  'bonificação',
  'abatimento',
];

/**
 * Check if a financial entry description matches any discount pattern.
 */
export function isDiscountDescription(description: string | null | undefined): boolean {
  const desc = (description || '').toLowerCase().trim();
  if (!desc) return false;
  return DISCOUNT_DESCRIPTION_PATTERNS.some(pattern => pattern.test(desc));
}

/**
 * Check if a financial entry should be excluded from receivables as a discount.
 * Considers description patterns, entry type, and payment method.
 */
export function isDiscountEntry(entry: {
  description?: string | null;
  type?: string | null;
  payment_method?: string | null;
}): boolean {
  const descMatch = isDiscountDescription(entry.description);
  
  // Description alone is enough
  if (descMatch) return true;
  
  // Type = credit ONLY counts as discount when description also hints at it
  if (DISCOUNT_ENTRY_TYPES.includes(entry.type || '') && descMatch) return true;
  
  // Payment method exact match (case-insensitive)
  const pm = (entry.payment_method || '').toLowerCase().trim();
  if (pm && DISCOUNT_PAYMENT_METHODS.includes(pm)) return true;
  
  return false;
}

/**
 * Parses a loosely-formatted date string into ISO yyyy-mm-dd.
 * Accepts: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, ddmmyyyy, yyyy-mm-dd, yyyy/mm/dd.
 * Returns null if it cannot be parsed.
 */
export function parseLooseDateToISO(input: string): string | null {
  if (!input) return null;
  const raw = input.trim().replace(/\s+/g, '');
  if (!raw) return null;

  // Already ISO-like
  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // dd/mm/yyyy variants
  m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (parseInt(y, 10) > 30 ? '19' : '20') + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // ddmmyyyy
  m = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo}-${d}`;
  }

  // yyyymmdd
  m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo}-${d}`;
  }

  return null;
}

/**
 * Returns an onPaste handler for native <input type="date"> fields that
 * accepts pasted strings in many common formats.
 */
export function createDatePasteHandler(setValue: (iso: string) => void) {
  return (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const iso = parseLooseDateToISO(text);
    if (iso) {
      e.preventDefault();
      setValue(iso);
    }
  };
}

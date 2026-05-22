import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Palette,
  Image as ImageIcon,
  Table as TableIcon,
  DollarSign,
  Plus,
  Minus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const FONTS = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Garamond', value: 'Garamond, serif' },
  { label: 'Helvetica', value: 'Helvetica, sans-serif' },
];

const SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

const COLORS = [
  '#000000', '#444444', '#888888', '#cccccc', '#ffffff',
  '#e11d48', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#78350f',
];

const CELL_BG_COLORS = [
  'transparent', '#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3',
  '#e0e7ff', '#f3e8ff', '#fee2e2', '#f1f5f9', '#fff7ed',
];

export interface RichTextEditorHandle {
  insertText: (text: string) => void;
  focus: () => void;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeightClassName?: string;
}

const exec = (command: string, value?: string) => {
  document.execCommand(command, false, value);
};

const applyFontSize = (px: number, editor: HTMLDivElement) => {
  exec('fontSize', '7');
  editor.querySelectorAll('font[size="7"]').forEach((node) => {
    const span = document.createElement('span');
    span.style.fontSize = `${px}px`;
    span.innerHTML = (node as HTMLElement).innerHTML;
    node.replaceWith(span);
  });
};

// ============ Table / formula helpers ============
const colIndexToLetter = (i: number): string => {
  let s = '';
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
};

const formatCurrency = (n: number): string =>
  `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const parseCellNumber = (raw: string): number => {
  if (!raw) return 0;
  // Accept "R$ 1.234,56", "1.234,56", "1234.56", "-3"
  const cleaned = raw
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const evaluateFormula = (formula: string, table: HTMLTableElement): number | string => {
  try {
    let expr = formula.trim().replace(/^=/, '');

    const getCell = (col: string, row: number): HTMLTableCellElement | null => {
      return table.querySelector<HTMLTableCellElement>(
        `td[data-col="${col}"][data-row="${row}"]`,
      );
    };
    const cellNum = (col: string, row: number): number => {
      const c = getCell(col, row);
      if (!c) return 0;
      const f = c.getAttribute('data-formula');
      if (f) {
        const v = evaluateFormula(f, table);
        return typeof v === 'number' ? v : parseCellNumber(String(v));
      }
      return parseCellNumber(c.textContent || '');
    };

    // Expand range functions: SOMA/SUM/MULT/MULTIPLICAR
    expr = expr.replace(
      /(SOMA|SUM|MULT|MULTIPLICAR|MEDIA|MEDIA|AVG|MIN|MAX)\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/gi,
      (_, fn, c1, r1, c2, r2) => {
        const startCol = String(c1).toUpperCase();
        const endCol = String(c2).toUpperCase();
        const r1n = parseInt(r1, 10);
        const r2n = parseInt(r2, 10);
        const colStart = startCol.charCodeAt(0) - 65;
        const colEnd = endCol.charCodeAt(0) - 65;
        const values: number[] = [];
        for (let c = Math.min(colStart, colEnd); c <= Math.max(colStart, colEnd); c++) {
          for (let r = Math.min(r1n, r2n); r <= Math.max(r1n, r2n); r++) {
            values.push(cellNum(colIndexToLetter(c), r));
          }
        }
        const upper = String(fn).toUpperCase();
        if (upper === 'SOMA' || upper === 'SUM') return `(${values.reduce((a, b) => a + b, 0)})`;
        if (upper === 'MULT' || upper === 'MULTIPLICAR') return `(${values.reduce((a, b) => a * b, 1)})`;
        if (upper === 'MEDIA' || upper === 'AVG') return `(${values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0})`;
        if (upper === 'MIN') return `(${Math.min(...values)})`;
        if (upper === 'MAX') return `(${Math.max(...values)})`;
        return '0';
      },
    );

    // Replace cell refs A1, B12 etc.
    expr = expr.replace(/([A-Z]+)(\d+)/g, (_, c, r) => {
      const v = cellNum(String(c).toUpperCase(), parseInt(r, 10));
      return `(${v})`;
    });

    // Only allow numbers and arithmetic
    if (!/^[\d+\-*/().,\s]*$/.test(expr)) return '#ERRO';
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr || '0'});`)();
    if (typeof result !== 'number' || !Number.isFinite(result)) return '#ERRO';
    return result;
  } catch {
    return '#ERRO';
  }
};

const recalculateTables = (editor: HTMLDivElement) => {
  editor.querySelectorAll<HTMLTableElement>('table.rte-table').forEach((table) => {
    // Two passes to resolve simple dependencies
    for (let pass = 0; pass < 3; pass++) {
      table.querySelectorAll<HTMLTableCellElement>('td[data-formula]').forEach((td) => {
        const formula = td.getAttribute('data-formula') || '';
        const val = evaluateFormula(formula, table);
        let display: string;
        if (typeof val === 'number') {
          display =
            td.getAttribute('data-format') === 'currency'
              ? formatCurrency(val)
              : Number.isInteger(val)
                ? String(val)
                : val.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
        } else {
          display = val;
        }
        if (td.textContent !== display) td.textContent = display;
      });
    }
    // Apply currency display for plain numeric cells with data-format
    table.querySelectorAll<HTMLTableCellElement>('td[data-format="currency"]').forEach((td) => {
      if (td.hasAttribute('data-formula')) return;
      const txt = td.textContent || '';
      if (!txt.trim()) return;
      if (/^R\$\s/.test(txt.trim())) return;
      const n = parseCellNumber(txt);
      td.textContent = formatCurrency(n);
    });
  });
};

const buildEmptyTable = (rows: number, cols: number): string => {
  const safeRows = Math.max(1, Math.min(50, rows));
  const safeCols = Math.max(1, Math.min(26, cols));
  let html =
    '<table class="rte-table" style="border-collapse:collapse;width:100%;margin:8px 0;" data-rte-table="1">';
  // Header row showing column letters
  html += '<thead><tr>';
  for (let c = 0; c < safeCols; c++) {
    html += `<th style="border:1px solid #cbd5e1;background:#f1f5f9;font-size:11px;color:#64748b;padding:4px;text-align:center;width:${100 / safeCols}%;">${colIndexToLetter(c)}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (let r = 1; r <= safeRows; r++) {
    html += '<tr>';
    for (let c = 0; c < safeCols; c++) {
      html += `<td data-col="${colIndexToLetter(c)}" data-row="${r}" style="border:1px solid #cbd5e1;padding:6px;min-width:48px;vertical-align:top;"></td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table><p><br/></p>';
  return html;
};

// ============ Component ============

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  ({ value, onChange, placeholder, className, minHeightClassName = 'min-h-[420px]' }, ref) => {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const savedRangeRef = useRef<Range | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [font, setFont] = useState(FONTS[0].value);
    const [size, setSize] = useState<number>(14);
    const [isEmpty, setIsEmpty] = useState(!value);
    const [gridHover, setGridHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
    const [manualRows, setManualRows] = useState(3);
    const [manualCols, setManualCols] = useState(3);
    const [selectedCell, setSelectedCell] = useState<HTMLTableCellElement | null>(null);
    const [cellMenuPos, setCellMenuPos] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      if (el.innerHTML !== (value || '')) {
        el.innerHTML = value || '';
      }
      setIsEmpty(!el.textContent?.trim());
      recalculateTables(el);
    }, [value]);

    const saveSelection = useCallback(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (editorRef.current?.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    }, []);

    const restoreSelection = useCallback(() => {
      const range = savedRangeRef.current;
      if (!range) {
        editorRef.current?.focus();
        return;
      }
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, []);

    const emitChange = () => {
      const el = editorRef.current;
      if (!el) return;
      setIsEmpty(!el.textContent?.trim());
      onChange(el.innerHTML);
    };

    const handleInput = (e?: React.FormEvent<HTMLDivElement>) => {
      const el = editorRef.current;
      if (!el) return;
      // If user edited a cell with a formula, drop formula attr
      const target = (e?.target as HTMLElement) || null;
      if (target?.tagName === 'TD' && target.hasAttribute('data-formula')) {
        target.removeAttribute('data-formula');
      }
      recalculateTables(el);
      emitChange();
    };

    const runCommand = (command: string, valueArg?: string) => {
      restoreSelection();
      exec(command, valueArg);
      emitChange();
      saveSelection();
    };

    const handleFontChange = (newFont: string) => {
      setFont(newFont);
      restoreSelection();
      exec('fontName', newFont);
      emitChange();
    };

    const handleSizeChange = (delta: number | string) => {
      const next = typeof delta === 'number' ? delta : parseInt(delta, 10);
      if (!Number.isFinite(next) || next < 6 || next > 96) return;
      setSize(next);
      restoreSelection();
      if (editorRef.current) applyFontSize(next, editorRef.current);
      emitChange();
    };

    const handleColor = (color: string) => {
      restoreSelection();
      exec('foreColor', color);
      emitChange();
    };

    // ============ Image insertion ============
    const insertImageFromFile = (file: File) => {
      if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) {
        toast.error('Use imagens PNG ou JPG');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Imagem muito grande (máx. 5MB)');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        const img = new window.Image();
        img.onload = () => {
          restoreSelection();
          const wrapperHTML = `<span class="rte-img-wrap" contenteditable="false" data-align="center" style="display:block;text-align:center;margin:8px 0;"><img src="${src}" alt="" class="rte-image" style="max-width:100%;height:auto;aspect-ratio:${img.naturalWidth}/${img.naturalHeight};width:${Math.min(400, img.naturalWidth)}px;cursor:pointer;border-radius:4px;" draggable="false"/></span><p><br/></p>`;
          exec('insertHTML', wrapperHTML);
          emitChange();
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) insertImageFromFile(file);
      e.target.value = '';
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      const files = Array.from(e.dataTransfer.files || []);
      const imageFile = files.find((f) => f.type.startsWith('image/'));
      if (imageFile) {
        e.preventDefault();
        // Place caret at drop point
        const range = (document as any).caretRangeFromPoint?.(e.clientX, e.clientY);
        if (range) {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          savedRangeRef.current = range.cloneRange();
        }
        insertImageFromFile(imageFile);
      }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      if (Array.from(e.dataTransfer.items || []).some((i) => i.kind === 'file')) {
        e.preventDefault();
      }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find((i) => i.type.startsWith('image/'));
      if (imgItem) {
        e.preventDefault();
        const file = imgItem.getAsFile();
        if (file) insertImageFromFile(file);
      }
    };

    // ============ Image click → alignment toolbar ============
    const [imgToolbar, setImgToolbar] = useState<{
      top: number;
      left: number;
      el: HTMLImageElement;
    } | null>(null);

    const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      // Image alignment toolbar
      if (target.tagName === 'IMG' && target.classList.contains('rte-image')) {
        const img = target as HTMLImageElement;
        const rect = img.getBoundingClientRect();
        const editorRect = editorRef.current!.getBoundingClientRect();
        setImgToolbar({
          top: rect.top - editorRect.top - 36,
          left: rect.left - editorRect.left,
          el: img,
        });
        setSelectedCell(null);
        setCellMenuPos(null);
        return;
      }
      // Table cell menu
      const td = target.closest('td[data-row]') as HTMLTableCellElement | null;
      if (td) {
        const rect = td.getBoundingClientRect();
        const editorRect = editorRef.current!.getBoundingClientRect();
        setSelectedCell(td);
        setCellMenuPos({
          top: rect.top - editorRect.top - 38,
          left: rect.left - editorRect.left,
        });
        setImgToolbar(null);
        return;
      }
      setImgToolbar(null);
      setSelectedCell(null);
      setCellMenuPos(null);
    };

    const setImageAlign = (align: 'left' | 'center' | 'right') => {
      if (!imgToolbar) return;
      const wrap = imgToolbar.el.closest('.rte-img-wrap') as HTMLElement | null;
      if (!wrap) return;
      wrap.setAttribute('data-align', align);
      if (align === 'center') {
        wrap.style.cssText = 'display:block;text-align:center;margin:8px 0;float:none;';
      } else if (align === 'left') {
        wrap.style.cssText = 'display:block;float:left;margin:4px 12px 4px 0;';
      } else {
        wrap.style.cssText = 'display:block;float:right;margin:4px 0 4px 12px;';
      }
      emitChange();
    };

    const resizeImage = (delta: number) => {
      if (!imgToolbar) return;
      const img = imgToolbar.el;
      const current = img.getBoundingClientRect().width;
      const next = Math.max(60, Math.min(900, current + delta));
      img.style.width = `${next}px`;
      emitChange();
    };

    // ============ Table cell operations ============
    const insertTable = (rows: number, cols: number) => {
      restoreSelection();
      exec('insertHTML', buildEmptyTable(rows, cols));
      if (editorRef.current) recalculateTables(editorRef.current);
      emitChange();
    };

    const reindexTable = (table: HTMLTableElement) => {
      // Reset header row letters
      const headerCells = table.querySelectorAll('thead th');
      headerCells.forEach((th, i) => {
        th.textContent = colIndexToLetter(i);
      });
      const bodyRows = table.querySelectorAll('tbody tr');
      bodyRows.forEach((tr, rIdx) => {
        tr.querySelectorAll<HTMLTableCellElement>('td').forEach((td, cIdx) => {
          td.setAttribute('data-row', String(rIdx + 1));
          td.setAttribute('data-col', colIndexToLetter(cIdx));
        });
      });
    };

    const ensureHeaderColumns = (table: HTMLTableElement, totalCols: number) => {
      const thead = table.querySelector('thead tr');
      if (!thead) return;
      const current = thead.children.length;
      if (totalCols > current) {
        for (let i = current; i < totalCols; i++) {
          const th = document.createElement('th');
          th.style.cssText =
            'border:1px solid #cbd5e1;background:#f1f5f9;font-size:11px;color:#64748b;padding:4px;text-align:center;';
          th.textContent = colIndexToLetter(i);
          thead.appendChild(th);
        }
      } else if (totalCols < current) {
        while (thead.children.length > totalCols) thead.removeChild(thead.lastChild!);
      }
    };

    const cellOp = (op: 'addRowBelow' | 'addColRight' | 'delRow' | 'delCol') => {
      if (!selectedCell) return;
      const td = selectedCell;
      const tr = td.parentElement as HTMLTableRowElement;
      const table = td.closest('table') as HTMLTableElement;
      if (!table || !tr) return;
      const colIndex = Array.from(tr.children).indexOf(td);

      if (op === 'addRowBelow') {
        const newTr = document.createElement('tr');
        for (let i = 0; i < tr.children.length; i++) {
          const newTd = document.createElement('td');
          newTd.style.cssText = 'border:1px solid #cbd5e1;padding:6px;min-width:48px;vertical-align:top;';
          newTr.appendChild(newTd);
        }
        tr.after(newTr);
      } else if (op === 'addColRight') {
        const allRows = table.querySelectorAll('tbody tr');
        allRows.forEach((row) => {
          const newTd = document.createElement('td');
          newTd.style.cssText = 'border:1px solid #cbd5e1;padding:6px;min-width:48px;vertical-align:top;';
          const ref = row.children[colIndex] as HTMLElement;
          ref?.after(newTd);
        });
        ensureHeaderColumns(table, (table.querySelector('tbody tr')?.children.length) || 0);
      } else if (op === 'delRow') {
        const bodyRows = table.querySelectorAll('tbody tr');
        if (bodyRows.length <= 1) {
          toast.error('A tabela precisa de pelo menos 1 linha');
          return;
        }
        tr.remove();
      } else if (op === 'delCol') {
        const firstRow = table.querySelector('tbody tr');
        if (firstRow && firstRow.children.length <= 1) {
          toast.error('A tabela precisa de pelo menos 1 coluna');
          return;
        }
        table.querySelectorAll('tbody tr').forEach((row) => {
          row.children[colIndex]?.remove();
        });
        ensureHeaderColumns(table, (table.querySelector('tbody tr')?.children.length) || 0);
      }
      reindexTable(table);
      setSelectedCell(null);
      setCellMenuPos(null);
      recalculateTables(editorRef.current!);
      emitChange();
    };

    const setCellBg = (color: string) => {
      if (!selectedCell) return;
      selectedCell.style.background = color === 'transparent' ? '' : color;
      emitChange();
    };

    const toggleCellCurrency = () => {
      if (!selectedCell) return;
      const td = selectedCell;
      if (td.getAttribute('data-format') === 'currency') {
        td.removeAttribute('data-format');
      } else {
        td.setAttribute('data-format', 'currency');
      }
      recalculateTables(editorRef.current!);
      emitChange();
    };

    const deleteTable = () => {
      if (!selectedCell) return;
      const table = selectedCell.closest('table');
      table?.remove();
      setSelectedCell(null);
      setCellMenuPos(null);
      emitChange();
    };

    // When user types `=...` in a cell and presses Enter or blurs, store formula
    const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter') {
        const sel = window.getSelection();
        const node = sel?.anchorNode;
        const td = (node?.nodeType === 1 ? (node as HTMLElement) : node?.parentElement)?.closest(
          'td[data-row]',
        ) as HTMLTableCellElement | null;
        if (td) {
          const text = (td.textContent || '').trim();
          if (text.startsWith('=')) {
            e.preventDefault();
            td.setAttribute('data-formula', text);
            recalculateTables(editorRef.current!);
            emitChange();
          }
        }
      }
    };

    const handleEditorBlur = () => {
      saveSelection();
      const el = editorRef.current;
      if (!el) return;
      el.querySelectorAll<HTMLTableCellElement>('td[data-row]').forEach((td) => {
        const text = (td.textContent || '').trim();
        if (text.startsWith('=') && !td.hasAttribute('data-formula')) {
          td.setAttribute('data-formula', text);
        }
      });
      recalculateTables(el);
      emitChange();
    };

    useImperativeHandle(ref, () => ({
      insertText: (text: string) => {
        restoreSelection();
        if (!document.queryCommandSupported || !document.queryCommandSupported('insertText')) {
          exec('insertHTML', text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        } else {
          exec('insertText', text);
        }
        emitChange();
        saveSelection();
      },
      focus: () => editorRef.current?.focus(),
    }));

    return (
      <div className={cn('rounded-lg border bg-muted/40', className)}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 border-b bg-background/70 px-2 py-1.5 sticky top-0 z-10 rounded-t-lg">
          <Select value={font} onValueChange={handleFontChange}>
            <SelectTrigger className="h-7 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {FONTS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  <span style={{ fontFamily: f.value }} className="text-sm">
                    {f.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(size)} onValueChange={handleSizeChange}>
            <SelectTrigger className="h-7 w-[64px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZES.map((s) => (
                <SelectItem key={s} value={String(s)} className="text-xs">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="mx-1 h-5 w-px bg-border" />

          <button type="button" title="Negrito" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('bold')} className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted">
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Itálico" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('italic')} className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted">
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Sublinhado" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('underline')} className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted">
            <Underline className="h-3.5 w-3.5" />
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button type="button" title="Cor do texto" onMouseDown={(e) => e.preventDefault()} className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted">
                <Palette className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="grid grid-cols-5 gap-1.5">
                {COLORS.map((c) => (
                  <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleColor(c)} style={{ background: c }} className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform" title={c} />
                ))}
                <label className="col-span-5 mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  Personalizada:
                  <input type="color" onChange={(e) => handleColor(e.target.value)} className="h-5 w-8 cursor-pointer rounded border" />
                </label>
              </div>
            </PopoverContent>
          </Popover>

          <div className="mx-1 h-5 w-px bg-border" />

          <button type="button" title="Alinhar à esquerda" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('justifyLeft')} className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted">
            <AlignLeft className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Centralizar" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('justifyCenter')} className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted">
            <AlignCenter className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Alinhar à direita" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('justifyRight')} className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted">
            <AlignRight className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Justificar" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('justifyFull')} className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted">
            <AlignJustify className="h-3.5 w-3.5" />
          </button>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* Image */}
          <button
            type="button"
            title="Inserir imagem (PNG/JPG)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={handleFileInput}
          />

          {/* Table */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Inserir tabela"
                onMouseDown={(e) => e.preventDefault()}
                className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
              >
                <TableIcon className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1.5">
                    {gridHover.r > 0 ? `${gridHover.r} × ${gridHover.c}` : 'Selecione o tamanho'}
                  </div>
                  <div
                    className="grid grid-cols-10 gap-0.5"
                    onMouseLeave={() => setGridHover({ r: 0, c: 0 })}
                  >
                    {Array.from({ length: 80 }).map((_, idx) => {
                      const r = Math.floor(idx / 10) + 1;
                      const c = (idx % 10) + 1;
                      const active = r <= gridHover.r && c <= gridHover.c;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onMouseEnter={() => setGridHover({ r, c })}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => insertTable(r, c)}
                          className={cn(
                            'h-4 w-4 rounded-sm border',
                            active
                              ? 'bg-primary border-primary'
                              : 'bg-muted/40 border-border hover:bg-muted',
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="border-t pt-2">
                  <div className="text-[11px] text-muted-foreground mb-1.5">Inserção manual</div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={manualRows}
                      onChange={(e) => setManualRows(parseInt(e.target.value || '1', 10))}
                      className="h-7 w-16 text-xs"
                      placeholder="Linhas"
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input
                      type="number"
                      min={1}
                      max={26}
                      value={manualCols}
                      onChange={(e) => setManualCols(parseInt(e.target.value || '1', 10))}
                      className="h-7 w-16 text-xs"
                      placeholder="Colunas"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertTable(manualRows, manualCols)}
                      className="h-7 rounded bg-primary px-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      Inserir
                    </button>
                  </div>
                </div>
                <div className="border-t pt-2 text-[10px] text-muted-foreground leading-relaxed">
                  Fórmulas: <code>=SOMA(A1:A5)</code>, <code>=A1+B2</code>, <code>=A1*B1</code>, <code>=MEDIA(A1:A5)</code>.
                  Pressione Enter para calcular.
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Writing page */}
        <div className="p-3 sm:p-4 relative">
          <div className="mx-auto max-w-[680px] rounded-md border bg-white shadow-sm dark:bg-zinc-50 relative">
            {isEmpty && placeholder && (
              <div className="pointer-events-none absolute left-6 top-6 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-400">
                {placeholder}
              </div>
            )}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyUp={saveSelection}
              onKeyDown={handleEditorKeyDown}
              onMouseUp={saveSelection}
              onClick={handleEditorClick}
              onBlur={handleEditorBlur}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onPaste={handlePaste}
              spellCheck
              style={{ fontFamily: font, fontSize: `${size}px` }}
              className={cn(
                'prose prose-sm max-w-none px-6 py-6 outline-none text-zinc-900 caret-primary leading-relaxed',
                minHeightClassName,
              )}
            />

            {/* Image floating toolbar */}
            {imgToolbar && (
              <div
                className="absolute z-20 flex items-center gap-0.5 rounded-md border bg-background shadow-md px-1 py-0.5"
                style={{ top: imgToolbar.top, left: imgToolbar.left }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <button type="button" onClick={() => setImageAlign('left')} className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted" title="Contornar à esquerda">
                  <AlignLeft className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => setImageAlign('center')} className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted" title="Centralizar">
                  <AlignCenter className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => setImageAlign('right')} className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted" title="Contornar à direita">
                  <AlignRight className="h-3 w-3" />
                </button>
                <div className="mx-0.5 h-4 w-px bg-border" />
                <button type="button" onClick={() => resizeImage(-40)} className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted" title="Diminuir">
                  <Minus className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => resizeImage(40)} className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted" title="Aumentar">
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const wrap = imgToolbar.el.closest('.rte-img-wrap');
                    wrap?.remove();
                    setImgToolbar(null);
                    emitChange();
                  }}
                  className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-destructive/10 text-destructive"
                  title="Remover imagem"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Cell floating menu */}
            {selectedCell && cellMenuPos && (
              <div
                className="absolute z-20 flex items-center gap-0.5 rounded-md border bg-background shadow-md px-1 py-0.5"
                style={{ top: Math.max(0, cellMenuPos.top), left: cellMenuPos.left }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <button type="button" onClick={() => cellOp('addRowBelow')} className="h-6 rounded px-1.5 text-[10px] hover:bg-muted" title="Adicionar linha">
                  +Linha
                </button>
                <button type="button" onClick={() => cellOp('addColRight')} className="h-6 rounded px-1.5 text-[10px] hover:bg-muted" title="Adicionar coluna">
                  +Coluna
                </button>
                <button type="button" onClick={() => cellOp('delRow')} className="h-6 rounded px-1.5 text-[10px] hover:bg-muted text-destructive" title="Excluir linha">
                  −Linha
                </button>
                <button type="button" onClick={() => cellOp('delCol')} className="h-6 rounded px-1.5 text-[10px] hover:bg-muted text-destructive" title="Excluir coluna">
                  −Coluna
                </button>
                <div className="mx-0.5 h-4 w-px bg-border" />
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted" title="Cor de fundo">
                      <Palette className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <div className="grid grid-cols-5 gap-1.5">
                      {CELL_BG_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setCellBg(c)}
                          style={{ background: c === 'transparent' ? 'repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 8px 8px' : c }}
                          className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform"
                          title={c}
                        />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <button
                  type="button"
                  onClick={toggleCellCurrency}
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted',
                    selectedCell.getAttribute('data-format') === 'currency' && 'bg-primary/10 text-primary',
                  )}
                  title="Formato moeda (R$)"
                >
                  <DollarSign className="h-3 w-3" />
                </button>
                <div className="mx-0.5 h-4 w-px bg-border" />
                <button type="button" onClick={deleteTable} className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-destructive/10 text-destructive" title="Excluir tabela">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

RichTextEditor.displayName = 'RichTextEditor';

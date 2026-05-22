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
  // execCommand is deprecated but remains the simplest cross-browser inline editor API
  document.execCommand(command, false, value);
};

const fontSizeToExecValue = (px: number): string => {
  // execCommand fontSize accepts 1-7. We use 7 then override with span style.
  return '7';
};

const applyFontSize = (px: number, editor: HTMLDivElement) => {
  exec('fontSize', '7');
  // Replace font tags created by execCommand with spans of the right pixel size
  editor.querySelectorAll('font[size="7"]').forEach((node) => {
    const span = document.createElement('span');
    span.style.fontSize = `${px}px`;
    span.innerHTML = (node as HTMLElement).innerHTML;
    node.replaceWith(span);
  });
};

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  ({ value, onChange, placeholder, className, minHeightClassName = 'min-h-[420px]' }, ref) => {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const savedRangeRef = useRef<Range | null>(null);
    const [font, setFont] = useState(FONTS[0].value);
    const [size, setSize] = useState<number>(14);
    const [isEmpty, setIsEmpty] = useState(!value);

    // Sync external value into the editor only when it differs from what's already there
    useEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      if (el.innerHTML !== (value || '')) {
        el.innerHTML = value || '';
      }
      setIsEmpty(!el.textContent?.trim());
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

    const handleInput = () => {
      const el = editorRef.current;
      if (!el) return;
      setIsEmpty(!el.textContent?.trim());
      onChange(el.innerHTML);
    };

    const runCommand = (command: string, valueArg?: string) => {
      restoreSelection();
      exec(command, valueArg);
      handleInput();
      saveSelection();
    };

    const handleFontChange = (newFont: string) => {
      setFont(newFont);
      restoreSelection();
      exec('fontName', newFont);
      handleInput();
    };

    const handleSizeChange = (delta: number | string) => {
      const next = typeof delta === 'number' ? delta : parseInt(delta, 10);
      if (!Number.isFinite(next) || next < 6 || next > 96) return;
      setSize(next);
      restoreSelection();
      if (editorRef.current) applyFontSize(next, editorRef.current);
      handleInput();
    };

    const handleColor = (color: string) => {
      restoreSelection();
      exec('foreColor', color);
      handleInput();
    };

    useImperativeHandle(ref, () => ({
      insertText: (text: string) => {
        restoreSelection();
        if (!document.queryCommandSupported || !document.queryCommandSupported('insertText')) {
          // Fallback
          exec('insertHTML', text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        } else {
          exec('insertText', text);
        }
        handleInput();
        saveSelection();
      },
      focus: () => editorRef.current?.focus(),
    }));

    return (
      <div className={cn('rounded-lg border bg-muted/40', className)}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 border-b bg-background/70 px-2 py-1.5 sticky top-0 z-10 rounded-t-lg">
          {/* Font family */}
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

          {/* Font size */}
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

          {/* B / I / U */}
          <button
            type="button"
            title="Negrito"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('bold')}
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Itálico"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('italic')}
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Sublinhado"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('underline')}
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
          >
            <Underline className="h-3.5 w-3.5" />
          </button>

          {/* Color */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Cor do texto"
                onMouseDown={(e) => e.preventDefault()}
                className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
              >
                <Palette className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="grid grid-cols-5 gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleColor(c)}
                    style={{ background: c }}
                    className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform"
                    title={c}
                  />
                ))}
                <label className="col-span-5 mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  Personalizada:
                  <input
                    type="color"
                    onChange={(e) => handleColor(e.target.value)}
                    className="h-5 w-8 cursor-pointer rounded border"
                  />
                </label>
              </div>
            </PopoverContent>
          </Popover>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* Alignment */}
          <button
            type="button"
            title="Alinhar à esquerda"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('justifyLeft')}
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Centralizar"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('justifyCenter')}
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Alinhar à direita"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('justifyRight')}
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
          >
            <AlignRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Justificar"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('justifyFull')}
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
          >
            <AlignJustify className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Writing page */}
        <div className="p-3 sm:p-4">
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
              onMouseUp={saveSelection}
              onBlur={saveSelection}
              spellCheck
              style={{ fontFamily: font, fontSize: `${size}px` }}
              className={cn(
                'prose prose-sm max-w-none px-6 py-6 outline-none text-zinc-900 caret-primary leading-relaxed',
                minHeightClassName,
              )}
            />
          </div>
        </div>
      </div>
    );
  },
);

RichTextEditor.displayName = 'RichTextEditor';

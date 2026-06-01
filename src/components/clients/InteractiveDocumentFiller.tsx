import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  buildFilledDocumentContent,
  htmlToPlainText,
  isAutoFilledVariable,
  tokenizeDocumentLine,
  type DocumentFieldToken,
} from '@/lib/documentTemplateFields';

export interface InteractiveDocumentState {
  formData: Record<string, string>;
  yesNoAnswers: Record<string, 'sim' | 'nao' | ''>;
  additionalInfo: Record<string, string>;
  checkboxAnswers: Record<string, boolean>;
}

export const emptyDocumentState = (): InteractiveDocumentState => ({
  formData: {},
  yesNoAnswers: {},
  additionalInfo: {},
  checkboxAnswers: {},
});

export function buildContentFromState(rawContent: string, state: InteractiveDocumentState): string {
  const content = buildFilledDocumentContent({
    content: htmlToPlainText(rawContent),
    formData: state.formData,
    yesNoAnswers: state.yesNoAnswers,
    additionalInfo: state.additionalInfo,
    checkboxAnswers: state.checkboxAnswers,
  });
  if (state.additionalInfo.observacoes?.trim()) {
    return `${content}\n\nObservações adicionais: ${state.additionalInfo.observacoes.trim()}`;
  }
  return content;
}

interface Props {
  rawContent: string;
  state: InteractiveDocumentState;
  onChange: (next: InteractiveDocumentState) => void;
  showObservations?: boolean;
}

/**
 * Interactive renderer for a document template body.
 * - Lines with {variable} become inputs (or chips when auto-filled)
 * - "( ) Sim ( ) Não" patterns become radio groups
 * - Single "( )" tokens become checkboxes
 * - [TEXTO_LIVRE] and "_____" become text/textarea
 * Mirrors PreencherDocumento layout so users see the same writing UI.
 */
export function InteractiveDocumentFiller({ rawContent, state, onChange, showObservations = true }: Props) {
  const plain = htmlToPlainText(rawContent);

  const setForm = (k: string, v: string) =>
    onChange({ ...state, formData: { ...state.formData, [k]: v } });
  const setYesNo = (k: string, v: 'sim' | 'nao') =>
    onChange({ ...state, yesNoAnswers: { ...state.yesNoAnswers, [k]: v } });
  const setAdditional = (k: string, v: string) =>
    onChange({ ...state, additionalInfo: { ...state.additionalInfo, [k]: v } });
  const toggleCheckbox = (k: string) =>
    onChange({ ...state, checkboxAnswers: { ...state.checkboxAnswers, [k]: !state.checkboxAnswers[k] } });

  const renderToken = (token: DocumentFieldToken, lineIndex: number, tokenIndex: number) => {
    const key = `${lineIndex}-${tokenIndex}`;
    switch (token.type) {
      case 'text':
        return <span key={key} className="whitespace-pre-wrap">{token.value}</span>;
      case 'variable': {
        const value = state.formData[token.fieldKey] || '';
        if (isAutoFilledVariable(token.name)) {
          return (
            <span key={key} className="inline-flex min-h-9 min-w-[120px] items-center rounded-md border bg-muted px-3 py-2 text-sm font-medium">
              {value || '—'}
            </span>
          );
        }
        return (
          <Input
            key={key}
            value={value}
            onChange={(e) => setForm(token.fieldKey, e.target.value)}
            placeholder={token.label || token.name}
            className="inline-flex h-9 min-w-[180px] w-[220px] align-middle"
          />
        );
      }
      case 'yesno':
        return (
          <RadioGroup
            key={key}
            value={state.yesNoAnswers[token.fieldKey] || ''}
            onValueChange={(v) => setYesNo(token.fieldKey, v as 'sim' | 'nao')}
            className="inline-flex flex-row items-center gap-4 align-middle"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="sim" id={`${token.fieldKey}-sim`} />
              <Label htmlFor={`${token.fieldKey}-sim`} className="cursor-pointer">Sim</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="nao" id={`${token.fieldKey}-nao`} />
              <Label htmlFor={`${token.fieldKey}-nao`} className="cursor-pointer">Não</Label>
            </div>
          </RadioGroup>
        );
      case 'freeText':
        return (
          <Textarea
            key={key}
            value={state.additionalInfo[token.fieldKey] || ''}
            onChange={(e) => setAdditional(token.fieldKey, e.target.value)}
            placeholder="Digite sua resposta aqui..."
            rows={3}
            className="mt-2 min-h-[96px] w-full resize-none"
          />
        );
      case 'blankField':
        return (
          <Input
            key={key}
            value={state.additionalInfo[token.fieldKey] || ''}
            onChange={(e) => setAdditional(token.fieldKey, e.target.value)}
            placeholder="Digite sua resposta..."
            className="inline-flex h-9 min-w-[180px] w-[220px] align-middle"
          />
        );
      case 'checkbox': {
        const checked = !!state.checkboxAnswers[token.fieldKey];
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggleCheckbox(token.fieldKey)}
            aria-pressed={checked}
            aria-label={token.label}
            title={token.label}
            className={`inline-flex h-6 w-6 items-center justify-center rounded border-2 align-middle font-bold text-sm transition-colors ${
              checked
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-primary/50 hover:border-primary hover:bg-primary/10'
            }`}
          >
            {checked ? '✓' : ''}
          </button>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {plain.split('\n').map((line, index) => {
        const tokens = tokenizeDocumentLine(line, index);
        // Empty / blank lines: render as plain spacer (no bordered card) to avoid
        // "little empty brackets" between questions.
        const isBlankLine =
          tokens.length === 0 ||
          (tokens.length === 1 && tokens[0].type === 'text' && !tokens[0].value.trim());
        if (isBlankLine) {
          return <div key={`line-${index}`} className="h-2" aria-hidden="true" />;
        }
        const hasBlockField = tokens.some((t) => t.type === 'freeText');
        return (
          <div key={`line-${index}`} className="space-y-2 rounded-lg border border-border/60 bg-card p-4">
            <div className={`flex flex-wrap items-center gap-2 text-sm leading-7 ${hasBlockField ? 'flex-col items-stretch' : ''}`}>
              {tokens.map((t, ti) => renderToken(t, index, ti))}
            </div>
          </div>
        );
      })}
      {showObservations && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-card p-4">
          <Label className="text-sm font-medium">Observações adicionais</Label>
          <Textarea
            value={state.additionalInfo.observacoes || ''}
            onChange={(e) => setAdditional('observacoes', e.target.value)}
            placeholder="Adicione informações complementares se necessário..."
            rows={3}
            className="resize-none"
          />
        </div>
      )}
    </div>
  );
}

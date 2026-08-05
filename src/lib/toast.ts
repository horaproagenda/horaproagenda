/**
 * Camada única de notificações do aplicativo.
 *
 * Este módulo substitui globalmente o pacote `sonner` (via alias no Vite),
 * garantindo que TODA notificação exibida — erro, conflito, aviso ou sucesso —
 * passe pelo tradutor `humanizeError`. Assim o usuário nunca vê códigos
 * (23505, PGRST116, 500, "non-2xx"), nomes de constraint ou texto em inglês:
 * apenas a explicação do que aconteceu e o que fazer.
 */
import { toast as baseToast } from 'sonner-original';
import { humanizeToastMessage } from '@/lib/humanError';

export * from 'sonner-original';

type ToastFn = typeof baseToast;
type ToastArgs = Parameters<ToastFn>;
type ToastMessage = ToastArgs[0];
type ToastOptions = Record<string, unknown> | undefined;

function humanizeOptions(options: ToastOptions, humanize: boolean): ToastOptions {
  if (!options || typeof options !== 'object') return options;
  const description = (options as { description?: unknown }).description;
  if (description === undefined) return options;
  return {
    ...options,
    description: humanize
      ? humanizeToastMessage(description)
      : humanizeToastMessage(description),
  } as ToastOptions;
}

function wrap<T extends (message: ToastMessage, options?: ToastOptions) => unknown>(fn: T) {
  return ((message: ToastMessage, options?: ToastOptions) =>
    fn(
      humanizeToastMessage(message) as ToastMessage,
      humanizeOptions(options, true),
    )) as T;
}

const humanizedToast = ((...args: ToastArgs) =>
  baseToast(
    humanizeToastMessage(args[0]) as ToastMessage,
    humanizeOptions(args[1] as ToastOptions, false) as ToastArgs[1],
  )) as ToastFn;

// Copia todas as APIs originais (dismiss, custom, loading, promise, getHistory…)
Object.assign(humanizedToast, baseToast);

humanizedToast.error = wrap(baseToast.error.bind(baseToast)) as ToastFn['error'];
humanizedToast.warning = wrap(baseToast.warning.bind(baseToast)) as ToastFn['warning'];
humanizedToast.success = wrap(baseToast.success.bind(baseToast)) as ToastFn['success'];
humanizedToast.info = wrap(baseToast.info.bind(baseToast)) as ToastFn['info'];
humanizedToast.message = wrap(baseToast.message.bind(baseToast)) as ToastFn['message'];

export const toast = humanizedToast;
export default humanizedToast;

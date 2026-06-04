import { Component, ErrorInfo, ReactNode, createRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, WifiOff, ShieldAlert, LifeBuoy, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

type ErrorKind = 'network' | 'auth' | 'chunk' | 'unknown';

interface State {
  hasError: boolean;
  error?: Error;
  kind: ErrorKind;
}

const SUPPORT_EMAIL = 'suporte@agendalume.app';

function classify(error?: Error): ErrorKind {
  const msg = (error?.message || '').toLowerCase();
  const name = (error?.name || '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) return 'network';
  if (msg.includes('chunkloaderror') || name.includes('chunkloaderror') || msg.includes('loading chunk') || msg.includes('dynamically imported module')) return 'chunk';
  if (msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('auth')) return 'auth';
  return 'unknown';
}

const COPY: Record<ErrorKind, { title: string; description: string; icon: typeof AlertTriangle; hint: string }> = {
  network: {
    title: 'Sem conexão com o servidor',
    description: 'Não conseguimos falar com o Lume Agenda. Verifique sua internet e tente novamente.',
    icon: WifiOff,
    hint: 'Próximos passos: confirme sua conexão Wi-Fi/4G, desative VPN se houver, e tente novamente.',
  },
  chunk: {
    title: 'Nova versão disponível',
    description: 'Uma atualização do app foi publicada. Recarregue para baixar a versão mais recente.',
    icon: RotateCcw,
    hint: 'Próximos passos: clique em “Recarregar agora”. Seus dados não foram perdidos.',
  },
  auth: {
    title: 'Sessão expirada',
    description: 'Sua sessão de acesso expirou ou foi invalidada. Faça login novamente para continuar.',
    icon: ShieldAlert,
    hint: 'Próximos passos: recarregue a página e entre com seu e-mail e senha.',
  },
  unknown: {
    title: 'Algo deu errado',
    description: 'Encontramos um problema ao carregar a tela de acesso. Tente novamente em alguns instantes.',
    icon: AlertTriangle,
    hint: 'Próximos passos: tente recarregar. Se o erro persistir, entre em contato com nosso suporte.',
  },
};

export class AuthErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, kind: 'unknown' };
  private dialogRef = createRef<HTMLDivElement>();
  private primaryBtnRef = createRef<HTMLButtonElement>();
  private lastActive: HTMLElement | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, kind: classify(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AuthErrorBoundary] Erro na tela de autenticação:', error, info);
  }

  componentDidUpdate(_prev: Props, prevState: State) {
    // Quando o erro aparece: salva o foco atual e move o foco para a ação primária
    if (!prevState.hasError && this.state.hasError) {
      this.lastActive = (document.activeElement as HTMLElement) ?? null;
      // Aguarda paint antes de focar para garantir que o elemento existe
      requestAnimationFrame(() => {
        this.primaryBtnRef.current?.focus();
      });
    }
    // Quando o erro é resolvido: devolve o foco para o elemento anterior
    if (prevState.hasError && !this.state.hasError) {
      this.lastActive?.focus?.();
      this.lastActive = null;
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, kind: 'unknown' });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleSupport = () => {
    const subject = encodeURIComponent('Erro na tela de login do Lume Agenda');
    const body = encodeURIComponent(
      `Olá, equipe de suporte.\n\nEncontrei um erro ao acessar a tela de login.\n\nTipo: ${this.state.kind}\nMensagem: ${this.state.error?.message || 'desconhecida'}\nNavegador: ${navigator.userAgent}\nData: ${new Date().toLocaleString('pt-BR')}\n`,
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  };

  // Foco em loop dentro do diálogo + Esc reinicia o boundary
  handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.handleRetry();
      return;
    }
    if (e.key !== 'Tab') return;
    const root = this.dialogRef.current;
    if (!root) return;
    const focusables = root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const copy = COPY[this.state.kind];
    const Icon = copy.icon;
    const titleId = 'auth-error-title';
    const descId = 'auth-error-desc';

    return (
      <div className="flex min-h-dvh items-center justify-center gradient-hero p-4">
        <div
          ref={this.dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onKeyDown={this.handleKeyDown}
          className="w-full max-w-md"
        >
          <Card className="shadow-lg">
            <CardHeader className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-destructive" aria-hidden="true" />
                </div>
              </div>
              <CardTitle id={titleId} className="text-xl">{copy.title}</CardTitle>
              <CardDescription id={descId}>{copy.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">{copy.hint}</p>
              {this.state.error?.message && (
                <p
                  className="text-[11px] text-muted-foreground break-words font-mono"
                  aria-label="Detalhe técnico do erro"
                >
                  {this.state.error.message}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  ref={this.primaryBtnRef}
                  variant="outline"
                  onClick={this.handleRetry}
                  aria-label="Tentar novamente sem recarregar a página"
                >
                  <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" /> Tentar novamente
                </Button>
                <Button onClick={this.handleReload} aria-label="Recarregar a página inteira">
                  <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" /> Recarregar
                </Button>
              </div>
              <Button
                variant="ghost"
                className="w-full"
                onClick={this.handleSupport}
                aria-label={`Enviar e-mail para o suporte em ${SUPPORT_EMAIL}`}
              >
                <LifeBuoy className="h-4 w-4 mr-2" aria-hidden="true" /> Falar com o suporte
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Dica: use <kbd className="px-1 rounded border">Tab</kbd> para navegar e{' '}
                <kbd className="px-1 rounded border">Esc</kbd> para tentar novamente.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
}

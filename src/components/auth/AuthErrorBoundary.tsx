import { Component, ErrorInfo, ReactNode } from 'react';
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

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, kind: classify(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AuthErrorBoundary] Erro na tela de autenticação:', error, info);
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

  render() {
    if (!this.state.hasError) return this.props.children;
    const copy = COPY[this.state.kind];
    const Icon = copy.icon;

    return (
      <div className="flex min-h-screen items-center justify-center gradient-hero p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <Icon className="h-5 w-5 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-xl">{copy.title}</CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">{copy.hint}</p>
            {this.state.error?.message && (
              <p className="text-[11px] text-muted-foreground/80 break-words font-mono">
                {this.state.error.message}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={this.handleRetry}>
                <RotateCcw className="h-4 w-4 mr-2" /> Tentar novamente
              </Button>
              <Button onClick={this.handleReload}>
                <RefreshCw className="h-4 w-4 mr-2" /> Recarregar
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={this.handleSupport}>
              <LifeBuoy className="h-4 w-4 mr-2" /> Falar com o suporte
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
}

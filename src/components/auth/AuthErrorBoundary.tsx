import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class AuthErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AuthErrorBoundary] Erro na tela de autenticação:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center gradient-hero p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-xl">Algo deu errado</CardTitle>
            <CardDescription>
              Não foi possível carregar a tela de acesso. Tente recarregar a página — seus dados não foram perdidos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {this.state.error?.message && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 break-words">
                {this.state.error.message}
              </p>
            )}
            <Button className="w-full" onClick={this.handleReload}>
              <RefreshCw className="h-4 w-4 mr-2" /> Recarregar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
}

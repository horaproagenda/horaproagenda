import { useState } from 'react';
import { Compass, ExternalLink, Loader2, MoreHorizontal, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { InstallAppButton } from './InstallAppButton';
import {
  IN_APP_BROWSER_LABEL,
  detectInAppBrowser,
  isAndroidDevice,
  isIOSDevice,
  openInSystemBrowser,
} from '@/lib/inAppBrowser';
import { toast } from '@/lib/toast';

const SESSION_KEY = 'save-to-phone-banner-hidden';

/**
 * Aviso do topo que ajuda o profissional a manter o aplicativo salvo no
 * celular — principalmente quando ele entrou por um link do WhatsApp, onde o
 * app é encerrado ao apagar a tela.
 */
export function SaveToPhoneBanner() {
  const { isInstalled } = useInstallPrompt();
  const kind = detectInAppBrowser();
  const [opening, setOpening] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  });

  if (isInstalled || hidden) return null;
  if (!kind) return null;

  const ios = isIOSDevice();
  const android = isAndroidDevice();

  const hide = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(SESSION_KEY, 'true');
    } catch {
      /* ignore */
    }
  };

  const handleOpenBrowser = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const result = await openInSystemBrowser();
      if (result === 'opened' || result === 'shared') return;
      if (result === 'copied') {
        toast.success('Link copiado. Veja abaixo como abrir no navegador do celular.');
      } else {
        toast.error('Seu aplicativo bloqueou a abertura automática. Veja como fazer em poucos toques.');
      }
      setShowHelp(true);
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      <div
        data-testid="save-to-phone-banner"
        className="flex flex-wrap items-center gap-2 border-b border-border bg-primary-soft/60 px-3 py-2 text-xs text-foreground"
      >
        <Smartphone className="h-4 w-4 flex-shrink-0 text-primary" />
        <p className="min-w-[12rem] flex-1 leading-snug">
          Você abriu pelo {IN_APP_BROWSER_LABEL[kind]}. Aqui o aplicativo fecha quando a tela apaga —
          salve o {android ? 'aplicativo no Chrome' : 'aplicativo no Safari'} para abrir pelo ícone.
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 text-xs"
            onClick={handleOpenBrowser}
            disabled={opening}
            data-testid="open-system-browser"
          >
            {opening ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ExternalLink className="h-3.5 w-3.5" />
            )}
            {android ? 'Abrir no Chrome' : 'Abrir no navegador'}
          </Button>
          <InstallAppButton label="Salvar no celular" />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={hide}
            aria-label="Fechar aviso"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Abrir no navegador do celular</DialogTitle>
            <DialogDescription className="text-xs">
              O {IN_APP_BROWSER_LABEL[kind]} não permite a troca automática. São dois toques, pelo
              próprio {IN_APP_BROWSER_LABEL[kind]}.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-3 text-sm" data-testid="open-browser-help">
            {ios ? (
              <>
                <li className="flex items-start gap-2">
                  <Compass className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <span>
                    Toque no ícone de <strong>bússola do Safari</strong>, na barra de baixo desta tela.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <MoreHorizontal className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <span>
                    Se não aparecer, toque nos <strong>três pontinhos</strong> e escolha{' '}
                    <strong>Abrir no Safari</strong>.
                  </span>
                </li>
              </>
            ) : (
              <>
                <li className="flex items-start gap-2">
                  <MoreHorizontal className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <span>
                    Toque nos <strong>três pontinhos</strong> no canto desta tela.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <ExternalLink className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <span>
                    Escolha <strong>Abrir no navegador</strong> (ou cole o link copiado no Chrome).
                  </span>
                </li>
              </>
            )}
          </ol>

          <p className="break-all rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
            {typeof window !== 'undefined' ? window.location.href : ''}
          </p>

          <DialogFooter>
            <Button size="sm" className="h-8 text-xs" onClick={() => setShowHelp(false)}>
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

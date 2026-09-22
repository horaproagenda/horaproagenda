import { useState } from 'react';
import { ExternalLink, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { InstallAppButton } from './InstallAppButton';
import {
  IN_APP_BROWSER_LABEL,
  detectInAppBrowser,
  isAndroidDevice,
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
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  });

  if (isInstalled || hidden) return null;
  if (!kind) return null;

  const hide = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(SESSION_KEY, 'true');
    } catch {
      /* ignore */
    }
  };

  const handleOpenBrowser = async () => {
    const result = await openInSystemBrowser();
    if (result === 'copied') {
      toast.success('Link copiado. Abra o Safari e cole o endereço para salvar o aplicativo.');
    } else if (result === 'unavailable') {
      toast.error('Copie o endereço desta página e abra no navegador do celular.');
    }
  };

  return (
    <div
      data-testid="save-to-phone-banner"
      className="flex flex-wrap items-center gap-2 border-b border-border bg-primary-soft/60 px-3 py-2 text-xs text-foreground"
    >
      <Smartphone className="h-4 w-4 flex-shrink-0 text-primary" />
      <p className="min-w-[12rem] flex-1 leading-snug">
        Você abriu pelo {IN_APP_BROWSER_LABEL[kind]}. Aqui o aplicativo fecha quando a tela apaga —
        salve o {isAndroidDevice() ? 'aplicativo no Chrome' : 'aplicativo no Safari'} para abrir pelo ícone.
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="h-8 gap-1.5 text-xs"
          onClick={handleOpenBrowser}
          data-testid="open-system-browser"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {isAndroidDevice() ? 'Abrir no Chrome' : 'Copiar link'}
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
  );
}

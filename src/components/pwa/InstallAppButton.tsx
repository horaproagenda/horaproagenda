import { useState } from 'react';
import { Download, Share2, PlusSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { toast } from '@/lib/toast';

interface InstallAppButtonProps {
  /** Mostra apenas o ícone (cabeçalhos compactos). */
  compact?: boolean;
  className?: string;
}

export function InstallAppButton({ compact = false, className }: InstallAppButtonProps) {
  const { showButton, canPrompt, isIOS, promptInstall, dismiss } = useInstallPrompt();
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  if (!showButton) return null;

  const handleClick = async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        toast.success('Aplicativo adicionado à tela inicial');
      } else if (outcome === 'dismissed') {
        dismiss();
      }
      return;
    }
    if (isIOS) setShowIOSHelp(true);
  };

  return (
    <>
      <Button
        variant="outline"
        size={compact ? 'icon' : 'sm'}
        onClick={handleClick}
        className={compact ? `h-7 w-7 flex-shrink-0 ${className ?? ''}` : `h-7 gap-1.5 text-xs ${className ?? ''}`}
        title="Adicionar o aplicativo à tela inicial"
        aria-label="Adicionar o aplicativo à tela inicial"
        data-testid="install-app-button"
      >
        <Download className="h-3.5 w-3.5" />
        {!compact && <span>Instalar aplicativo</span>}
      </Button>

      <Dialog
        open={showIOSHelp}
        onOpenChange={(open) => {
          setShowIOSHelp(open);
          if (!open) dismiss();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Adicionar à tela de início</DialogTitle>
            <DialogDescription className="text-xs">
              No iPhone e iPad são dois toques, feitos pelo próprio Safari.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-2">
              <Share2 className="mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
              <span>Toque no botão <strong>Compartilhar</strong>, na barra do Safari.</span>
            </li>
            <li className="flex items-start gap-2">
              <PlusSquare className="mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
              <span>Escolha <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.</span>
            </li>
          </ol>

          <DialogFooter>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setShowIOSHelp(false);
                dismiss();
              }}
            >
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState } from 'react';
import { Download, Share2, PlusSquare, MoreVertical, MonitorDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { toast } from '@/lib/toast';

interface InstallAppButtonProps {
  /** Mostra apenas o ícone (cabeçalhos compactos). */
  compact?: boolean;
  className?: string;
  /** Estilo do botão (a landing usa destaque). */
  variant?: 'outline' | 'default' | 'secondary';
  /** Tamanho maior para chamadas de ação. */
  size?: 'sm' | 'default' | 'lg';
  label?: string;
}

export function InstallAppButton({
  compact = false,
  className,
  variant = 'outline',
  size = 'sm',
  label = 'Instalar aplicativo',
}: InstallAppButtonProps) {
  const { showButton, canPrompt, isIOS, promptInstall, dismiss } = useInstallPrompt();
  const [showHelp, setShowHelp] = useState(false);

  if (!showButton) return null;

  const handleClick = async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        toast.success('Aplicativo adicionado à tela inicial');
        return;
      }
      if (outcome === 'dismissed') {
        dismiss();
        return;
      }
    }
    // Sem convite automático do navegador: mostramos o passo a passo.
    setShowHelp(true);
  };

  return (
    <>
      <Button
        variant={variant}
        size={compact ? 'icon' : size}
        onClick={handleClick}
        className={compact ? `h-7 w-7 flex-shrink-0 ${className ?? ''}` : `gap-1.5 ${className ?? ''}`}
        title="Adicionar o aplicativo à tela inicial"
        aria-label="Adicionar o aplicativo à tela inicial"
        data-testid="install-app-button"
      >
        <Download className="h-3.5 w-3.5" />
        {!compact && <span>{label}</span>}
      </Button>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Adicionar à tela de início</DialogTitle>
            <DialogDescription className="text-xs">
              {isIOS
                ? 'No iPhone e iPad são dois toques, feitos pelo próprio Safari.'
                : 'Seu navegador faz isso pelo próprio menu, em poucos toques.'}
            </DialogDescription>
          </DialogHeader>

          {isIOS ? (
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
          ) : (
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <MoreVertical className="mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                <span>No celular: abra o <strong>menu do navegador</strong> e toque em <strong>Adicionar à tela inicial</strong> (ou <strong>Instalar aplicativo</strong>).</span>
              </li>
              <li className="flex items-start gap-2">
                <MonitorDown className="mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                <span>No notebook ou tablet: clique no ícone de <strong>instalar</strong> na barra de endereço e confirme em <strong>Instalar</strong>.</span>
              </li>
            </ol>
          )}

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

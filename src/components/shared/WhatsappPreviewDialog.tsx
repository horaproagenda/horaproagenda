import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MessageCircle, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { openWhatsappWithMessage } from '@/lib/whatsappLink';

interface WhatsappPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone?: string;
  /** Initial message text shown in the preview. */
  initialMessage: string;
  /** Optional dialog title. */
  title?: string;
  /** Optional description shown under the title. */
  description?: string;
  /** Called with the final (possibly edited) message after the user confirms sending. */
  onSent?: (finalMessage: string) => void;
}

/**
 * Reusable dialog that shows a preview of the WhatsApp message before sending,
 * allowing the user to edit it. Used by every "Enviar no WhatsApp" button.
 */
export function WhatsappPreviewDialog({
  open,
  onOpenChange,
  phone,
  initialMessage,
  title = 'Prévia da mensagem',
  description = 'Revise e edite a mensagem antes de enviar para o WhatsApp.',
  onSent,
}: WhatsappPreviewDialogProps) {
  const [message, setMessage] = useState(initialMessage);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setMessage(initialMessage);
      setCopied(false);
    }
  }, [open, initialMessage]);

  const handleSend = () => {
    const result = openWhatsappWithMessage(phone || '', message);
    if (!result.ok) {
      toast.error('Não foi possível abrir o WhatsApp.');
      return;
    }
    onSent?.(message);
    onOpenChange(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success('Mensagem copiada!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Erro ao copiar mensagem.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-500" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-2">
          {phone && (
            <p className="text-xs text-muted-foreground">
              Destinatário: <span className="font-medium text-foreground">{phone}</span>
            </p>
          )}
          <Label htmlFor="whatsapp-preview-message" className="text-sm">
            Mensagem
          </Label>
          <Textarea
            id="whatsapp-preview-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={12}
            className="font-mono text-xs whitespace-pre-wrap"
            placeholder="Digite a mensagem..."
          />
          <p className="text-[11px] text-muted-foreground">
            {message.length} caracteres
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleCopy} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
            <MessageCircle className="h-4 w-4" />
            Enviar no WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

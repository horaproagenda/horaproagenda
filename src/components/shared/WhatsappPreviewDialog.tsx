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
import { MessageCircle, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { useWhatsapp } from '@/hooks/useWhatsapp';

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
  const [recipientPhone, setRecipientPhone] = useState(phone || '');
  const [copied, setCopied] = useState(false);
  const { sendMessage, isLoading } = useWhatsapp();

  useEffect(() => {
    if (open) {
      setMessage(initialMessage);
      setRecipientPhone(phone || '');
      setCopied(false);
    }
  }, [open, initialMessage, phone]);

  const handleSend = async () => {
    if (!recipientPhone.trim()) {
      toast.error('Informe o número de WhatsApp do destinatário.');
      return;
    }
    const result = await sendMessage(recipientPhone, message);
    if (!result) return;
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
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp-preview-phone" className="text-sm">
              WhatsApp do destinatário
            </Label>
            <Input
              id="whatsapp-preview-phone"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              inputMode="tel"
            />
          </div>
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
          <Button onClick={handleSend} disabled={isLoading} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            Enviar direto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

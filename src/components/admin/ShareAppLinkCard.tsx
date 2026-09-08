import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/toast';

function currentAppLink() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* segue para o método alternativo */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function ShareAppLinkCard() {
  const [copied, setCopied] = useState(false);
  const link = currentAppLink();

  const handleShare = async () => {
    const message = `Use o Hora Pro para organizar sua agenda: ${link}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Hora Pro — Agenda profissional', text: message, url: link });
        return;
      } catch {
        /* usuário cancelou ou não suportado: cai para copiar */
      }
    }

    const ok = await copyToClipboard(link);
    if (ok) {
      setCopied(true);
      toast.success('Link copiado', { description: 'Cole no WhatsApp ou e-mail para compartilhar.' });
      window.setTimeout(() => setCopied(false), 2500);
    } else {
      toast.error('Não foi possível copiar o link. Selecione o endereço e copie manualmente.');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-wide">
          <Share2 className="h-4 w-4 text-primary" />
          Compartilhar link do aplicativo
        </CardTitle>
        <CardDescription className="text-xs">
          Envie o endereço do aplicativo para outros profissionais e amigos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code
          className="flex-1 min-w-0 truncate rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground"
          data-testid="share-app-link-value"
        >
          {link}
        </code>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={handleShare}
          data-testid="share-app-link-button"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Link copiado' : 'Compartilhar link'}
        </Button>
      </CardContent>
    </Card>
  );
}

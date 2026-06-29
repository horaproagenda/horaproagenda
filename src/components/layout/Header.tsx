import { useEffect, useRef, useState } from 'react';
import { Camera, Menu, RefreshCw } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NotificationsPanel } from './NotificationsPanel';
import { OfflineStatusBadge } from '@/components/shared/OfflineStatusBadge';
import { useGlobalRefresh } from '@/hooks/useGlobalRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name || '').trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || '';
    const initials = `${first}${second}`.toUpperCase();
    if (initials) return initials;
  }
  return (email?.[0] || 'U').toUpperCase();
}

export function Header({ title, subtitle, onMenuClick }: HeaderProps) {
  const { refreshAll, isRefreshing } = useGlobalRefresh();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [signedAvatar, setSignedAvatar] = useState<string | null>(null);

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Usuário';
  const displayEmail = profile?.email || user?.email || '';
  const initials = getInitials(profile?.full_name || user?.user_metadata?.full_name, displayEmail);

  // Generate signed URL for the avatar (bucket is private)
  useEffect(() => {
    let cancelled = false;
    const path = profile?.avatar_url;
    if (!path) {
      setSignedAvatar(null);
      return;
    }
    // If already absolute URL, use it
    if (/^https?:\/\//i.test(path)) {
      setSignedAvatar(path);
      return;
    }
    supabase.storage
      .from('avatars')
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setSignedAvatar(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.avatar_url]);

  const handlePickPhoto = () => fileInputRef.current?.click();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Arquivo inválido', description: 'Envie uma imagem.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Imagem muito grande', description: 'Limite de 5MB.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from('profiles')
        .update({ avatar_url: path })
        .eq('id', user.id);
      if (updErr) throw updErr;

      const { data: signed } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60);
      setSignedAvatar(signed?.signedUrl ?? null);
      toast({ title: 'Foto atualizada' });
    } catch (err: any) {
      toast({ title: 'Erro ao enviar foto', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 md:h-20 items-center justify-between border-b border-border bg-background/95 px-3 md:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="md:hidden h-9 w-9 shrink-0"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="font-display text-base md:text-2xl font-semibold text-foreground truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="hidden md:block mt-0.5 text-sm text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 md:gap-4 shrink-0">
        <OfflineStatusBadge />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshAll}
              disabled={isRefreshing}
              className="relative h-9 w-9"
              aria-label="Sincronizar todos os dados"
            >
              <RefreshCw className={`h-4 w-4 md:h-5 md:w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="sr-only">Sincronizar todos os dados</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Sincronizar todos os dados</p>
          </TooltipContent>
        </Tooltip>

        <NotificationsPanel />

        {/* User Menu */}
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handlePickPhoto}
                disabled={uploading}
                className="group relative rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40"
                aria-label="Alterar foto de perfil"
              >
                <Avatar className="h-8 w-8 md:h-9 md:w-9 border-2 border-primary/20">
                  {signedAvatar && <AvatarImage src={signedAvatar} alt={displayName} />}
                  <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                  <Camera className="h-2.5 w-2.5" />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{uploading ? 'Enviando...' : 'Alterar foto de perfil'}</p>
            </TooltipContent>
          </Tooltip>
          <div className="hidden lg:block max-w-[180px]">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

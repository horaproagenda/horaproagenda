import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Mail, Trash2, Edit, Camera, X, Loader2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useClients } from '@/hooks/useClients';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ClientHeaderProps {
  client: Client;
  onEdit?: () => void;
  onUpdate?: (updates: Partial<Client>) => Promise<unknown>;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

function safeParseInfo(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function ClientHeader({ client, onEdit, onUpdate }: ClientHeaderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { deleteClient, forceDeleteClient } = useClients();
  const { hasRole, user } = useAuth();
  const canDelete = hasRole('admin');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingBalance, setPendingBalance] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showDeleteDialog) return;
    setPendingBalance(null);
    supabase
      .rpc('get_client_outstanding_balance' as any, { _client_id: client.id })
      .then(({ data }) => setPendingBalance(Number(data) || 0));
  }, [showDeleteDialog, client.id]);

  const handleDelete = async () => {
    await deleteClient.mutateAsync(client.id);
    navigate('/clientes');
  };

  const handleForceDelete = async () => {
    await forceDeleteClient.mutateAsync(client.id);
    navigate('/clientes');
  };

  // Load avatar (signed URL) safely after mount
  useEffect(() => {
    let cancelled = false;
    const parsed = safeParseInfo(client.complementary_info);
    const path = typeof parsed.avatar_path === 'string' ? parsed.avatar_path : null;
    if (!path) {
      setAvatarUrl(null);
      return;
    }
    supabase.storage
      .from('client-photos')
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setAvatarUrl(data.signedUrl);
      })
      .catch(() => {
        if (!cancelled) setAvatarUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client.id, client.complementary_info]);

  const refreshClient = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['client', client.id] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  }, [queryClient, client.id]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input value so picking the same file again still triggers onChange
    e.target.value = '';
    if (!file) return;

    if (!user) {
      toast.error('Sessão expirada. Faça login novamente para enviar fotos.');
      return;
    }

    // Basic validations to avoid silent failures on mobile
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem (JPG, PNG, HEIC ou WebP).');
      return;
    }
    const maxBytes = 15 * 1024 * 1024; // 15MB
    if (file.size > maxBytes) {
      toast.error('A foto é muito grande. Use uma imagem de até 15 MB.');
      return;
    }

    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${client.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('client-photos')
        .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });

      if (uploadError) throw uploadError;

      const parsed = safeParseInfo(client.complementary_info);
      const nextInfo = { ...parsed, avatar_path: path };

      const { error: updateError } = await supabase
        .from('clients')
        .update({ complementary_info: JSON.stringify(nextInfo) })
        .eq('id', client.id);

      if (updateError) throw updateError;

      const { data: urlData } = await supabase.storage
        .from('client-photos')
        .createSignedUrl(path, 3600);
      if (urlData?.signedUrl) setAvatarUrl(urlData.signedUrl);

      refreshClient();
      toast.success('Foto atualizada!');
    } catch (error) {
      console.error('Error uploading photo:', error);
      const message = error instanceof Error ? error.message : 'Tente novamente em alguns segundos.';
      toast.error(`Não foi possível enviar a foto. ${message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    try {
      const parsed = safeParseInfo(client.complementary_info);
      const path = typeof parsed.avatar_path === 'string' ? parsed.avatar_path : null;

      if (path) {
        await supabase.storage.from('client-photos').remove([path]);
      }
      delete parsed.avatar_path;
      const nextValue = Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : null;

      const { error: updateError } = await supabase
        .from('clients')
        .update({ complementary_info: nextValue })
        .eq('id', client.id);
      if (updateError) throw updateError;

      setAvatarUrl(null);
      refreshClient();
      toast.success('Foto removida!');
    } catch (error) {
      console.error('Error removing photo:', error);
      toast.error('Erro ao remover foto');
    }
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card/80 backdrop-blur-sm transition-all duration-300">
      {/* Avatar with photo upload */}
      <div className="relative group">
        <Avatar className="h-14 w-14 border-2 border-primary/10">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={client.name} />}
          <AvatarFallback className="bg-primary/5 text-primary font-semibold text-lg">
            {getInitials(client.name)}
          </AvatarFallback>
        </Avatar>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoUpload}
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-6 w-6 rounded-full shadow-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
          </Button>
        </div>
        {avatarUrl && !uploading && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleRemovePhoto}
          >
            <X className="h-2.5 w-2.5" />
          </Button>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-semibold text-foreground truncate">{client.name}</h2>
          <Badge variant={client.is_active ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-4">
            {client.is_active ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {client.phone}
          </span>
          {client.email && (
            <span className="flex items-center gap-1 truncate max-w-[180px]">
              <Mail className="h-3 w-3" />
              {client.email}
            </span>
          )}
          <span className="hidden sm:inline">
            Cliente desde {format(new Date(client.created_at), 'MMM/yy', { locale: ptBR })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5">
        {onEdit && (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onEdit}>
            <Edit className="h-3.5 w-3.5 mr-1" />
            Editar
          </Button>
        )}
        {canDelete && (
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="h-8 text-xs">
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base">Excluir Cliente</AlertDialogTitle>
                <AlertDialogDescription className="text-sm">
                  Excluir "{client.name}"? Esta ação removerá documentos, fotos e orçamentos.
                  <br /><br />
                  <strong className="text-destructive text-xs">Clientes com agendamentos não podem ser excluídos.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

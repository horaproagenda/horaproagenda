import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Mail, Trash2, Edit, Camera, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useClients } from '@/hooks/useClients';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

export function ClientHeader({ client, onEdit, onUpdate }: ClientHeaderProps) {
  const navigate = useNavigate();
  const { deleteClient } = useClients();
  const { hasRole } = useAuth();
  const canDelete = hasRole('admin');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDelete = async () => {
    await deleteClient.mutateAsync(client.id);
    navigate('/clientes');
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdate) return;

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${client.id}/avatar.${ext}`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('client-photos')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get signed URL
      const { data: urlData } = await supabase.storage
        .from('client-photos')
        .createSignedUrl(path, 31536000); // 1 year

      if (urlData?.signedUrl) {
        await onUpdate({ notes: client.notes }); // trigger refresh
        // Store the path in complementary_info or a field - we use a convention
        await supabase.from('clients').update({ 
          complementary_info: JSON.stringify({
            ...(() => { try { return JSON.parse(client.complementary_info || '{}'); } catch { return {}; } })(),
            avatar_path: path
          })
        }).eq('id', client.id);
        toast.success('Foto atualizada!');
        window.location.reload(); // Simple refresh to show new photo
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error('Erro ao enviar foto');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!onUpdate) return;
    try {
      let parsed: any = {};
      try { parsed = JSON.parse(client.complementary_info || '{}'); } catch {}
      
      if (parsed.avatar_path) {
        await supabase.storage.from('client-photos').remove([parsed.avatar_path]);
      }
      delete parsed.avatar_path;
      await supabase.from('clients').update({ 
        complementary_info: Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : client.complementary_info?.includes('{') ? null : client.complementary_info
      }).eq('id', client.id);
      toast.success('Foto removida!');
      window.location.reload();
    } catch (error) {
      toast.error('Erro ao remover foto');
    }
  };

  // Try to get avatar URL from complementary_info
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useState(() => {
    try {
      const parsed = JSON.parse(client.complementary_info || '{}');
      if (parsed.avatar_path) {
        supabase.storage.from('client-photos').createSignedUrl(parsed.avatar_path, 3600)
          .then(({ data }) => { if (data?.signedUrl) setAvatarUrl(data.signedUrl); });
      }
    } catch {}
  });

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
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Button 
            variant="secondary" 
            size="icon" 
            className="h-6 w-6 rounded-full shadow-sm" 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="h-3 w-3" />
          </Button>
        </div>
        {avatarUrl && (
          <Button
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
          <Badge variant={client.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 h-4">
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
            Cliente desde {format(new Date(client.created_at), "MMM/yy", { locale: ptBR })}
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

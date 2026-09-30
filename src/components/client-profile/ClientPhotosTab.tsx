import { useState, useRef, useMemo, useEffect } from 'react';
import { TreatmentPhoto, TreatmentStage } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Image, Upload, Filter, Trash2, ChevronLeft, ChevronRight, Download } from 'lucide-react';

type StageFilter = 'all' | TreatmentStage;
import { useUploadFile } from '@/hooks/useClientProfile';
import { getSignedPhotoUrls } from '@/hooks/useSignedPhotoUrl';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { downloadBlob, getFileNameWithExtension, getStorageBlob } from '@/lib/storageFileAccess';
import { buildClientStoragePath, assertClientStoragePath } from '@/lib/clientUploadPath';

interface ClientPhotosTabProps {
  photos: TreatmentPhoto[];
  clientId: string;
  onAddPhoto: (photo: Omit<TreatmentPhoto, 'id' | 'created_at' | 'appointment'>) => Promise<unknown>;
}

const stageLabels: Record<TreatmentStage, string> = {
  before: 'Antes',
  during: 'Durante',
  after: 'Depois',
};

const stageColors: Record<TreatmentStage, string> = {
  before: 'bg-orange-100 text-orange-700',
  during: 'bg-accent/10 text-accent',
  after: 'bg-primary/10 text-primary',
};

const stageFilterOptions: { value: StageFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'before', label: 'Antes' },
  { value: 'during', label: 'Durante' },
  { value: 'after', label: 'Após' },
];


export function ClientPhotosTab({ photos, clientId, onAddPhoto }: ClientPhotosTabProps) {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canDeletePhotos = hasRole('admin');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [stage, setStage] = useState<TreatmentStage>('before');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useUploadFile();
  
  // State for signed URLs - use signed URLs for private bucket access
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
  const [urlsLoading, setUrlsLoading] = useState(false);

  // Fetch signed URLs for all photos when photos change
  useEffect(() => {
    const fetchSignedUrls = async () => {
      if (photos.length === 0) {
        setSignedUrls(new Map());
        return;
      }
      
      setUrlsLoading(true);
      try {
        const urls = await getSignedPhotoUrls(photos);
        setSignedUrls(urls);
      } catch (error) {
        console.error('Error fetching signed URLs:', error);
      } finally {
        setUrlsLoading(false);
      }
    };

    fetchSignedUrls();
  }, [photos]);

  // Helper to get the display URL for a photo
  const getPhotoUrl = (photo: TreatmentPhoto): string => {
    if (photo.file_path && signedUrls.has(photo.file_path)) {
      return signedUrls.get(photo.file_path)!;
    }
    // Fallback to stored URL (may not work if bucket is private)
    return photo.file_url || '/placeholder.svg';
  };

  const handleDeletePhoto = async (photoId: string, filePath: string | null) => {
    if (!canDeletePhotos) {
      toast.error('Apenas administradores podem apagar fotos.');
      return;
    }

    setDeletingId(photoId);
    try {
      // Delete from storage if path exists
      if (filePath) {
        await supabase.storage.from('client-photos').remove([filePath]);
      }
      
      // Delete from database
      const { error } = await supabase
        .from('treatment_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['client-photos', clientId] });
      setSelectedPhotoIndex(null);
      toast.success('Foto excluída com sucesso!');
    } catch (error) {
      console.error('Error deleting photo:', error);
      toast.error('Erro ao excluir foto');
    } finally {
      setDeletingId(null);
    }
  };
  const filteredPhotos = useMemo(() => {
    if (stageFilter === 'all') return photos;
    return photos.filter(p => p.stage === stageFilter);
  }, [photos, stageFilter]);


  const photosByStage = useMemo(() => {
    return filteredPhotos.reduce((acc, photo) => {
      if (!acc[photo.stage]) acc[photo.stage] = [];
      acc[photo.stage].push(photo);
      return acc;
    }, {} as Record<TreatmentStage, TreatmentPhoto[]>);
  }, [filteredPhotos]);

  const selectedPhoto = selectedPhotoIndex !== null ? filteredPhotos[selectedPhotoIndex] : null;

  const goToPhoto = (direction: 'previous' | 'next') => {
    if (selectedPhotoIndex === null || filteredPhotos.length === 0) return;
    setSelectedPhotoIndex(
      direction === 'previous'
        ? (selectedPhotoIndex - 1 + filteredPhotos.length) % filteredPhotos.length
        : (selectedPhotoIndex + 1) % filteredPhotos.length
    );
  };

  useEffect(() => {
    if (selectedPhotoIndex === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedPhotoIndex(null);
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPhoto('previous');
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToPhoto('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhotoIndex, filteredPhotos.length]);

  const handleDownloadPhoto = async (photo: TreatmentPhoto) => {
    try {
      const blob = await getStorageBlob({
        bucket: 'client-photos',
        filePath: photo.file_path,
        fileUrl: photo.file_url,
      });
      downloadBlob(blob, getFileNameWithExtension(`foto-${photo.id}`, photo.file_path || photo.file_url, `foto-${photo.id}.jpg`));
    } catch (error) {
      console.error('Error downloading photo:', error);
      toast.error('Erro ao baixar foto');
    }
  };

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const clearSelection = () => {
    previews.forEach((p) => p?.startsWith('blob:') && URL.revokeObjectURL(p));
    setFile(null);
    setFiles([]);
    setPreview(null);
    setPreviews([]);
  };

  const removeSelected = (idx: number) => {
    const p = previews[idx];
    if (p?.startsWith('blob:')) URL.revokeObjectURL(p);
    const nextFiles = files.filter((_, i) => i !== idx);
    const nextPreviews = previews.filter((_, i) => i !== idx);
    setFiles(nextFiles);
    setPreviews(nextPreviews);
    setFile(nextFiles[0] ?? null);
    setPreview(nextPreviews[0] ?? null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    // Allow re-selecting the same files later (important on iOS Safari)
    e.target.value = '';
    if (selectedFiles.length === 0) return;

    const validFiles = selectedFiles.filter(f => {
      const isImg = f.type.startsWith('image/');
      const extOk = /\.(jpe?g|png|webp|heic|heif|avif|gif|tiff|bmp)$/i.test(f.name);
      if (!isImg && !extOk) {
        toast.error(`"${f.name}" não é uma imagem válida e foi ignorada.`);
        return false;
      }
      if (f.size > 25 * 1024 * 1024) {
        toast.error(`"${f.name}" passa de 25 MB e foi ignorada.`);
        return false;
      }
      // Evita duplicar a mesma foto ao selecionar de novo
      if (files.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) {
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // Soma à seleção anterior (antes substituía e perdia as primeiras fotos)
    const nextFiles = [...files, ...validFiles];
    // Pré-visualização leve: não carrega a foto inteira na memória do celular
    const nextPreviews = [...previews, ...validFiles.map((f) => URL.createObjectURL(f))];
    setFiles(nextFiles);
    setPreviews(nextPreviews);
    setFile(nextFiles[0]);
    setPreview(nextPreviews[0]);
  };

  const uploadWithRetry = async (fileToUpload: File, attempts = 3) => {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        // Caminho novo a cada tentativa: nunca colide com um envio parcial anterior
        const path = buildClientStoragePath(clientId, fileToUpload.name, 'photos');
        assertClientStoragePath(clientId, path);
        const result = await uploadFile(fileToUpload, path);
        await onAddPhoto({
          client_id: clientId,
          appointment_id: null,
          stage,
          file_path: result.path,
          file_url: result.url,
          notes: notes.trim() || null,
          taken_at: new Date().toISOString(),
        });
        return;
      } catch (err) {
        lastError = err;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw lastError;
  };

  const handleSubmit = async () => {
    const filesToUpload = files.length > 0 ? files : (file ? [file] : []);
    if (filesToUpload.length === 0) {
      toast.error('Selecione pelo menos uma foto');
      return;
    }

    setLoading(true);
    const failedIdx: number[] = [];
    try {
      // Uma foto por vez, cada uma isolada: falha em uma não cancela as outras
      for (let i = 0; i < filesToUpload.length; i++) {
        setProgress({ current: i + 1, total: filesToUpload.length });
        try {
          await uploadWithRetry(filesToUpload[i]);
        } catch (err) {
          console.error('Falha ao enviar foto', filesToUpload[i].name, err);
          failedIdx.push(i);
        }
      }
    } finally {
      setProgress(null);
      setLoading(false);
      // Atualiza a galeria uma única vez, depois do lote inteiro
      queryClient.invalidateQueries({ queryKey: ['client-photos', clientId] });
    }

    const saved = filesToUpload.length - failedIdx.length;
    if (failedIdx.length === 0) {
      toast.success(saved === 1 ? 'Foto salva com sucesso!' : `Todas as ${saved} fotos foram salvas!`);
      clearSelection();
      setOpen(false);
      setNotes('');
      setStage('before');
      return;
    }

    // Mantém na tela só as que falharam, prontas para reenviar
    const keepFiles = failedIdx.map((i) => files[i] ?? filesToUpload[i]);
    const keepPreviews = failedIdx.map((i) => previews[i]).filter(Boolean);
    previews.forEach((p, i) => !failedIdx.includes(i) && p?.startsWith('blob:') && URL.revokeObjectURL(p));
    setFiles(keepFiles);
    setPreviews(keepPreviews);
    setFile(keepFiles[0] ?? null);
    setPreview(keepPreviews[0] ?? null);
    toast.error(
      `${saved} de ${filesToUpload.length} fotos salvas. ${failedIdx.length} não foram enviadas (conexão instável). Elas continuam selecionadas — toque em Salvar para reenviar.`,
    );
  };


  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap min-w-0 items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as StageFilter)}>
            <SelectTrigger className="w-full min-w-0 sm:w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stageFilterOptions.map(option => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filteredPhotos.length} foto(s)</span>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!loading) setOpen(v); }}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" className="h-7 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Adicionar
            </Button>
          </DialogTrigger>

          <DialogContent
            className="max-w-sm max-h-[85vh] flex flex-col"
            onInteractOutside={(e) => loading && e.preventDefault()}
            onEscapeKeyDown={(e) => loading && e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="text-base">Adicionar Foto</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 max-h-[60vh]">
              <div className="space-y-3 py-2 pr-4">
                <div className="space-y-1">
                  <Label className="text-xs">Etapa</Label>
                  <Select value={stage} onValueChange={(v) => setStage(v as TreatmentStage)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="before" className="text-xs">Antes</SelectItem>
                      <SelectItem value="during" className="text-xs">Durante</SelectItem>
                      <SelectItem value="after" className="text-xs">Depois</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Fotos * (múltiplas permitidas)</Label>
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    className="hidden" 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    multiple 
                  />
                  {previews.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {previews.map((p, idx) => (
                          <div key={p} className="relative">
                            <img src={p} alt={`Foto ${idx + 1}`} className="w-full h-16 object-cover rounded-lg bg-muted" />
                            {!loading && (
                              <button
                                type="button"
                                aria-label={`Remover foto ${idx + 1}`}
                                onClick={() => removeSelected(idx)}
                                className="absolute top-0.5 right-0.5 h-6 w-6 rounded-full bg-background/90 text-foreground text-xs border"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={loading} onClick={() => fileInputRef.current?.click()}>
                          <Plus className="h-3 w-3 mr-1" /> Mais fotos
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={loading} onClick={clearSelection}>
                          Remover todas
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" className="w-full h-24 text-xs" onClick={() => fileInputRef.current?.click()}>
                      <div className="flex flex-col items-center gap-1">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                        <span className="text-muted-foreground">Clique para selecionar (várias fotos)</span>
                      </div>
                    </Button>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Observações</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações..." rows={2} className="text-xs" />
                </div>
              </div>
            </ScrollArea>
            <div className="pt-3 border-t space-y-2">
              {progress && (
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">Não feche esta janela até terminar.</p>
                </div>
              )}
              <Button onClick={handleSubmit} className="w-full h-8 text-xs" disabled={loading || files.length === 0}>
                {progress
                  ? `Enviando foto ${progress.current} de ${progress.total}...`
                  : `Salvar ${files.length > 1 ? `(${files.length} fotos)` : ''}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={selectedPhotoIndex !== null} onOpenChange={(isOpen) => !isOpen && setSelectedPhotoIndex(null)}>
        <DialogContent className="max-w-[94vw] sm:max-w-4xl max-h-[90vh] p-3 sm:p-4">
          <DialogHeader className="pb-1">
            <DialogTitle className="text-sm">Fotos do Cliente</DialogTitle>
          </DialogHeader>
          {selectedPhoto && (
            <div className="space-y-3">
              <div className="relative flex min-h-[52vh] max-h-[68vh] items-center justify-center rounded-md border bg-muted/20 overflow-hidden">
                <img
                  src={getPhotoUrl(selectedPhoto)}
                  alt={`Foto ${stageLabels[selectedPhoto.stage]}`}
                  loading="eager"
                  className="max-h-[68vh] w-auto max-w-full object-contain"
                />
                {filteredPhotos.length > 1 && (
                  <>
                    <Button variant="secondary" size="icon" className="absolute left-2 top-1/2 h-8 w-8 -translate-y-1/2" onClick={() => goToPhoto('previous')}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="secondary" size="icon" className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2" onClick={() => goToPhoto('next')}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge className={`${stageColors[selectedPhoto.stage]} text-[10px] px-1.5 py-0`} variant="secondary">
                      {stageLabels[selectedPhoto.stage]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(selectedPhoto.taken_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </span>
                    <span className="text-xs text-muted-foreground">{(selectedPhotoIndex ?? 0) + 1}/{filteredPhotos.length}</span>
                  </div>
                  {selectedPhoto.notes && <p className="mt-1 truncate text-xs text-muted-foreground">{selectedPhoto.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleDownloadPhoto(selectedPhoto)}>
                    <Download className="mr-1 h-3.5 w-3.5" />
                    Baixar
                  </Button>
                  {canDeletePhotos && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="h-8 text-xs" disabled={deletingId === selectedPhoto.id}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Apagar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir Foto</AlertDialogTitle>
                          <AlertDialogDescription>Tem certeza que deseja excluir esta foto? Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeletePhoto(selectedPhoto.id, selectedPhoto.file_path)} className="bg-destructive hover:bg-destructive/90">
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Photos Grid */}
      <Card>
        <CardContent className="p-3">
          {filteredPhotos.length === 0 ? (
            <div className="py-6 text-center">
              <Image className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhuma foto encontrada</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(['before', 'during', 'after'] as TreatmentStage[]).map((stageKey) => {
                const stagePhotos = photosByStage[stageKey] || [];
                if (stagePhotos.length === 0) return null;

                return (
                  <div key={stageKey}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`${stageColors[stageKey]} text-[10px] px-1.5 py-0`} variant="secondary">
                        {stageLabels[stageKey]}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">({stagePhotos.length})</span>
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {stagePhotos.map((photo) => (
                        <div key={photo.id} className="group relative">
                          <button
                            type="button"
                            className="block w-full text-left"
                            onClick={() => setSelectedPhotoIndex(filteredPhotos.findIndex((item) => item.id === photo.id))}
                          >
                            <img
                              src={getPhotoUrl(photo)}
                              alt={`Foto ${stageLabels[photo.stage]}`}
                              loading="lazy"
                              className="w-full h-20 object-cover rounded-lg border transition-transform group-hover:scale-105"
                            />
                          </button>
                          <div className="flex items-center justify-between mt-0.5">
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(photo.taken_at), 'dd/MM', { locale: ptBR })}
                            </p>
                            {canDeletePhotos && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    disabled={deletingId === photo.id}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir Foto</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir esta foto? Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleDeletePhoto(photo.id, photo.file_path)}
                                      className="bg-destructive hover:bg-destructive/90"
                                    >
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
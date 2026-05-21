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
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Image, Upload, Filter, Trash2, ChevronLeft, ChevronRight, Download } from 'lucide-react';
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
  during: 'bg-blue-100 text-blue-700',
  after: 'bg-green-100 text-green-700',
};

const getMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = subMonths(now, i);
    options.push({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy', { locale: ptBR }),
    });
  }
  return options;
};

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
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
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
  const monthOptions = useMemo(() => getMonthOptions(), []);

  const filteredPhotos = useMemo(() => {
    const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
    const monthEnd = endOfMonth(monthStart);
    
    return photos.filter(p => {
      try {
        const date = parseISO(p.taken_at);
        return isWithinInterval(date, { start: monthStart, end: monthEnd });
      } catch {
        return false;
      }
    });
  }, [photos, selectedMonth]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    // Allow re-selecting the same files later (important on iOS Safari)
    e.target.value = '';
    if (selectedFiles.length === 0) return;

    const validFiles = selectedFiles.filter(f => {
      if (!f.type.startsWith('image/')) {
        toast.error(`"${f.name}" não é uma imagem válida e foi ignorada.`);
        return false;
      }
      if (f.size > 15 * 1024 * 1024) {
        toast.error(`"${f.name}" passa de 15 MB e foi ignorada.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setFiles(validFiles);
    setFile(validFiles[0]);

    const newPreviews: string[] = [];
    validFiles.forEach((f, index) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newPreviews[index] = reader.result as string;
        if (newPreviews.filter(Boolean).length === validFiles.length) {
          setPreviews([...newPreviews]);
        }
      };
      reader.onerror = () => {
        toast.error(`Não foi possível ler "${f.name}".`);
      };
      reader.readAsDataURL(f);
    });

    const firstReader = new FileReader();
    firstReader.onloadend = () => setPreview(firstReader.result as string);
    firstReader.readAsDataURL(validFiles[0]);
  };

  const handleSubmit = async () => {
    if (files.length === 0 && !file) {
      toast.error('Selecione pelo menos uma foto');
      return;
    }

    setLoading(true);
    try {
      const filesToUpload = files.length > 0 ? files : (file ? [file] : []);
      let uploadedCount = 0;

      for (const fileToUpload of filesToUpload) {
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
        uploadedCount += 1;
      }

      toast.success(`${uploadedCount} foto(s) adicionada(s) com sucesso!`);
      setOpen(false);
      setNotes('');
      setFile(null);
      setFiles([]);
      setPreview(null);
      setPreviews([]);
      setStage('before');
    } catch (error) {
      console.error('Error adding photo:', error);
      const message = error instanceof Error ? error.message : 'Tente novamente em alguns segundos.';
      toast.error(`Erro ao adicionar foto(s). ${message}`);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(option => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filteredPhotos.length} foto(s)</span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" className="h-7 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Adicionar
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-sm max-h-[85vh] flex flex-col">
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
                  {previews.length > 0 || preview ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {(previews.length > 0 ? previews : [preview]).filter(Boolean).map((p, idx) => (
                          <div key={idx} className="relative">
                            <img src={p!} alt={`Preview ${idx + 1}`} className="w-full h-16 object-cover rounded-lg" />
                          </div>
                        ))}
                      </div>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        className="w-full h-6 text-xs" 
                        onClick={() => { 
                          setFile(null); 
                          setFiles([]); 
                          setPreview(null); 
                          setPreviews([]); 
                        }}
                      >
                        Remover todas
                      </Button>
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
            <div className="pt-3 border-t">
              <Button onClick={handleSubmit} className="w-full h-8 text-xs" disabled={loading || (files.length === 0 && !file)}>
                {loading ? 'Salvando...' : `Salvar ${files.length > 1 ? `(${files.length} fotos)` : ''}`}
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
              <p className="text-xs text-muted-foreground">Nenhuma foto neste mês</p>
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
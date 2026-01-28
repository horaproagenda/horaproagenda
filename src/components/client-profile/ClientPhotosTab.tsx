import { useState, useRef, useMemo } from 'react';
import { TreatmentPhoto, TreatmentStage } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Image, Upload, Filter } from 'lucide-react';
import { useUploadFile } from '@/hooks/useClientProfile';
import { toast } from 'sonner';

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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<TreatmentStage>('before');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useUploadFile();

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

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      // Support multiple files
      setFiles(selectedFiles);
      setFile(selectedFiles[0]); // Keep single file for backward compatibility
      
      // Generate previews for all files
      const newPreviews: string[] = [];
      selectedFiles.forEach((f, index) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews[index] = reader.result as string;
          if (newPreviews.filter(Boolean).length === selectedFiles.length) {
            setPreviews([...newPreviews]);
          }
        };
        reader.readAsDataURL(f);
      });
      
      // Set single preview for first file
      const firstReader = new FileReader();
      firstReader.onloadend = () => setPreview(firstReader.result as string);
      firstReader.readAsDataURL(selectedFiles[0]);
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0 && !file) {
      toast.error('Selecione pelo menos uma foto');
      return;
    }

    setLoading(true);
    try {
      const filesToUpload = files.length > 0 ? files : (file ? [file] : []);
      
      for (const fileToUpload of filesToUpload) {
        const timestamp = Date.now();
        const safeName = fileToUpload.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const path = `${clientId}/photos/${timestamp}-${safeName}`;
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
      }

      toast.success(`${filesToUpload.length} foto(s) adicionada(s) com sucesso!`);
      setOpen(false);
      setNotes('');
      setFile(null);
      setFiles([]);
      setPreview(null);
      setPreviews([]);
      setStage('before');
    } catch (error) {
      console.error('Error adding photo:', error);
      toast.error('Erro ao adicionar foto(s)');
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
            <Button size="sm" className="h-7 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Adicionar Foto</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
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

              <Button onClick={handleSubmit} className="w-full h-8 text-xs" disabled={loading || (files.length === 0 && !file)}>
                {loading ? 'Salvando...' : `Salvar ${files.length > 1 ? `(${files.length} fotos)` : ''}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
                          <a href={photo.file_url || '#'} target="_blank" rel="noopener noreferrer">
                            <img
                              src={photo.file_url || '/placeholder.svg'}
                              alt={`Foto ${stageLabels[photo.stage]}`}
                              className="w-full h-20 object-cover rounded-lg border transition-transform group-hover:scale-105"
                            />
                          </a>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {format(new Date(photo.taken_at), 'dd/MM', { locale: ptBR })}
                          </p>
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
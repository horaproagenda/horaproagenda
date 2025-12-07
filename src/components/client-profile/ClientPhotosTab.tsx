import { useState, useRef } from 'react';
import { TreatmentPhoto, TreatmentStage } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Image, Upload } from 'lucide-react';
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
  before: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  during: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  after: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

export function ClientPhotosTab({ photos, clientId, onAddPhoto }: ClientPhotosTabProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<TreatmentStage>('before');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useUploadFile();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Selecione uma foto');
      return;
    }

    setLoading(true);
    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = `${clientId}/photos/${timestamp}-${safeName}`;
      const result = await uploadFile(file, path);

      await onAddPhoto({
        client_id: clientId,
        appointment_id: null,
        stage,
        file_path: result.path,
        file_url: result.url,
        notes: notes.trim() || null,
        taken_at: new Date().toISOString(),
      });

      setOpen(false);
      setNotes('');
      setFile(null);
      setPreview(null);
      setStage('before');
    } catch (error) {
      console.error('Error adding photo:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group photos by stage
  const photosByStage = photos.reduce((acc, photo) => {
    if (!acc[photo.stage]) acc[photo.stage] = [];
    acc[photo.stage].push(photo);
    return acc;
  }, {} as Record<TreatmentStage, TreatmentPhoto[]>);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Fotos de Tratamento</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Foto</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Etapa do Tratamento</Label>
                <Select value={stage} onValueChange={(v) => setStage(v as TreatmentStage)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before">Antes</SelectItem>
                    <SelectItem value="during">Durante</SelectItem>
                    <SelectItem value="after">Depois</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Foto *</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept="image/*"
                />
                {preview ? (
                  <div className="relative">
                    <img
                      src={preview}
                      alt="Preview"
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        setFile(null);
                        setPreview(null);
                      }}
                    >
                      Remover
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-32"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Clique para selecionar uma foto
                      </span>
                    </div>
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações sobre a foto..."
                  rows={3}
                />
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={loading || !file}>
                {loading ? 'Salvando...' : 'Salvar Foto'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {photos.length === 0 ? (
          <div className="py-12 text-center">
            <Image className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhuma foto cadastrada</p>
          </div>
        ) : (
          <div className="space-y-6">
            {(['before', 'during', 'after'] as TreatmentStage[]).map((stageKey) => {
              const stagePhotos = photosByStage[stageKey] || [];
              if (stagePhotos.length === 0) return null;

              return (
                <div key={stageKey}>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className={stageColors[stageKey]} variant="secondary">
                      {stageLabels[stageKey]}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      ({stagePhotos.length} {stagePhotos.length === 1 ? 'foto' : 'fotos'})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {stagePhotos.map((photo) => (
                      <div key={photo.id} className="group relative">
                        <a
                          href={photo.file_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={photo.file_url || '/placeholder.svg'}
                            alt={`Foto ${stageLabels[photo.stage]}`}
                            className="w-full h-32 object-cover rounded-lg border transition-transform group-hover:scale-105"
                          />
                        </a>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(photo.taken_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </p>
                        {photo.notes && (
                          <p className="text-xs text-muted-foreground truncate">
                            {photo.notes}
                          </p>
                        )}
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
  );
}

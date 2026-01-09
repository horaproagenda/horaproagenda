import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DoorOpen, Plus, Trash2, Edit2, Search, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useRooms } from '@/hooks/useRooms';

const roomSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(50, 'Nome muito longo'),
  description: z.string().trim().max(200, 'Descrição muito longa').optional(),
  capacity: z.coerce.number().min(1, 'Capacidade mínima de 1').max(50, 'Capacidade máxima de 50'),
  equipment: z.string().optional(),
  is_active: z.boolean(),
});

type RoomFormData = z.infer<typeof roomSchema>;

interface ManageRoomsDialogProps {
  children?: React.ReactNode;
}

export function ManageRoomsDialog({ children }: ManageRoomsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { rooms, refetch } = useRooms();

  const filteredRooms = rooms.filter(room => 
    room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    room.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const form = useForm<RoomFormData>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      name: '',
      description: '',
      capacity: 1,
      equipment: '',
      is_active: true,
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setShowForm(false);
      setEditingId(null);
      setSearchQuery('');
      form.reset();
    }
  };

  const onSubmit = async (data: RoomFormData) => {
    setIsLoading(true);
    try {
      const equipmentArray = data.equipment
        ? data.equipment.split(',').map(e => e.trim()).filter(Boolean)
        : [];

      if (editingId) {
        const { error } = await supabase
          .from('rooms')
          .update({
            name: data.name,
            description: data.description || null,
            capacity: data.capacity,
            equipment: equipmentArray,
            is_active: data.is_active,
          })
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Sala atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('rooms')
          .insert({
            name: data.name,
            description: data.description || null,
            capacity: data.capacity,
            equipment: equipmentArray,
            is_active: data.is_active,
          });
        if (error) throw error;
        toast.success('Sala cadastrada com sucesso!');
      }

      form.reset();
      setShowForm(false);
      setEditingId(null);
      refetch();
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (room: any) => {
    setEditingId(room.id);
    form.reset({
      name: room.name,
      description: room.description || '',
      capacity: room.capacity,
      equipment: room.equipment?.join(', ') || '',
      is_active: room.is_active,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta sala?')) return;
    
    try {
      const { data: services } = await supabase
        .from('services')
        .select('id')
        .eq('room_id', id)
        .limit(1);
      
      if (services && services.length > 0) {
        toast.error('Não é possível excluir: sala possui serviços vinculados.');
        return;
      }

      const { data: appointments } = await supabase
        .from('appointments')
        .select('id')
        .eq('room_id', id)
        .limit(1);
      
      if (appointments && appointments.length > 0) {
        toast.error('Não é possível excluir: sala possui agendamentos vinculados.');
        return;
      }

      const { error } = await supabase.from('rooms').delete().eq('id', id);
      if (error) throw error;
      toast.success('Sala removida!');
      refetch();
    } catch (error: any) {
      if (error.message?.includes('violates foreign key constraint')) {
        toast.error('Não é possível excluir: sala possui dados vinculados no sistema.');
      } else {
        toast.error('Erro ao remover: ' + error.message);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <DoorOpen className="h-4 w-4" />
            Salas
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0 pb-2">
          <DialogTitle className="text-lg font-semibold">
            {showForm ? (editingId ? 'Editar Sala' : 'Nova Sala') : 'Gerenciar Salas'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {showForm 
              ? 'Preencha os dados da sala de atendimento.'
              : 'Cadastre e gerencie as salas de atendimento.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {!showForm ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                <Button onClick={() => setShowForm(true)} className="gap-2 shrink-0">
                  <Plus className="h-4 w-4" />
                  Nova Sala
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {filteredRooms.length} sala(s) encontrada(s)
              </p>

              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {filteredRooms.map(room => (
                  <div
                    key={room.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{room.name}</span>
                        {!room.is_active && (
                          <Badge variant="secondary" className="text-[10px]">Inativa</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Capacidade: {room.capacity} pessoa(s)
                      </p>
                      {room.equipment && room.equipment.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {room.equipment.slice(0, 3).map((eq: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {eq}
                            </Badge>
                          ))}
                          {room.equipment.length > 3 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{room.equipment.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(room)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDelete(room.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
                {filteredRooms.length === 0 && (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    {searchQuery ? 'Nenhuma sala encontrada' : 'Nenhuma sala cadastrada'}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Nome *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Sala 1" className="h-9 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Descrição</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Descrição da sala..."
                          className="resize-none text-sm min-h-[70px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Capacidade</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} className="h-9 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="equipment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Equipamentos</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ex: Maca, Cadeira, Espelho (separados por vírgula)" 
                          className="h-9 text-sm"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                      <div className="space-y-0.5">
                        <FormLabel className="text-xs font-medium">Sala Ativa</FormLabel>
                        <p className="text-[10px] text-muted-foreground">
                          Disponível para agendamentos
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      form.reset();
                    }}
                    className="gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </Button>
                  <Button type="submit" size="sm" disabled={isLoading}>
                    {isLoading ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

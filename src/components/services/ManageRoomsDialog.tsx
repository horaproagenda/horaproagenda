import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DoorOpen, Plus, Trash2, Edit2 } from 'lucide-react';
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
  const { rooms, refetch } = useRooms();

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
    try {
      const { error } = await supabase.from('rooms').delete().eq('id', id);
      if (error) throw error;
      toast.success('Sala removida!');
      refetch();
    } catch (error: any) {
      toast.error('Erro ao remover: ' + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <DoorOpen className="h-4 w-4" />
            Salas
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gerenciar Salas</DialogTitle>
          <DialogDescription>
            Cadastre e gerencie as salas de atendimento.
          </DialogDescription>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-4">
            <Button onClick={() => setShowForm(true)} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Nova Sala
            </Button>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {rooms.map(room => (
                <div
                  key={room.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{room.name}</span>
                      {!room.is_active && (
                        <Badge variant="secondary">Inativa</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Capacidade: {room.capacity} pessoa(s)
                    </p>
                    {room.equipment && room.equipment.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {room.equipment.map((eq: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {eq}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(room)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(room.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {rooms.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  Nenhuma sala cadastrada
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
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Sala 1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Descrição da sala..."
                        className="resize-none"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacidade</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="equipment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equipamentos (separados por vírgula)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Maca, Cadeira, Espelho" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel>Sala Ativa</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    form.reset();
                  }}
                >
                  Voltar
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
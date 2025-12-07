import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Package, Plus, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useServices } from '@/hooks/useServices';

const packageSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  description: z.string().trim().max(500, 'Descrição muito longa').optional(),
  price: z.coerce.number().min(0, 'Preço deve ser positivo').max(100000, 'Preço muito alto'),
});

type PackageFormData = z.infer<typeof packageSchema>;

interface SelectedService {
  service_id: string;
  service_name: string;
  quantity: number;
}

interface NewPackageDialogProps {
  onPackageCreated?: () => void;
  children?: React.ReactNode;
}

export function NewPackageDialog({ onPackageCreated, children }: NewPackageDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const { services } = useServices();

  const form = useForm<PackageFormData>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      name: '',
      description: '',
      price: 0,
    },
  });

  const addService = (serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    if (!service) return;
    
    const existing = selectedServices.find(s => s.service_id === serviceId);
    if (existing) {
      setSelectedServices(prev =>
        prev.map(s =>
          s.service_id === serviceId
            ? { ...s, quantity: s.quantity + 1 }
            : s
        )
      );
    } else {
      setSelectedServices(prev => [
        ...prev,
        { service_id: serviceId, service_name: service.name, quantity: 1 },
      ]);
    }
  };

  const updateQuantity = (serviceId: string, quantity: number) => {
    if (quantity < 1) {
      removeService(serviceId);
      return;
    }
    setSelectedServices(prev =>
      prev.map(s =>
        s.service_id === serviceId ? { ...s, quantity } : s
      )
    );
  };

  const removeService = (serviceId: string) => {
    setSelectedServices(prev => prev.filter(s => s.service_id !== serviceId));
  };

  const onSubmit = async (data: PackageFormData) => {
    if (selectedServices.length === 0) {
      toast.error('Adicione pelo menos um serviço ao pacote');
      return;
    }

    setIsLoading(true);
    try {
      const { data: pkg, error: pkgError } = await supabase
        .from('service_packages')
        .insert({
          name: data.name,
          description: data.description || null,
          price: data.price,
        })
        .select()
        .single();

      if (pkgError) throw pkgError;

      const items = selectedServices.map(s => ({
        package_id: pkg.id,
        service_id: s.service_id,
        quantity: s.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('package_items')
        .insert(items);

      if (itemsError) throw itemsError;

      toast.success('Pacote cadastrado com sucesso!');
      form.reset();
      setSelectedServices([]);
      setOpen(false);
      onPackageCreated?.();
    } catch (error: any) {
      toast.error('Erro ao cadastrar pacote: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" className="gap-2">
            <Package className="h-4 w-4" />
            Novo Pacote
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Novo Pacote</DialogTitle>
          <DialogDescription>
            Crie um pacote combinando vários serviços.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Pacote *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Pacote Noiva Completo" {...field} />
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
                      placeholder="Descreva o pacote..."
                      className="resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="space-y-2">
              <FormLabel>Serviços do Pacote</FormLabel>
              <Select onValueChange={addService}>
                <SelectTrigger>
                  <SelectValue placeholder="Adicionar serviço..." />
                </SelectTrigger>
                <SelectContent>
                  {services.filter(s => s.is_active).map(service => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name} - R$ {Number(service.price).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedServices.length > 0 && (
                <div className="space-y-2 mt-3">
                  {selectedServices.map(item => (
                    <div
                      key={item.service_id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted"
                    >
                      <span className="text-sm">{item.service_name}</span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={e => updateQuantity(item.service_id, parseInt(e.target.value) || 1)}
                          className="w-16 h-8 text-center"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeService(item.service_id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço do Pacote (R$) *</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Salvando...' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
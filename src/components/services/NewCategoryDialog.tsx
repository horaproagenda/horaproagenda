import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FolderPlus } from 'lucide-react';
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
import { toast } from 'sonner';

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(50, 'Nome muito longo'),
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface NewCategoryDialogProps {
  existingCategories: string[];
  onCategoryCreated: (category: string) => void;
  children?: React.ReactNode;
}

export function NewCategoryDialog({ existingCategories, onCategoryCreated, children }: NewCategoryDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = (data: CategoryFormData) => {
    const normalizedName = data.name.trim();
    
    // Check if category already exists (case insensitive)
    if (existingCategories.some(cat => cat.toLowerCase() === normalizedName.toLowerCase())) {
      toast.error('Esta categoria já existe!');
      return;
    }

    onCategoryCreated(normalizedName);
    toast.success('Categoria criada com sucesso!');
    form.reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <FolderPlus className="h-4 w-4" />
            Nova Categoria
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Nova Categoria</DialogTitle>
          <DialogDescription>
            Crie uma nova categoria para organizar seus serviços.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Categoria *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Tratamentos Faciais" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                Criar Categoria
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

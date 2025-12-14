import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link2, Plus, Trash2, Package } from 'lucide-react';
import { useServiceProducts } from '@/hooks/useServiceProducts';
import { useProducts } from '@/hooks/useProducts';
import { useServices } from '@/hooks/useServices';
import { useAuth } from '@/contexts/AuthContext';

export function ServiceProductsDialog() {
  const { serviceProducts, createServiceProduct, deleteServiceProduct } = useServiceProducts();
  const { products, activeProducts } = useProducts();
  const { services } = useServices();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('receptionist');
  const canDelete = hasRole('admin');

  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);

  const handleAdd = async () => {
    if (!selectedService || !selectedProduct) return;

    await createServiceProduct.mutateAsync({
      service_id: selectedService,
      product_id: selectedProduct,
      quantity_per_use: quantity,
      notes: null,
    });

    setSelectedProduct('');
    setQuantity(1);
  };

  const handleDelete = async (id: string) => {
    await deleteServiceProduct.mutateAsync(id);
  };

  // Get products that are already linked to the selected service
  const linkedProductIds = serviceProducts
    .filter(sp => sp.service_id === selectedService)
    .map(sp => sp.product_id);

  const availableProducts = activeProducts.filter(p => !linkedProductIds.includes(p.id));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Link2 className="h-4 w-4" />
          Vincular a Serviços
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Vincular Produtos a Serviços</DialogTitle>
          <DialogDescription>
            Defina quais produtos são usados em cada serviço e a quantidade consumida por atendimento.
            O estoque será descontado automaticamente quando o agendamento for concluído.
          </DialogDescription>
        </DialogHeader>

        {canEdit && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="col-span-2">
              <Label>Serviço</Label>
              <Select value={selectedService} onValueChange={setSelectedService}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um serviço" />
                </SelectTrigger>
                <SelectContent>
                  {services.filter(s => s.is_active).map(service => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Produto</Label>
              <Select 
                value={selectedProduct} 
                onValueChange={setSelectedProduct}
                disabled={!selectedService}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {availableProducts.map(product => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label>Qtd/Uso</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
                  min="0.01"
                  step="0.01"
                />
              </div>
              <Button 
                onClick={handleAdd}
                disabled={!selectedService || !selectedProduct || createServiceProduct.isPending}
                size="icon"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Qtd/Uso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serviceProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p>Nenhum produto vinculado a serviços</p>
                  </TableCell>
                </TableRow>
              ) : (
                serviceProducts.map(sp => (
                  <TableRow key={sp.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {sp.service?.name || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{sp.product?.name || '-'}</p>
                    </TableCell>
                    <TableCell>
                      {sp.quantity_per_use} {sp.product?.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover Vínculo</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja remover o vínculo entre "{sp.product?.name}" e "{sp.service?.name}"?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(sp.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

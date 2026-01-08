import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Link2, Plus, Trash2, Package, AlertTriangle, ShoppingCart, Edit } from 'lucide-react';
import { useServiceProducts } from '@/hooks/useServiceProducts';
import { useProducts } from '@/hooks/useProducts';
import { useServices } from '@/hooks/useServices';
import { useAppointments } from '@/hooks/useAppointments';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function ServiceProductsDialog() {
  const { serviceProducts, createServiceProduct, updateServiceProduct, deleteServiceProduct } = useServiceProducts();
  const { products, activeProducts, updateProduct } = useProducts();
  const { services } = useServices();
  const { appointments } = useAppointments();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('receptionist');
  const canDelete = hasRole('admin');

  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(1);

  // Calculate how many appointments were completed with each product
  const productUsageStats = useMemo(() => {
    const stats: Record<string, { appointments: number; totalUsed: number }> = {};
    
    serviceProducts.forEach(sp => {
      // Count completed appointments for this service
      const completedAppointments = appointments.filter(
        apt => apt.service_id === sp.service_id && apt.status === 'completed'
      );
      
      const product = products.find(p => p.id === sp.product_id);
      const key = `${sp.service_id}-${sp.product_id}`;
      
      stats[key] = {
        appointments: completedAppointments.length,
        totalUsed: completedAppointments.length * sp.quantity_per_use,
      };
    });
    
    return stats;
  }, [serviceProducts, appointments, products]);

  // Products that need restocking (quota option)
  const productsNeedingQuote = useMemo(() => {
    return products.filter(p => 
      p.is_active && 
      p.current_stock <= (p.min_stock_alert || 0)
    );
  }, [products]);

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

  const handleUpdateQuantity = async (id: string) => {
    await updateServiceProduct.mutateAsync({
      id,
      quantity_per_use: editQuantity,
    });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteServiceProduct.mutateAsync(id);
  };

  const handleMarkProductFinished = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    // Calculate total appointments done with this product
    const relatedServiceProducts = serviceProducts.filter(sp => sp.product_id === productId);
    let totalAppointments = 0;
    
    relatedServiceProducts.forEach(sp => {
      const completedAppointments = appointments.filter(
        apt => apt.service_id === sp.service_id && apt.status === 'completed'
      );
      totalAppointments += completedAppointments.length;
    });

    await updateProduct.mutateAsync({
      id: productId,
      finished_at: new Date().toISOString(),
      current_stock: 0,
      notes: `${product.notes || ''}\n[${new Date().toLocaleDateString('pt-BR')}] Produto finalizado. Total de atendimentos realizados: ${totalAppointments}`.trim(),
    });

    toast.success(`Produto marcado como finalizado. ${totalAppointments} atendimentos registrados.`);
  };

  // Get products that are already linked to the selected service
  const linkedProductIds = serviceProducts
    .filter(sp => sp.service_id === selectedService)
    .map(sp => sp.product_id);

  const availableProducts = activeProducts.filter(p => !linkedProductIds.includes(p.id));

  // Calculate estimated appointments remaining for each linked product
  const getEstimatedAppointments = (productId: string, quantityPerUse: number) => {
    const product = products.find(p => p.id === productId);
    if (!product || quantityPerUse <= 0) return 0;
    return Math.floor(product.current_stock / quantityPerUse);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Link2 className="h-4 w-4" />
          Vincular a Serviços
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Vincular Produtos a Serviços</DialogTitle>
          <DialogDescription>
            Defina quais produtos são usados em cada serviço e a quantidade consumida por atendimento.
            O estoque será descontado automaticamente quando o agendamento for concluído.
          </DialogDescription>
        </DialogHeader>

        {/* Products needing restocking alert */}
        {productsNeedingQuote.length > 0 && (
          <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              <p className="font-medium mb-1">Produtos com estoque baixo - Solicitar cotação:</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {productsNeedingQuote.map(p => (
                  <Badge key={p.id} variant="outline" className="border-amber-500 text-amber-700 gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    {p.name} (Estoque: {p.current_stock} {p.unit})
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {canEdit && (
          <div className="grid grid-cols-5 gap-3 mb-4">
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

            <div className="col-span-2">
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
                      {product.name} ({product.current_stock} {product.unit})
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
                <TableHead>Estoque Atual</TableHead>
                <TableHead>Atend. Estimados</TableHead>
                <TableHead>Atend. Realizados</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serviceProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p>Nenhum produto vinculado a serviços</p>
                  </TableCell>
                </TableRow>
              ) : (
                serviceProducts.map(sp => {
                  const product = products.find(p => p.id === sp.product_id);
                  const statsKey = `${sp.service_id}-${sp.product_id}`;
                  const stats = productUsageStats[statsKey] || { appointments: 0, totalUsed: 0 };
                  const estimatedAppointments = getEstimatedAppointments(sp.product_id, sp.quantity_per_use);
                  const isLowStock = product && product.current_stock <= (product.min_stock_alert || 0);
                  
                  return (
                    <TableRow key={sp.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {sp.service?.name || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{sp.product?.name || '-'}</p>
                          {isLowStock && (
                            <Badge variant="destructive" className="text-xs mt-1">
                              Estoque Baixo
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {editingId === sp.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={editQuantity}
                              onChange={(e) => setEditQuantity(parseFloat(e.target.value) || 1)}
                              min="0.01"
                              step="0.01"
                              className="w-20 h-8"
                            />
                            <Button size="sm" onClick={() => handleUpdateQuantity(sp.id)}>OK</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            {sp.quantity_per_use} {sp.product?.unit}
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => {
                                  setEditingId(sp.id);
                                  setEditQuantity(sp.quantity_per_use);
                                }}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={isLowStock ? 'text-destructive font-medium' : ''}>
                          {product?.current_stock || 0} {product?.unit}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={estimatedAppointments < 5 ? 'destructive' : 'secondary'}>
                          {estimatedAppointments} atend.
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          {stats.appointments} atend.
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canEdit && product && product.current_stock <= 0 && !product.finished_at && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="text-amber-600 border-amber-500">
                                  Acabou
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Marcar Produto como Finalizado</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Isso irá registrar que o produto "{product.name}" acabou e contabilizar 
                                    quantos atendimentos foram realizados com ele.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleMarkProductFinished(product.id)}>
                                    Confirmar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
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
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
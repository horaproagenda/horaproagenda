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
import { Link2, Plus, Trash2, Package, AlertTriangle, ShoppingCart, Edit, Droplets, Box } from 'lucide-react';
import { useServiceProducts } from '@/hooks/useServiceProducts';
import { useProducts, type ProductType } from '@/hooks/useProducts';
import { useServices } from '@/hooks/useServices';
import { useAppointments } from '@/hooks/useAppointments';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Helper to check if product uses estimated tracking (liquid/gel/cream)
const isEstimatedTracking = (type: ProductType) => 
  ['liquid', 'gel', 'cream'].includes(type);

const PRODUCT_UNITS: Record<string, string> = {
  'un': 'Unidade(s)',
  'ml': 'mL',
  'l': 'L',
  'g': 'g',
  'kg': 'kg',
};

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
  
  // For exact tracking (solids)
  const [quantityPerUse, setQuantityPerUse] = useState<number>(1);
  
  // For estimated tracking (liquids/gel/cream)
  const [estimatedAppointments, setEstimatedAppointments] = useState<number>(30);
  const [containerAmount, setContainerAmount] = useState<number>(1);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editEstimatedAppointments, setEditEstimatedAppointments] = useState<number>(30);

  // Get selected product info
  const selectedProductData = useMemo(() => {
    return products.find(p => p.id === selectedProduct);
  }, [products, selectedProduct]);

  // Calculate how many appointments were completed with each product
  const productUsageStats = useMemo(() => {
    const stats: Record<string, { appointments: number; totalUsed: number }> = {};
    
    serviceProducts.forEach(sp => {
      const completedAppointments = appointments.filter(
        apt => apt.service_id === sp.service_id && apt.status === 'completed'
      );
      
      const key = `${sp.service_id}-${sp.product_id}`;
      
      stats[key] = {
        appointments: completedAppointments.length,
        totalUsed: completedAppointments.length * sp.quantity_per_use,
      };
    });
    
    return stats;
  }, [serviceProducts, appointments]);

  // Products that need restocking
  const productsNeedingQuote = useMemo(() => {
    return products.filter(p => 
      p.is_active && 
      p.current_stock <= (p.min_stock_alert || 0)
    );
  }, [products]);

  const handleAdd = async () => {
    if (!selectedService || !selectedProduct || !selectedProductData) return;

    const useEstimated = isEstimatedTracking(selectedProductData.product_type);

    if (useEstimated) {
      const calculatedQuantityPerUse = containerAmount / estimatedAppointments;
      await createServiceProduct.mutateAsync({
        service_id: selectedService,
        product_id: selectedProduct,
        quantity_per_use: calculatedQuantityPerUse,
        estimated_appointments: estimatedAppointments,
        container_amount: containerAmount,
        container_unit: selectedProductData.unit,
        tracking_method: 'estimated',
        notes: null,
      });
    } else {
      await createServiceProduct.mutateAsync({
        service_id: selectedService,
        product_id: selectedProduct,
        quantity_per_use: quantityPerUse,
        tracking_method: 'exact',
        notes: null,
      });
    }

    setSelectedProduct('');
    setQuantityPerUse(1);
    setEstimatedAppointments(30);
    setContainerAmount(1);
  };

  const handleUpdateQuantity = async (id: string, sp: any) => {
    const isEstimated = sp.tracking_method === 'estimated';
    
    if (isEstimated) {
      const calculatedQuantityPerUse = (sp.container_amount || 1) / editEstimatedAppointments;
      await updateServiceProduct.mutateAsync({
        id,
        quantity_per_use: calculatedQuantityPerUse,
        estimated_appointments: editEstimatedAppointments,
      });
    } else {
      await updateServiceProduct.mutateAsync({
        id,
        quantity_per_use: editQuantity,
      });
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteServiceProduct.mutateAsync(id);
  };

  const handleMarkProductFinished = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

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
  const getEstimatedAppointments = (sp: any, product: any) => {
    if (!product || !sp) return 0;
    
    const isEstimated = sp.tracking_method === 'estimated';
    
    if (isEstimated && sp.estimated_appointments && sp.container_amount) {
      const containersRemaining = product.current_stock / sp.container_amount;
      return Math.floor(containersRemaining * sp.estimated_appointments);
    }
    
    if (sp.quantity_per_use > 0) {
      return Math.floor(product.current_stock / sp.quantity_per_use);
    }
    
    return 0;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Link2 className="h-4 w-4" />
          Vincular a Serviços
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Vincular Produtos a Serviços</DialogTitle>
          <DialogDescription>
            Defina quais produtos são usados em cada serviço. Para líquidos, gel e cremes, 
            informe quantos atendimentos o recipiente em uso dura em média.
          </DialogDescription>
        </DialogHeader>

        {/* Products needing restocking alert */}
        {productsNeedingQuote.length > 0 && (
          <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              <p className="font-medium mb-1">Produtos com estoque baixo:</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {productsNeedingQuote.map(p => (
                  <Badge key={p.id} variant="outline" className="border-amber-500 text-amber-700 gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    {p.name} ({p.current_stock} {PRODUCT_UNITS[p.unit] || p.unit})
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {canEdit && (
          <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Serviço</Label>
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
                <Label className="text-xs text-muted-foreground">Produto</Label>
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
                        <div className="flex items-center gap-2">
                          {isEstimatedTracking(product.product_type) ? (
                            <Droplets className="h-3 w-3 text-blue-500" />
                          ) : (
                            <Box className="h-3 w-3 text-amber-500" />
                          )}
                          {product.name} ({product.current_stock} {PRODUCT_UNITS[product.unit] || product.unit})
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedProductData && (
              <div className="pt-2 border-t">
                {isEstimatedTracking(selectedProductData.product_type) ? (
                  // Estimated tracking form for liquids/gel/cream
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Droplets className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">Produto {selectedProductData.product_type === 'liquid' ? 'Líquido' : selectedProductData.product_type === 'gel' ? 'Gel' : 'Creme'}</span>
                      <Badge variant="secondary" className="text-xs">Modo Estimado</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Quantidade no recipiente em uso</Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={containerAmount}
                            onChange={(e) => setContainerAmount(parseFloat(e.target.value) || 1)}
                            min="0.01"
                            step="0.01"
                            className="flex-1"
                          />
                          <span className="flex items-center text-sm text-muted-foreground px-3 border rounded-md bg-muted">
                            {PRODUCT_UNITS[selectedProductData.unit] || selectedProductData.unit}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Ex: 1L de um galão de 5L
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Quantos atendimentos dura?</Label>
                        <Input
                          type="number"
                          value={estimatedAppointments}
                          onChange={(e) => setEstimatedAppointments(parseInt(e.target.value) || 1)}
                          min="1"
                          placeholder="Ex: 30 atendimentos"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Média estimada de atendimentos
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Exact tracking form for solids
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Box className="h-4 w-4 text-amber-500" />
                      <span className="font-medium">Produto Sólido/Unitário</span>
                      <Badge variant="outline" className="text-xs">Modo Exato</Badge>
                    </div>
                    <div className="w-64">
                      <Label className="text-xs text-muted-foreground">Quantidade usada por atendimento</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={quantityPerUse}
                          onChange={(e) => setQuantityPerUse(parseFloat(e.target.value) || 1)}
                          min="0.01"
                          step="0.01"
                        />
                        <span className="flex items-center text-sm text-muted-foreground px-3 border rounded-md bg-muted">
                          {PRODUCT_UNITS[selectedProductData.unit] || selectedProductData.unit}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <Button 
              onClick={handleAdd}
              disabled={!selectedService || !selectedProduct || createServiceProduct.isPending}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-1" />
              Vincular Produto ao Serviço
            </Button>
          </div>
        )}

        <ScrollArea className="h-[350px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Consumo</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Atend. Restantes</TableHead>
                <TableHead>Atend. Realizados</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serviceProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p>Nenhum produto vinculado a serviços</p>
                  </TableCell>
                </TableRow>
              ) : (
                serviceProducts.map(sp => {
                  const product = products.find(p => p.id === sp.product_id);
                  const statsKey = `${sp.service_id}-${sp.product_id}`;
                  const stats = productUsageStats[statsKey] || { appointments: 0, totalUsed: 0 };
                  const estimatedAppts = getEstimatedAppointments(sp, product);
                  const isLowStock = product && product.current_stock <= (product.min_stock_alert || 0);
                  const isEstimated = sp.tracking_method === 'estimated';
                  
                  return (
                    <TableRow key={sp.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {sp.service?.name || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {product && isEstimatedTracking(product.product_type) ? (
                            <Droplets className="h-3 w-3 text-blue-500" />
                          ) : (
                            <Box className="h-3 w-3 text-amber-500" />
                          )}
                          <div>
                            <p className="font-medium text-sm">{sp.product?.name || '-'}</p>
                            {isLowStock && (
                              <Badge variant="destructive" className="text-[10px] mt-0.5">
                                Estoque Baixo
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isEstimated ? 'secondary' : 'outline'} className="text-[10px]">
                          {isEstimated ? 'Estimado' : 'Exato'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {editingId === sp.id ? (
                          <div className="flex items-center gap-1">
                            {isEstimated ? (
                              <>
                                <Input
                                  type="number"
                                  value={editEstimatedAppointments}
                                  onChange={(e) => setEditEstimatedAppointments(parseInt(e.target.value) || 1)}
                                  min="1"
                                  className="w-16 h-7 text-xs"
                                  placeholder="atend."
                                />
                                <span className="text-xs text-muted-foreground">atend.</span>
                              </>
                            ) : (
                              <Input
                                type="number"
                                value={editQuantity}
                                onChange={(e) => setEditQuantity(parseFloat(e.target.value) || 1)}
                                min="0.01"
                                step="0.01"
                                className="w-16 h-7 text-xs"
                              />
                            )}
                            <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleUpdateQuantity(sp.id, sp)}>OK</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            {isEstimated ? (
                              <span className="text-sm">
                                {sp.container_amount} {sp.container_unit} → {sp.estimated_appointments} atend.
                              </span>
                            ) : (
                              <span className="text-sm">{sp.quantity_per_use} {product?.unit}/uso</span>
                            )}
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => {
                                  setEditingId(sp.id);
                                  setEditQuantity(sp.quantity_per_use);
                                  setEditEstimatedAppointments(sp.estimated_appointments || 30);
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
                          {product?.current_stock || 0} {PRODUCT_UNITS[product?.unit || ''] || product?.unit}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={estimatedAppts < 5 ? 'destructive' : 'secondary'}>
                          {estimatedAppts} atend.
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-sm">
                          {stats.appointments} atend.
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canEdit && product && product.current_stock <= 0 && !product.finished_at && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="text-amber-600 border-amber-500 h-7 text-xs">
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
                                <Button variant="ghost" size="icon" className="text-destructive h-7 w-7">
                                  <Trash2 className="h-3.5 w-3.5" />
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
import { useState, useMemo } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Package,
  Truck,
  Calendar,
  Clock,
  ShoppingCart,
  Edit,
  Save,
  X,
  Link2,
  Store,
  Building2,
  Gift,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Product, type ProductPurchase, type ProductType, type ProductUnit } from '@/hooks/useProducts';
import { useSuppliers, type Supplier } from '@/hooks/useSuppliers';
import { useServices } from '@/hooks/useServices';
import { useServicePackages } from '@/hooks/useServicePackages';
import { useServiceProducts } from '@/hooks/useServiceProducts';
import { usePackageProducts } from '@/hooks/usePackageProducts';
import { useAppointments } from '@/hooks/useAppointments';
import { useAuth } from '@/contexts/AuthContext';

interface ProductDetailDialogProps {
  product: Product | null;
  purchases: ProductPurchase[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateProduct: (data: Partial<Product> & { id: string }) => Promise<void>;
  onCreateServiceLink: (data: { 
    service_id: string; 
    product_id: string; 
    quantity_per_use?: number; 
    estimated_appointments?: number | null;
    container_amount?: number | null;
    container_unit?: string | null;
    tracking_method?: 'exact' | 'estimated';
    notes?: string | null;
  }) => Promise<void>;
  onUpdateServiceLink: (data: { id: string; quantity_per_use?: number; estimated_appointments?: number | null }) => Promise<void>;
  onDeleteServiceLink: (id: string) => Promise<void>;
}

const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'solid', label: 'Sólido' },
  { value: 'liquid', label: 'Líquido' },
  { value: 'cream', label: 'Creme' },
  { value: 'gel', label: 'Gel' },
  { value: 'powder', label: 'Pó' },
  { value: 'other', label: 'Outro' },
];

// Helper to check if product uses estimated tracking (liquid/gel/cream)
const isEstimatedTracking = (type: ProductType) => 
  ['liquid', 'gel', 'cream'].includes(type);

const PRODUCT_UNITS: { value: ProductUnit; label: string }[] = [
  { value: 'un', label: 'Unidade(s)' },
  { value: 'ml', label: 'mL' },
  { value: 'l', label: 'L' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
];

export function ProductDetailDialog({
  product,
  purchases,
  open,
  onOpenChange,
  onUpdateProduct,
  onCreateServiceLink,
  onUpdateServiceLink,
  onDeleteServiceLink,
}: ProductDetailDialogProps) {
  const { suppliers, activeSuppliers } = useSuppliers();
  const { services, activeServices } = useServices();
  const { activePackages } = useServicePackages();
  const { serviceProducts } = useServiceProducts();
  const { packageProducts, createPackageProduct, deletePackageProduct } = usePackageProducts();
  const { appointments } = useAppointments();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('receptionist');

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [quantityPerUse, setQuantityPerUse] = useState(1);
  const [estimatedAppointments, setEstimatedAppointments] = useState(30);
  const [containerAmount, setContainerAmount] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [linkTab, setLinkTab] = useState<'service' | 'package'>('service');

  // Filter purchases for this product
  const productPurchases = useMemo(() => {
    if (!product) return [];
    return purchases.filter(p => p.product_id === product.id)
      .sort((a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime());
  }, [product, purchases]);

  // Get service links for this product
  const productServiceLinks = useMemo(() => {
    if (!product) return [];
    return serviceProducts.filter(sp => sp.product_id === product.id);
  }, [product, serviceProducts]);

  // Get package links for this product
  const productPackageLinks = useMemo(() => {
    if (!product) return [];
    return packageProducts.filter(pp => pp.product_id === product.id);
  }, [product, packageProducts]);

  // Calculate usage statistics
  const usageStats = useMemo(() => {
    if (!product) return { totalAppointments: 0, avgPerAppointment: 0 };
    
    let totalAppointments = 0;
    
    productServiceLinks.forEach(sp => {
      const completedAppointments = appointments.filter(
        apt => apt.service_id === sp.service_id && apt.status === 'completed'
      );
      totalAppointments += completedAppointments.length;
    });

    // Calculate average usage per day if we have dates
    const startedUsing = product.started_using_at ? parseISO(product.started_using_at) : null;
    const finishedUsing = product.finished_at ? parseISO(product.finished_at) : new Date();
    
    let avgPerAppointment = 0;
    if (startedUsing && totalAppointments > 0) {
      const totalQuantityUsed = product.quantity_purchased - product.current_stock;
      avgPerAppointment = totalQuantityUsed / totalAppointments;
    }

    return { totalAppointments, avgPerAppointment };
  }, [product, productServiceLinks, appointments]);

  // Available services to link (not already linked)
  const availableServicesToLink = useMemo(() => {
    const linkedServiceIds = productServiceLinks.map(sp => sp.service_id);
    return activeServices.filter(s => !linkedServiceIds.includes(s.id));
  }, [activeServices, productServiceLinks]);

  // Available packages to link (not already linked)
  const availablePackagesToLink = useMemo(() => {
    const linkedPackageIds = productPackageLinks.map(pp => pp.package_id);
    return activePackages.filter(p => !linkedPackageIds.includes(p.id));
  }, [activePackages, productPackageLinks]);

  const handleStartEdit = () => {
    if (!product) return;
    setEditForm({
      name: product.name,
      description: product.description,
      brand: product.brand,
      category: product.category,
      product_type: product.product_type,
      unit: product.unit,
      supplier: product.supplier,
      min_stock_alert: product.min_stock_alert,
      notes: product.notes,
      is_active: product.is_active,
      is_for_sale: product.is_for_sale,
      sale_price: product.sale_price,
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!product) return;
    setIsSaving(true);
    try {
      await onUpdateProduct({ id: product.id, ...editForm });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddServiceLink = async () => {
    if (!product || !selectedServiceId) return;
    
    const useEstimated = isEstimatedTracking(product.product_type);
    
    if (useEstimated) {
      // For liquids/gel/cream: calculate quantity_per_use from estimated appointments
      const calculatedQuantityPerUse = containerAmount / estimatedAppointments;
      await onCreateServiceLink({
        service_id: selectedServiceId,
        product_id: product.id,
        quantity_per_use: calculatedQuantityPerUse,
        estimated_appointments: estimatedAppointments,
        container_amount: containerAmount,
        container_unit: product.unit,
        tracking_method: 'estimated',
        notes: null,
      });
    } else {
      // For solids: use exact quantity
      await onCreateServiceLink({
        service_id: selectedServiceId,
        product_id: product.id,
        quantity_per_use: quantityPerUse,
        tracking_method: 'exact',
        notes: null,
      });
    }
    
    setSelectedServiceId('');
    setQuantityPerUse(1);
    setEstimatedAppointments(30);
    setContainerAmount(1);
  };

  const handleAddPackageLink = async () => {
    if (!product || !selectedPackageId) return;
    
    const useEstimated = isEstimatedTracking(product.product_type);
    
    if (useEstimated) {
      const calculatedQuantityPerUse = containerAmount / estimatedAppointments;
      await createPackageProduct.mutateAsync({
        package_id: selectedPackageId,
        product_id: product.id,
        quantity_per_use: calculatedQuantityPerUse,
        estimated_appointments: estimatedAppointments,
        container_amount: containerAmount,
        container_unit: product.unit,
        tracking_method: 'estimated',
        notes: null,
      });
    } else {
      await createPackageProduct.mutateAsync({
        package_id: selectedPackageId,
        product_id: product.id,
        quantity_per_use: quantityPerUse,
        tracking_method: 'exact',
        notes: null,
      });
    }
    
    setSelectedPackageId('');
    setQuantityPerUse(1);
    setEstimatedAppointments(30);
    setContainerAmount(1);
  };

  const supplierInfo = useMemo(() => {
    if (!product) return null;
    const supplierId = (product as any).supplier_id;
    if (supplierId) {
      return suppliers.find(s => s.id === supplierId);
    }
    return null;
  }, [product, suppliers]);

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">{product.name}</DialogTitle>
              <DialogDescription>
                {product.brand && <span className="mr-2">{product.brand}</span>}
                {product.category && <Badge variant="outline">{product.category}</Badge>}
              </DialogDescription>
            </div>
            {canEdit && !isEditing && (
              <Button variant="outline" size="sm" onClick={handleStartEdit}>
                <Edit className="h-4 w-4 mr-1" />
                Editar
              </Button>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="info">Informações</TabsTrigger>
              <TabsTrigger value="purchases">Compras ({productPurchases.length})</TabsTrigger>
              <TabsTrigger value="services">Serviços ({productServiceLinks.length})</TabsTrigger>
              <TabsTrigger value="packages">Pacotes ({productPackageLinks.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4 mt-4">
              {isEditing ? (
                // Edit Mode
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Nome</Label>
                      <Input
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Marca</Label>
                      <Input
                        value={editForm.brand || ''}
                        onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Categoria</Label>
                      <Input
                        value={editForm.category || ''}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select
                        value={editForm.product_type}
                        onValueChange={(v: ProductType) => setEditForm({ ...editForm, product_type: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRODUCT_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Unidade</Label>
                      <Select
                        value={editForm.unit}
                        onValueChange={(v: ProductUnit) => setEditForm({ ...editForm, unit: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRODUCT_UNITS.map(u => (
                            <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Alerta Estoque Mínimo</Label>
                      <Input
                        type="number"
                        value={editForm.min_stock_alert || ''}
                        onChange={(e) => setEditForm({ ...editForm, min_stock_alert: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label>Fornecedor</Label>
                    <Select
                      value={editForm.supplier || "none"}
                      onValueChange={(v) => {
                        const supplier = activeSuppliers.find(s => s.name === v || s.id === v);
                        setEditForm({
                          ...editForm,
                          supplier: v === "none" ? null : (supplier?.name || v),
                        });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione um fornecedor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {activeSuppliers.map(s => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Descrição</Label>
                    <Textarea
                      value={editForm.description || ''}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label>Observações</Label>
                    <Textarea
                      value={editForm.notes || ''}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      rows={2}
                    />
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={editForm.is_active}
                        onCheckedChange={(v) => setEditForm({ ...editForm, is_active: v })}
                      />
                      <Label>Produto Ativo</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={editForm.is_for_sale}
                        onCheckedChange={(v) => setEditForm({ ...editForm, is_for_sale: v })}
                      />
                      <Label>Para Venda</Label>
                    </div>
                  </div>

                  {editForm.is_for_sale && (
                    <div className="w-48">
                      <Label>Preço de Venda (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={editForm.sale_price || ''}
                        onChange={(e) => setEditForm({ ...editForm, sale_price: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      <X className="h-4 w-4 mr-1" />
                      Cancelar
                    </Button>
                    <Button onClick={handleSaveEdit} disabled={isSaving}>
                      <Save className="h-4 w-4 mr-1" />
                      {isSaving ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="space-y-4">
                  {/* Stock Info Card */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="text-sm text-muted-foreground">Estoque Atual</div>
                      <div className={cn(
                        "text-2xl font-bold",
                        product.current_stock <= (product.min_stock_alert || 0) && "text-destructive"
                      )}>
                        {product.current_stock} {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}
                      </div>
                      {product.min_stock_alert && product.current_stock <= product.min_stock_alert && (
                        <Badge variant="destructive" className="mt-1">Estoque Baixo</Badge>
                      )}
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="text-sm text-muted-foreground">Atendimentos Realizados</div>
                      <div className="text-2xl font-bold">{usageStats.totalAppointments}</div>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="text-sm text-muted-foreground">Tipo</div>
                      <div className="text-lg font-medium flex items-center gap-2">
                        {product.is_for_sale ? (
                          <>
                            <Store className="h-4 w-4 text-green-600" />
                            Venda (R$ {product.sale_price?.toFixed(2)})
                          </>
                        ) : (
                          <>
                            <Building2 className="h-4 w-4 text-blue-600" />
                            Uso na Clínica
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Product Info */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <span className="text-sm text-muted-foreground">Tipo:</span>
                      <span className="ml-2">{PRODUCT_TYPES.find(t => t.value === product.product_type)?.label}</span>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Alerta Estoque:</span>
                      <span className="ml-2">{product.min_stock_alert || 0} {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}</span>
                    </div>
                    {product.expiry_date && (
                      <div>
                        <span className="text-sm text-muted-foreground">Validade:</span>
                        <span className="ml-2">{format(parseISO(product.expiry_date), 'dd/MM/yyyy')}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-sm text-muted-foreground">Status:</span>
                      <Badge variant={product.is_active ? 'default' : 'secondary'} className="ml-2">
                        {product.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                  </div>

                  {/* Supplier Info */}
                  {(supplierInfo || product.supplier) && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium flex items-center gap-2 mb-2">
                          <Truck className="h-4 w-4" />
                          Fornecedor
                        </h4>
                        <div className="pl-6 text-sm space-y-1">
                          <p className="font-medium">{supplierInfo?.name || product.supplier}</p>
                          {supplierInfo && (
                            <>
                              {supplierInfo.phone && <p>Tel: {supplierInfo.phone}</p>}
                              {supplierInfo.email && <p>Email: {supplierInfo.email}</p>}
                              {supplierInfo.cnpj && <p>CNPJ: {supplierInfo.cnpj}</p>}
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Description/Notes */}
                  {(product.description || product.notes) && (
                    <>
                      <Separator />
                      {product.description && (
                        <div>
                          <h4 className="font-medium mb-1">Descrição</h4>
                          <p className="text-sm text-muted-foreground">{product.description}</p>
                        </div>
                      )}
                      {product.notes && (
                        <div>
                          <h4 className="font-medium mb-1">Observações</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-line">{product.notes}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="purchases" className="mt-4">
              <div className="text-sm text-muted-foreground mb-3">
                Histórico de compras deste produto
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Uso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productPurchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Nenhuma compra registrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    productPurchases.map(purchase => {
                      const durationDays = purchase.started_using_at && purchase.finished_at
                        ? differenceInDays(parseISO(purchase.finished_at), parseISO(purchase.started_using_at))
                        : null;

                      return (
                        <TableRow key={purchase.id}>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(parseISO(purchase.purchase_date), 'dd/MM/yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>
                            {purchase.quantity} {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}
                          </TableCell>
                          <TableCell>
                            <div>
                              <span className="font-medium">R$ {purchase.total_price.toFixed(2)}</span>
                              <span className="text-xs text-muted-foreground block">
                                R$ {purchase.unit_price.toFixed(2)}/un
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {purchase.supplier || '-'}
                          </TableCell>
                          <TableCell>
                            {purchase.started_using_at ? (
                              <div className="text-xs">
                                <p>Início: {format(parseISO(purchase.started_using_at), 'dd/MM/yy')}</p>
                                {purchase.finished_at && (
                                  <>
                                    <p>Fim: {format(parseISO(purchase.finished_at), 'dd/MM/yy')}</p>
                                    {durationDays !== null && (
                                      <Badge variant="outline" className="mt-1">
                                        <Clock className="h-3 w-3 mr-1" />
                                        {durationDays} dias
                                      </Badge>
                                    )}
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="services" className="mt-4">
              {/* Add Service Link - Adapted form based on product type */}
              {canEdit && availableServicesToLink.length > 0 && (
                <div className="mb-4 p-4 rounded-lg border bg-muted/30 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Vincular a Serviço</span>
                    {isEstimatedTracking(product.product_type) && (
                      <Badge variant="outline" className="text-xs">
                        Modo Estimado
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um serviço para vincular" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableServicesToLink.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {isEstimatedTracking(product.product_type) ? (
                      // For liquids/gel/cream: Ask about container and estimated appointments
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Quantidade no recipiente em uso
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              value={containerAmount}
                              onChange={(e) => setContainerAmount(parseFloat(e.target.value) || 1)}
                              min="0.01"
                              step="0.01"
                              className="flex-1"
                            />
                            <span className="flex items-center text-sm text-muted-foreground px-2 border rounded-md bg-muted">
                              {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Ex: 1L de um galão de 5L
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Quantos atendimentos dura?
                          </Label>
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
                    ) : (
                      // For solids: Ask exact quantity per use
                      <div className="w-48">
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Quantidade usada por atendimento
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={quantityPerUse}
                            onChange={(e) => setQuantityPerUse(parseFloat(e.target.value) || 1)}
                            min="0.01"
                            step="0.01"
                          />
                          <span className="flex items-center text-sm text-muted-foreground px-2 border rounded-md bg-muted">
                            {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <Button onClick={handleAddServiceLink} disabled={!selectedServiceId} className="w-full">
                    <Link2 className="h-4 w-4 mr-1" />
                    Vincular Produto ao Serviço
                  </Button>
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Consumo</TableHead>
                    <TableHead>Atend. Restantes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productServiceLinks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        <Link2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Nenhum serviço vinculado
                      </TableCell>
                    </TableRow>
                  ) : (
                    productServiceLinks.map(sp => {
                      const service = services.find(s => s.id === sp.service_id);
                      const isEstimated = sp.tracking_method === 'estimated';
                      
                      // Calculate remaining appointments
                      let remainingAppointments = 0;
                      if (isEstimated && sp.estimated_appointments && sp.container_amount) {
                        // Based on estimated appointments per container
                        const containersRemaining = product.current_stock / sp.container_amount;
                        remainingAppointments = Math.floor(containersRemaining * sp.estimated_appointments);
                      } else if (sp.quantity_per_use > 0) {
                        remainingAppointments = Math.floor(product.current_stock / sp.quantity_per_use);
                      }

                      return (
                        <TableRow key={sp.id}>
                          <TableCell>
                            <Badge variant="outline">{service?.name || '-'}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isEstimated ? 'secondary' : 'outline'} className="text-xs">
                              {isEstimated ? 'Estimado' : 'Exato'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isEstimated ? (
                              <div className="text-sm">
                                <span className="font-medium">{sp.container_amount} {sp.container_unit}</span>
                                <span className="text-muted-foreground"> → {sp.estimated_appointments} atend.</span>
                              </div>
                            ) : (
                              <span>{sp.quantity_per_use} {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}/uso</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={remainingAppointments < 5 ? 'destructive' : 'secondary'}>
                              {remainingAppointments} atendimentos
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="packages" className="mt-4">
              {/* Add Package Link */}
              {canEdit && availablePackagesToLink.length > 0 && (
                <div className="mb-4 p-4 rounded-lg border bg-muted/30 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Vincular a Pacote</span>
                    {isEstimatedTracking(product.product_type) && (
                      <Badge variant="outline" className="text-xs">
                        Modo Estimado
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um pacote para vincular" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePackagesToLink.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} {p.client?.name ? `- ${p.client.name}` : ''} ({p.total_sessions} sessões)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {isEstimatedTracking(product.product_type) ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Quantidade no recipiente em uso
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              value={containerAmount}
                              onChange={(e) => setContainerAmount(parseFloat(e.target.value) || 1)}
                              min="0.01"
                              step="0.01"
                              className="flex-1"
                            />
                            <span className="flex items-center text-sm text-muted-foreground px-2 border rounded-md bg-muted">
                              {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}
                            </span>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Quantos atendimentos dura?
                          </Label>
                          <Input
                            type="number"
                            value={estimatedAppointments}
                            onChange={(e) => setEstimatedAppointments(parseInt(e.target.value) || 1)}
                            min="1"
                            placeholder="Ex: 30 atendimentos"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="w-48">
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Quantidade usada por sessão
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={quantityPerUse}
                            onChange={(e) => setQuantityPerUse(parseFloat(e.target.value) || 1)}
                            min="0.01"
                            step="0.01"
                          />
                          <span className="flex items-center text-sm text-muted-foreground px-2 border rounded-md bg-muted">
                            {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <Button onClick={handleAddPackageLink} disabled={!selectedPackageId} className="w-full">
                    <Gift className="h-4 w-4 mr-1" />
                    Vincular Produto ao Pacote
                  </Button>
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pacote</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Sessões</TableHead>
                    <TableHead>Consumo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productPackageLinks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        <Gift className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Nenhum pacote vinculado
                      </TableCell>
                    </TableRow>
                  ) : (
                    productPackageLinks.map(pp => {
                      const isEstimated = pp.tracking_method === 'estimated';
                      
                      return (
                        <TableRow key={pp.id}>
                          <TableCell>
                            <Badge variant="outline">{pp.package?.name || '-'}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {pp.package?.client_id ? 'Com cliente' : 'Modelo'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {pp.package?.total_sessions || 0} sessões
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isEstimated ? (
                              <div className="text-sm">
                                <span className="font-medium">{pp.container_amount} {pp.container_unit}</span>
                                <span className="text-muted-foreground"> → {pp.estimated_appointments} atend.</span>
                              </div>
                            ) : (
                              <span>{pp.quantity_per_use} {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}/sessão</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

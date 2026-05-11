import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { Link2, Plus, Trash2, Package, AlertTriangle, ShoppingCart, Edit, Droplets, Box, Layers, Calendar, Info } from 'lucide-react';
import { useServiceProducts } from '@/hooks/useServiceProducts';
import { usePackageTemplateProducts } from '@/hooks/usePackageTemplateProducts';
import { usePackageTemplates } from '@/hooks/usePackageTemplates';
import { useProducts, type ProductType } from '@/hooks/useProducts';
import { useServices } from '@/hooks/useServices';
import { useAppointments } from '@/hooks/useAppointments';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { convertQuantity } from '@/lib/productStock';
import { differenceInDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Helper to check if product uses estimated tracking (liquid/gel/cream)
const isEstimatedTracking = (type: ProductType) => 
  ['liquid', 'gel', 'cream'].includes(type);

const PRODUCT_UNITS: Record<string, string> = {
  'un': 'Unidade(s)',
  'ml': 'mL',
  'l': 'L',
  'g': 'g',
  'kg': 'kg',
  'other': 'Outros',
};

// Units available per product type for linking
const getAvailableUnits = (productType: ProductType, baseUnit: string) => {
  if (['liquid', 'gel', 'cream'].includes(productType)) {
    return ['ml', 'l'];
  }
  if (['powder'].includes(productType)) {
    return ['g', 'kg'];
  }
  return [baseUnit || 'un'];
};

export function ServiceProductsDialog() {
  const { serviceProducts, createServiceProduct, updateServiceProduct, deleteServiceProduct } = useServiceProducts();
  const { templateProducts, createTemplateProduct, updateTemplateProduct, deleteTemplateProduct } = usePackageTemplateProducts();
  const { templates: packageTemplates } = usePackageTemplates();
  const { products, activeProducts, updateProduct } = useProducts();
  const { services } = useServices();
  const { appointments } = useAppointments();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('receptionist');
  const canDelete = hasRole('admin');

  const [activeTab, setActiveTab] = useState<'services' | 'packages'>('services');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  
  // "Do you know the quantity?" toggle
  const [knowsQuantity, setKnowsQuantity] = useState<'yes' | 'no'>('yes');
  
  // For exact tracking (knows quantity = yes)
  const [quantityPerUse, setQuantityPerUse] = useState<number>(1);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  
  // For estimated tracking (knows quantity = no)
  const [estimatedAppointments, setEstimatedAppointments] = useState<number>(0);
  const [containerAmount, setContainerAmount] = useState<number>(0);
  const [containerUnit, setContainerUnit] = useState<string>('');
  const [usageStartDate, setUsageStartDate] = useState<string>('');
  const [usageEndDate, setUsageEndDate] = useState<string>('');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editEstimatedAppointments, setEditEstimatedAppointments] = useState<number>(30);

  // Get selected product info
  const selectedProductData = useMemo(() => {
    const p = products.find(p => p.id === selectedProduct);
    if (p && !selectedUnit) {
      // auto-set unit based on product type
    }
    return p;
  }, [products, selectedProduct]);

  // When product changes, auto-set unit
  useEffect(() => {
    if (selectedProductData) {
      const units = getAvailableUnits(selectedProductData.product_type, selectedProductData.unit);
      setSelectedUnit(units.includes(selectedProductData.unit) ? selectedProductData.unit : units[0]);
      setContainerUnit(units.includes(selectedProductData.unit) ? selectedProductData.unit : units[0]);
    }
  }, [selectedProductData?.id, selectedProductData?.product_type, selectedProductData?.unit]);

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

  // Calculate usage per appointment from date-based tracking
  const calculatedUsagePerAppointment = useMemo(() => {
    if (knowsQuantity === 'yes' || !selectedProductData || !containerAmount || !estimatedAppointments || estimatedAppointments <= 0) return null;
    const normalizedContainer = convertQuantity(containerAmount, containerUnit, selectedProductData.unit) ?? containerAmount;
    return normalizedContainer / estimatedAppointments;
  }, [knowsQuantity, selectedProductData, containerAmount, containerUnit, estimatedAppointments]);

  // Calculate total appointments possible with total stock
  const totalAppointmentsPossible = useMemo(() => {
    if (!selectedProductData || !containerAmount || containerAmount <= 0 || !estimatedAppointments || estimatedAppointments <= 0) return null;
    const totalStock = selectedProductData.current_stock;
    // Convert container unit to stock unit if different
    const normalizedContainer = convertQuantity(containerAmount, containerUnit, selectedProductData.unit) ?? containerAmount;
    if (normalizedContainer <= 0) return null;
    const containersFromStock = totalStock / normalizedContainer;
    return Math.floor(containersFromStock * estimatedAppointments);
  }, [selectedProductData, containerAmount, containerUnit, estimatedAppointments]);

  // Calculate days of usage from dates
  const usageDays = useMemo(() => {
    if (!usageStartDate || !usageEndDate) return null;
    return differenceInDays(new Date(usageEndDate + 'T12:00:00'), new Date(usageStartDate + 'T12:00:00'));
  }, [usageStartDate, usageEndDate]);

  const handleAddToService = async () => {
    if (selectedServices.length === 0 || !selectedProduct || !selectedProductData) return;

    const servicesToLink = selectedServices.filter(serviceId =>
      !serviceProducts.some(sp => sp.service_id === serviceId && sp.product_id === selectedProduct)
    );
    if (servicesToLink.length === 0) return;

    if (knowsQuantity === 'yes') {
      const normalizedQuantity = convertQuantity(quantityPerUse, selectedUnit, selectedProductData.unit) ?? quantityPerUse;
      await Promise.all(servicesToLink.map(serviceId => createServiceProduct.mutateAsync({
        service_id: serviceId,
        product_id: selectedProduct,
        quantity_per_use: normalizedQuantity,
        tracking_method: 'exact',
        notes: null,
      })));
    } else {
      const normalizedContainer = convertQuantity(containerAmount, containerUnit, selectedProductData.unit) ?? containerAmount;
      const calcQty = normalizedContainer > 0 && estimatedAppointments > 0 
        ? normalizedContainer / estimatedAppointments 
        : 0;
      await Promise.all(servicesToLink.map(serviceId => createServiceProduct.mutateAsync({
        service_id: serviceId,
        product_id: selectedProduct,
        quantity_per_use: calcQty,
        estimated_appointments: estimatedAppointments || null,
        container_amount: containerAmount || null,
        container_unit: containerUnit || selectedProductData.unit,
        tracking_method: 'estimated',
        notes: usageStartDate && usageEndDate 
          ? `Período de uso: ${usageStartDate} a ${usageEndDate}` 
          : null,
      })));
    }

    resetForm();
  };

  const handleAddToTemplate = async () => {
    if (!selectedTemplate || !selectedProduct || !selectedProductData) return;

    if (knowsQuantity === 'yes') {
      const normalizedQuantity = convertQuantity(quantityPerUse, selectedUnit, selectedProductData.unit) ?? quantityPerUse;
      await createTemplateProduct.mutateAsync({
        template_id: selectedTemplate,
        product_id: selectedProduct,
        quantity_per_use: normalizedQuantity,
        tracking_method: 'exact',
        notes: null,
      });
    } else {
      const normalizedContainer = convertQuantity(containerAmount, containerUnit, selectedProductData.unit) ?? containerAmount;
      const calcQty = normalizedContainer > 0 && estimatedAppointments > 0 
        ? normalizedContainer / estimatedAppointments 
        : 0;
      await createTemplateProduct.mutateAsync({
        template_id: selectedTemplate,
        product_id: selectedProduct,
        quantity_per_use: calcQty,
        estimated_appointments: estimatedAppointments || null,
        container_amount: containerAmount || null,
        container_unit: containerUnit || selectedProductData.unit,
        tracking_method: 'estimated',
        notes: usageStartDate && usageEndDate 
          ? `Período de uso: ${usageStartDate} a ${usageEndDate}` 
          : null,
      });
    }

    resetForm();
  };

  const resetForm = () => {
    setSelectedProduct('');
    setSelectedServices([]);
    setQuantityPerUse(1);
    setEstimatedAppointments(0);
    setContainerAmount(0);
    setContainerUnit('');
    setUsageStartDate('');
    setUsageEndDate('');
    setKnowsQuantity('yes');
  };

  const handleUpdateServiceQuantity = async (id: string, sp: any) => {
    const isEstimated = sp.tracking_method === 'estimated';
    
    if (isEstimated) {
      const product = products.find(p => p.id === sp.product_id);
      const normalizedContainer = product ? (convertQuantity(sp.container_amount || 1, sp.container_unit, product.unit) ?? (sp.container_amount || 1)) : (sp.container_amount || 1);
      const calculatedQuantityPerUse = normalizedContainer / editEstimatedAppointments;
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

  const handleUpdateTemplateQuantity = async (id: string, tp: any) => {
    const isEstimated = tp.tracking_method === 'estimated';
    
    if (isEstimated) {
      const product = products.find(p => p.id === tp.product_id);
      const normalizedContainer = product ? (convertQuantity(tp.container_amount || 1, tp.container_unit, product.unit) ?? (tp.container_amount || 1)) : (tp.container_amount || 1);
      const calculatedQuantityPerUse = normalizedContainer / editEstimatedAppointments;
      await updateTemplateProduct.mutateAsync({
        id,
        quantity_per_use: calculatedQuantityPerUse,
        estimated_appointments: editEstimatedAppointments,
      });
    } else {
      await updateTemplateProduct.mutateAsync({
        id,
        quantity_per_use: editQuantity,
      });
    }
    setEditingId(null);
  };

  const handleDeleteServiceProduct = async (id: string) => {
    await deleteServiceProduct.mutateAsync(id);
  };

  const handleDeleteTemplateProduct = async (id: string) => {
    await deleteTemplateProduct.mutateAsync(id);
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

  // Get products that are already linked to the selected template
  const linkedTemplateProductIds = templateProducts
    .filter(tp => tp.template_id === selectedTemplate)
    .map(tp => tp.product_id);

  const availableProductsForService = selectedServices.length === 0
    ? activeProducts
    : activeProducts.filter(p => selectedServices.some(serviceId =>
        !serviceProducts.some(sp => sp.service_id === serviceId && sp.product_id === p.id)
      ));
  const availableProductsForTemplate = activeProducts.filter(p => !linkedTemplateProductIds.includes(p.id));

  // Calculate estimated appointments remaining for each linked product
  const getEstimatedAppointments = (sp: any, product: any) => {
    if (!product || !sp) return 0;
    
    const isEstimated = sp.tracking_method === 'estimated';
    
    if (isEstimated && sp.estimated_appointments && sp.container_amount) {
      const normalizedContainer = convertQuantity(sp.container_amount, sp.container_unit, product.unit) ?? sp.container_amount;
      const containersRemaining = product.current_stock / normalizedContainer;
      return Math.floor(containersRemaining * sp.estimated_appointments);
    }
    
    if (sp.quantity_per_use > 0) {
      return Math.floor(product.current_stock / sp.quantity_per_use);
    }
    
    return 0;
  };

  const renderProductForm = (isForTemplate: boolean) => {
    const availableProducts = isForTemplate ? availableProductsForTemplate : availableProductsForService;
    const isDisabled = isForTemplate ? !selectedTemplate : selectedServices.length === 0;
    const availableUnits = selectedProductData 
      ? getAvailableUnits(selectedProductData.product_type, selectedProductData.unit)
      : [];

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">
              {isForTemplate ? 'Modelo de Pacote' : 'Serviço'}
            </Label>
            {isForTemplate ? (
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um modelo de pacote" />
                </SelectTrigger>
                <SelectContent>
                  {packageTemplates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      <div className="flex items-center gap-2">
                        <Layers className="h-3 w-3" />
                        {template.name} ({template.total_sessions} sessões)
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <ScrollArea className="h-32 rounded-md border bg-background p-2">
                <div className="space-y-1">
                    {services.filter(s => s.is_active).map(service => {
                    const checked = selectedServices.includes(service.id);
                    return (
                      <label key={service.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => setSelectedServices(prev => v ? [...prev, service.id] : prev.filter(id => id !== service.id))}
                        />
                        <span className="truncate">{service.name}</span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
            {!isForTemplate && selectedServices.length > 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {selectedServices.length} serviço(s) selecionado(s) receberão o mesmo consumo.
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Produto</Label>
            <Select 
              value={selectedProduct} 
              onValueChange={(v) => {
                setSelectedProduct(v);
                setKnowsQuantity('yes');
              }}
              disabled={isDisabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {availableProducts.map(product => (
                  <SelectItem key={product.id} value={product.id}>
                    <div className="flex items-center gap-2">
                      {isEstimatedTracking(product.product_type) ? (
                        <Droplets className="h-3 w-3 text-primary" />
                      ) : (
                        <Box className="h-3 w-3 text-primary" />
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
          <div className="pt-3 border-t space-y-3">
            {/* Expiry alert */}
            {selectedProductData.expiry_date && (() => {
              const daysToExpiry = differenceInDays(new Date(selectedProductData.expiry_date + 'T12:00:00'), new Date());
              if (daysToExpiry <= 30) {
                return (
                  <Alert className="border-destructive bg-destructive/10">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <AlertDescription className="text-destructive text-xs">
                      {daysToExpiry <= 0 
                        ? `Produto VENCIDO desde ${format(new Date(selectedProductData.expiry_date + 'T12:00:00'), 'dd/MM/yyyy')}`
                        : `Produto vence em ${daysToExpiry} dia(s) - ${format(new Date(selectedProductData.expiry_date + 'T12:00:00'), 'dd/MM/yyyy')}`
                      }
                    </AlertDescription>
                  </Alert>
                );
              }
              return null;
            })()}

            {/* Product info summary */}
            <div className="flex items-center gap-2 text-sm">
              {isEstimatedTracking(selectedProductData.product_type) ? (
                <Droplets className="h-4 w-4 text-primary" />
              ) : (
                <Box className="h-4 w-4 text-primary" />
              )}
              <span className="font-medium">
                {selectedProductData.product_type === 'liquid' ? 'Líquido' : 
                 selectedProductData.product_type === 'gel' ? 'Gel' : 
                 selectedProductData.product_type === 'cream' ? 'Creme' :
                 selectedProductData.product_type === 'solid' ? 'Sólido' :
                 selectedProductData.product_type === 'powder' ? 'Pó' : 'Outro'}
              </span>
              <Badge variant="outline" className="text-xs">
                Estoque: {selectedProductData.current_stock} {PRODUCT_UNITS[selectedProductData.unit] || selectedProductData.unit}
              </Badge>
            </div>

            {/* Do you know the quantity per use? */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Você sabe a quantidade que gasta por atendimento?</Label>
              <RadioGroup 
                value={knowsQuantity} 
                onValueChange={(v) => setKnowsQuantity(v as 'yes' | 'no')}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="knows-yes" />
                  <Label htmlFor="knows-yes" className="text-sm cursor-pointer">Sim, eu sei</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="knows-no" />
                  <Label htmlFor="knows-no" className="text-sm cursor-pointer">Não sei, quero calcular</Label>
                </div>
              </RadioGroup>
            </div>

            {knowsQuantity === 'yes' ? (
              /* EXACT MODE - knows quantity */
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Quantidade por atendimento</Label>
                  <Input
                    type="number"
                    value={quantityPerUse || ''}
                    onChange={(e) => setQuantityPerUse(parseFloat(e.target.value) || 0)}
                    min="0.01"
                    step="0.01"
                    placeholder="Ex: 50"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Unidade</Label>
                  <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUnits.map(u => (
                        <SelectItem key={u} value={u}>{PRODUCT_UNITS[u] || u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {quantityPerUse > 0 && (
                  <div className="col-span-2 p-2 rounded-md bg-muted/50 text-xs space-y-1">
                    <div className="flex items-center gap-1">
                      <Info className="h-3 w-3 text-primary" />
                      <span className="font-medium">Projeção:</span>
                    </div>
                    <p>
                      Com o estoque atual de {selectedProductData.current_stock} {PRODUCT_UNITS[selectedProductData.unit]}, 
                      você consegue fazer aproximadamente{' '}
                      <strong>{Math.floor(selectedProductData.current_stock / (convertQuantity(quantityPerUse, selectedUnit, selectedProductData.unit) ?? quantityPerUse))} atendimentos</strong>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* ESTIMATED MODE - doesn't know quantity, will calculate */
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Quantidade no recipiente</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={containerAmount || ''}
                        onChange={(e) => setContainerAmount(parseFloat(e.target.value) || 0)}
                        min="0.01"
                        step="0.01"
                        className="flex-1"
                        placeholder="Ex: 500"
                      />
                      <Select value={containerUnit} onValueChange={setContainerUnit}>
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableUnits.map(u => (
                            <SelectItem key={u} value={u}>{PRODUCT_UNITS[u] || u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Ex: 500ml do recipiente que você usa
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Atendimentos com esse recipiente</Label>
                    <Input
                      type="number"
                      value={estimatedAppointments || ''}
                      onChange={(e) => setEstimatedAppointments(parseInt(e.target.value) || 0)}
                      min="0"
                      placeholder="Deixe 0 se não souber"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Quantos atendimentos fez com essa quantidade
                    </p>
                  </div>
                </div>

                {/* Date range for tracking */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Data início de uso
                    </Label>
                    <Input
                      type="date"
                      value={usageStartDate}
                      onChange={(e) => setUsageStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Data fim de uso
                    </Label>
                    <Input
                      type="date"
                      value={usageEndDate}
                      onChange={(e) => setUsageEndDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Auto-calculated projections */}
                {(containerAmount > 0 && estimatedAppointments > 0) && (
                  <div className="p-3 rounded-md bg-primary/5 border border-primary/20 text-xs space-y-2">
                    <div className="flex items-center gap-1 font-medium text-primary">
                      <Info className="h-3.5 w-3.5" />
                      Cálculos automáticos
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground">Consumo por atendimento:</span>
                        <p className="font-semibold">
                          {(calculatedUsagePerAppointment ?? 0).toFixed(2)} {PRODUCT_UNITS[selectedProductData.unit] || selectedProductData.unit}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Atend. com estoque total:</span>
                        <p className="font-semibold">
                          {totalAppointmentsPossible ?? '—'} atendimentos
                        </p>
                      </div>
                      {usageDays && usageDays > 0 && (
                        <>
                          <div>
                            <span className="text-muted-foreground">Dias de uso:</span>
                            <p className="font-semibold">{usageDays} dias</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Atend./dia (média):</span>
                            <p className="font-semibold">
                              {(estimatedAppointments / usageDays).toFixed(1)}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {estimatedAppointments === 0 && containerAmount > 0 && (
                  <div className="p-2 rounded-md bg-muted/50 text-xs text-muted-foreground flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <p>Preencha a data de início e fim de uso, e a quantidade de atendimentos realizados com esse recipiente. O sistema calculará automaticamente o consumo por atendimento.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <Button 
          onClick={isForTemplate ? handleAddToTemplate : handleAddToService}
          disabled={isDisabled || !selectedProduct || (isForTemplate ? createTemplateProduct.isPending : createServiceProduct.isPending)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1" />
          Vincular Produto ao {isForTemplate ? 'Modelo de Pacote' : 'Serviço'}
        </Button>
      </div>
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Link2 className="h-3.5 w-3.5" />
          Vincular Produtos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-base">Vincular Produtos</DialogTitle>
          <DialogDescription className="text-xs">
            Defina quais produtos são usados em cada serviço ou modelo de pacote. Para líquidos, gel e cremes, informe quantos atendimentos o recipiente em uso dura em média.
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

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'services' | 'packages')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="services" className="gap-1.5 text-xs h-8">
              <Package className="h-3.5 w-3.5" />
              Serviços
            </TabsTrigger>
            <TabsTrigger value="packages" className="gap-1.5 text-xs h-8">
              <Layers className="h-3.5 w-3.5" />
              Modelos de Pacotes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="services" className="space-y-2.5">
            {canEdit && (
              <div className="p-3 rounded-lg border bg-muted/30">
                {renderProductForm(false)}
              </div>
            )}

            <ScrollArea className="h-[300px]">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="h-8 py-1.5 text-[11px]">Serviço</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Produto</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Método</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Consumo</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Estoque</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Atend. Restantes</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px] text-right">Ações</TableHead>
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
                      const estimatedAppts = getEstimatedAppointments(sp, product);
                      const isLowStock = product && product.current_stock <= (product.min_stock_alert || 0);
                      const isEstimated = sp.tracking_method === 'estimated';
                      
                      return (
                        <TableRow key={sp.id}>
                          <TableCell className="py-1.5 text-xs">
                            <Badge variant="outline">
                              {sp.service?.name || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs">
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
                          <TableCell className="py-1.5 text-xs">
                            <Badge variant={isEstimated ? 'secondary' : 'outline'} className="text-[10px]">
                              {isEstimated ? 'Estimado' : 'Exato'}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs">
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
                                <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleUpdateServiceQuantity(sp.id, sp)}>OK</Button>
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
                          <TableCell className="py-1.5 text-xs">
                            <span className={isLowStock ? 'text-destructive font-medium' : ''}>
                              {product?.current_stock || 0} {PRODUCT_UNITS[product?.unit || ''] || product?.unit}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs">
                            <Badge variant={estimatedAppts < 5 ? 'destructive' : 'secondary'}>
                              {estimatedAppts} atend.
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs text-right">
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
                                      onClick={() => handleDeleteServiceProduct(sp.id)}
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
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="packages" className="space-y-2.5">
            {canEdit && (
              <div className="p-3 rounded-lg border bg-muted/30">
                {renderProductForm(true)}
              </div>
            )}

            <ScrollArea className="h-[300px]">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="h-8 py-1.5 text-[11px]">Modelo de Pacote</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Produto</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Método</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Consumo</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Estoque</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Atend. Restantes</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templateProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        <Layers className="h-10 w-10 mx-auto mb-3 opacity-20" />
                        <p>Nenhum produto vinculado a modelos de pacotes</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    templateProducts.map(tp => {
                      const product = products.find(p => p.id === tp.product_id);
                      const estimatedAppts = getEstimatedAppointments(tp, product);
                      const isLowStock = product && product.current_stock <= (product.min_stock_alert || 0);
                      const isEstimated = tp.tracking_method === 'estimated';
                      
                      return (
                        <TableRow key={tp.id}>
                          <TableCell className="py-1.5 text-xs">
                            <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30 text-purple-700">
                              <Layers className="h-3 w-3 mr-1" />
                              {tp.template?.name || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs">
                            <div className="flex items-center gap-2">
                              {product && isEstimatedTracking(product.product_type) ? (
                                <Droplets className="h-3 w-3 text-blue-500" />
                              ) : (
                                <Box className="h-3 w-3 text-amber-500" />
                              )}
                              <div>
                                <p className="font-medium text-sm">{tp.product?.name || '-'}</p>
                                {isLowStock && (
                                  <Badge variant="destructive" className="text-[10px] mt-0.5">
                                    Estoque Baixo
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs">
                            <Badge variant={isEstimated ? 'secondary' : 'outline'} className="text-[10px]">
                              {isEstimated ? 'Estimado' : 'Exato'}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs">
                            {editingId === tp.id ? (
                              <div className="flex items-center gap-1">
                                {isEstimated ? (
                                  <>
                                    <Input
                                      type="number"
                                      value={editEstimatedAppointments}
                                      onChange={(e) => setEditEstimatedAppointments(parseInt(e.target.value) || 1)}
                                      min="1"
                                      className="w-16 h-7 text-xs"
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
                                <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleUpdateTemplateQuantity(tp.id, tp)}>OK</Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                {isEstimated ? (
                                  <span className="text-sm">
                                    {tp.container_amount} {tp.container_unit} → {tp.estimated_appointments} atend.
                                  </span>
                                ) : (
                                  <span className="text-sm">{tp.quantity_per_use} {product?.unit}/uso</span>
                                )}
                                {canEdit && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={() => {
                                      setEditingId(tp.id);
                                      setEditQuantity(tp.quantity_per_use);
                                      setEditEstimatedAppointments(tp.estimated_appointments || 30);
                                    }}
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5 text-xs">
                            <span className={isLowStock ? 'text-destructive font-medium' : ''}>
                              {product?.current_stock || 0} {PRODUCT_UNITS[product?.unit || ''] || product?.unit}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs">
                            <Badge variant={estimatedAppts < 5 ? 'destructive' : 'secondary'}>
                              {estimatedAppts} atend.
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs text-right">
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
                                      Tem certeza que deseja remover o vínculo entre "{tp.product?.name}" e "{tp.template?.name}"?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteTemplateProduct(tp.id)}
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
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

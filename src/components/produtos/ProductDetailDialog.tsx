import { useState, useMemo, useEffect } from 'react';
import { format, parseISO, differenceInDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
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
  Trash2,
  BarChart3,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SafeDateInput } from '@/components/ui/safe-date-input';
import { convertQuantity } from '@/lib/productStock';
import { isProductExpired } from '@/lib/productExpiry';
import { type Product, type ProductPurchase, type ProductType, type ProductUnit } from '@/hooks/useProducts';
import { useSuppliers, type Supplier } from '@/hooks/useSuppliers';
import { useServices } from '@/hooks/useServices';
import { usePackageTemplates } from '@/hooks/usePackageTemplates';
import { useServiceProducts } from '@/hooks/useServiceProducts';
import { usePackageTemplateProducts } from '@/hooks/usePackageTemplateProducts';
import { useProductConsumption } from '@/hooks/useProductConsumption';
import { useProductDailyConsumption } from '@/hooks/useProductDailyConsumption';
import { useAppointments } from '@/hooks/useAppointments';
import { useAuth } from '@/contexts/AuthContext';

interface ProductDetailDialogProps {
  product: Product | null;
  purchases: ProductPurchase[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateProduct: (data: Partial<Product> & { id: string }) => Promise<void>;
  onUpdatePurchase?: (data: Partial<ProductPurchase> & { id: string }) => Promise<void>;
  onDeletePurchase?: (id: string) => Promise<void>;
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

// Helper to check if product uses estimated tracking (liquid/gel/cream/other)
const isEstimatedTracking = (type: ProductType, unit: ProductUnit) => 
  ['liquid', 'gel', 'cream'].includes(type) || unit === 'other';

const PRODUCT_UNITS: { value: ProductUnit; label: string }[] = [
  { value: 'un', label: 'Unidade(s)' },
  { value: 'ml', label: 'mL' },
  { value: 'l', label: 'L' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'other', label: 'Outros' },
];

export function ProductDetailDialog({
  product,
  purchases,
  open,
  onOpenChange,
  onUpdateProduct,
  onUpdatePurchase,
  onDeletePurchase,
  onCreateServiceLink,
  onUpdateServiceLink,
  onDeleteServiceLink,
}: ProductDetailDialogProps) {
  const { suppliers, activeSuppliers } = useSuppliers();
  const { services, activeServices } = useServices();
  const { templates } = usePackageTemplates();
  const { serviceProducts } = useServiceProducts();
  const { templateProducts, createTemplateProduct, deleteTemplateProduct } = usePackageTemplateProducts();
  const { consumptionReport, consumptionRecords } = useProductConsumption();

  const { appointments } = useAppointments();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('receptionist');



  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [serviceLinkSearch, setServiceLinkSearch] = useState('');
  const [templateLinkSearch, setTemplateLinkSearch] = useState('');
  const [quantityPerUse, setQuantityPerUse] = useState(0);
  const [quantityPerUseUnit, setQuantityPerUseUnit] = useState<ProductUnit>('un');
  const [estimatedAppointments, setEstimatedAppointments] = useState(30);
  const [containerAmount, setContainerAmount] = useState(1);
  const [containerUnit, setContainerUnit] = useState<ProductUnit>('ml');
  const [knowsQuantity, setKnowsQuantity] = useState<'yes' | 'no'>('yes');
  const [isSaving, setIsSaving] = useState(false);
  
  // Stock editing state
  const [isEditingStock, setIsEditingStock] = useState(false);
  const [newStockValue, setNewStockValue] = useState(0);
  const [stockEditReason, setStockEditReason] = useState('');
  
  // Purchase editing state
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [purchaseEditForm, setPurchaseEditForm] = useState({
    quantity: 0,
    unit_price: 0,
    total_price: 0,
    purchase_date: '',
    supplier: '',
    started_using_at: '',
    finished_at: '',
    notes: '',
  });

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

  // Get template links for this product
  const productTemplateLinks = useMemo(() => {
    if (!product) return [];
    return templateProducts.filter(tp => tp.product_id === product.id);
  }, [product, templateProducts]);

  // Get consumption report for this product
  const productConsumption = useMemo(() => {
    if (!product) return null;
    return consumptionReport.find(r => r.product_id === product.id);
  }, [product, consumptionReport]);

  // Calculate usage statistics within the product's usage window
  const usageStats = useMemo(() => {
    if (!product) return { totalAppointments: 0, avgPerAppointment: 0, byService: [] as Array<{ service_id: string; service_name: string; appointments: number; qtyPerUse: number; totalQty: number }> };

    const startedUsing = product.started_using_at ? parseISO(product.started_using_at + 'T00:00:00') : null;
    const finishedUsing = product.finished_at ? parseISO(product.finished_at + 'T23:59:59') : new Date();

    const inWindow = (apt: any) => {
      if (apt.status !== 'completed') return false;
      if (!startedUsing) return true;
      const t = new Date(apt.start_time);
      return t >= startedUsing && t <= finishedUsing;
    };

    const totalQuantityUsed = Math.max(0, (product.quantity_purchased || 0) - (product.current_stock || 0));
    let totalAppointments = 0;

    const perService = productServiceLinks.map((sp: any) => {
      const apts = appointments.filter(apt => apt.service_id === sp.service_id && inWindow(apt));
      totalAppointments += apts.length;
      const qtyPerUse = Number(sp.quantity_per_use ?? 0);
      return {
        service_id: sp.service_id,
        service_name: sp.service?.name || activeServices.find(s => s.id === sp.service_id)?.name || 'Serviço',
        appointments: apts.length,
        qtyPerUse,
        totalQty: apts.length * qtyPerUse,
      };
    });

    // Quando o consumo planejado (sum(qty_per_use*apts)) é 0 ou divergente do consumo real
    // do estoque, distribuímos o consumo real proporcionalmente entre os serviços com base
    // no número de atendimentos. Isso garante que o "Consumo por serviço" reflita o que
    // realmente saiu do estoque, e não um valor fixo por serviço.
    const plannedTotal = perService.reduce((s, x) => s + x.totalQty, 0);
    const useReal = totalQuantityUsed > 0 && (plannedTotal === 0 || Math.abs(plannedTotal - totalQuantityUsed) > 0.001);
    const byService = perService.map(x => {
      if (useReal && totalAppointments > 0) {
        const share = x.appointments / totalAppointments;
        const totalQty = totalQuantityUsed * share;
        const qtyPerUse = x.appointments > 0 ? totalQty / x.appointments : 0;
        return { ...x, qtyPerUse, totalQty };
      }
      return x;
    });

    const avgPerAppointment = totalAppointments > 0 ? totalQuantityUsed / totalAppointments : 0;
    return { totalAppointments, avgPerAppointment, byService };
  }, [product, productServiceLinks, appointments, activeServices]);

  // Cycle summary: tracks current cycle (days & appointments) and previous cycle benchmark
  const cycleSummary = useMemo(() => {
    if (!product) return null;

    const finishedCycles = productPurchases
      .filter(p => p.started_using_at && p.finished_at)
      .map(p => {
        const start = parseISO(p.started_using_at! + 'T00:00:00');
        const end = parseISO(p.finished_at! + 'T23:59:59');
        const days = Math.max(1, differenceInDays(end, start) + 1);
        const apts = appointments.filter(a => {
          if (a.status !== 'completed') return false;
          const t = new Date(a.start_time);
          return t >= start && t <= end && productServiceLinks.some(sp => sp.service_id === a.service_id);
        }).length;
        return { purchase: p, days, appointments: apts };
      });

    const lastCycle = finishedCycles[0] || null;

    let currentDays = 0;
    let currentAppointments = 0;
    if (product.started_using_at && !product.finished_at) {
      const start = parseISO(product.started_using_at + 'T00:00:00');
      currentDays = Math.max(0, differenceInDays(new Date(), start));
      currentAppointments = appointments.filter(a => {
        if (a.status !== 'completed') return false;
        const t = new Date(a.start_time);
        return t >= start && productServiceLinks.some(sp => sp.service_id === a.service_id);
      }).length;
    }

    const nextPurchase = productPurchases.find(p => !p.started_using_at && !p.finished_at) || null;

    let runningOutAlert: string | null = null;
    if (lastCycle && product.started_using_at && !product.finished_at) {
      const pctDays = currentDays / lastCycle.days;
      const pctApts = lastCycle.appointments > 0 ? currentAppointments / lastCycle.appointments : 0;
      const pct = Math.max(pctDays, pctApts);
      if (pct >= 0.8) {
        runningOutAlert = `Atenção: já atingiu ${Math.round(pct * 100)}% do ciclo anterior (${lastCycle.days}d / ${lastCycle.appointments} atend.). Produto pode estar acabando.`;
      }
    }

    return { finishedCycles, lastCycle, currentDays, currentAppointments, nextPurchase, runningOutAlert };
  }, [product, productPurchases, appointments, productServiceLinks]);


  // Available services to link (not already linked)
  const availableServicesToLink = useMemo(() => {
    const linkedServiceIds = productServiceLinks.map(sp => sp.service_id);
    return activeServices.filter(s => !linkedServiceIds.includes(s.id));
  }, [activeServices, productServiceLinks]);

  // Available templates to link (not already linked)
  const availableTemplatesToLink = useMemo(() => {
    const linkedTemplateIds = productTemplateLinks.map(tp => tp.template_id);
    return templates.filter(t => !linkedTemplateIds.includes(t.id));
  }, [templates, productTemplateLinks]);

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
      started_using_at: product.started_using_at,
      finished_at: product.finished_at,
      expiry_date: product.expiry_date,
      current_stock: product.current_stock,
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

  // Sync containerUnit when product loads/changes
  useEffect(() => {
    if (product) {
      setContainerUnit(product.unit);
      setQuantityPerUseUnit(product.unit);
    }
  }, [product?.id, product?.unit]);

  const handleAddServiceLink = async () => {
    if (!product || !selectedServiceId) return;

    const useEstimated = knowsQuantity === 'no';

    if (useEstimated) {
      const normalizedContainer = convertQuantity(containerAmount, containerUnit, product.unit) ?? containerAmount;
      const calculatedQuantityPerUse = estimatedAppointments > 0 ? normalizedContainer / estimatedAppointments : 0;
      await onCreateServiceLink({
        service_id: selectedServiceId,
        product_id: product.id,
        quantity_per_use: calculatedQuantityPerUse,
        estimated_appointments: estimatedAppointments,
        container_amount: containerAmount,
        container_unit: containerUnit,
        tracking_method: 'estimated',
        notes: null,
      });
    } else {
      const normalizedQty = convertQuantity(quantityPerUse, quantityPerUseUnit, product.unit) ?? quantityPerUse;
      await onCreateServiceLink({
        service_id: selectedServiceId,
        product_id: product.id,
        quantity_per_use: normalizedQty,
        tracking_method: 'exact',
        notes: null,
      });
    }

    setSelectedServiceId('');
    setQuantityPerUse(0);
    setEstimatedAppointments(30);
    setContainerAmount(1);
    setKnowsQuantity('yes');
  };

  const handleAddTemplateLink = async () => {
    if (!product || !selectedTemplateId) return;

    const useEstimated = knowsQuantity === 'no';

    if (useEstimated) {
      const normalizedContainer = convertQuantity(containerAmount, containerUnit, product.unit) ?? containerAmount;
      const calculatedQuantityPerUse = estimatedAppointments > 0 ? normalizedContainer / estimatedAppointments : 0;
      await createTemplateProduct.mutateAsync({
        template_id: selectedTemplateId,
        product_id: product.id,
        quantity_per_use: calculatedQuantityPerUse,
        estimated_appointments: estimatedAppointments,
        container_amount: containerAmount,
        container_unit: containerUnit,
        tracking_method: 'estimated',
        notes: null,
      });
    } else {
      const normalizedQty = convertQuantity(quantityPerUse, quantityPerUseUnit, product.unit) ?? quantityPerUse;
      await createTemplateProduct.mutateAsync({
        template_id: selectedTemplateId,
        product_id: product.id,
        quantity_per_use: normalizedQty,
        tracking_method: 'exact',
        notes: null,
      });
    }

    setSelectedTemplateId('');
    setQuantityPerUse(0);
    setEstimatedAppointments(30);
    setContainerAmount(1);
    setKnowsQuantity('yes');
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
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">{product.name}</DialogTitle>
              <DialogDescription>
                {product.brand && <span className="mr-2">{product.brand}</span>}
                {product.category && <Badge variant="outline">{product.category}</Badge>}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="info">Info</TabsTrigger>
              <TabsTrigger value="purchases">Compras ({productPurchases.length})</TabsTrigger>
              <TabsTrigger value="services">Serviços ({productServiceLinks.length})</TabsTrigger>
              <TabsTrigger value="templates">Pacotes ({productTemplateLinks.length})</TabsTrigger>
              <TabsTrigger value="consumption">Consumo</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4 mt-4">
              {isProductExpired(product) && (
                <div className="rounded-lg border border-destructive bg-destructive/10 p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-destructive">Produto Vencido</p>
                    <p className="text-xs text-destructive/80">
                      A validade deste produto expirou em {format(parseISO(product.expiry_date!), 'dd/MM/yyyy')}. Não utilize e descarte conforme as normas de segurança.
                    </p>
                  </div>
                </div>
              )}
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

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Quantidade Atual em Estoque</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={editForm.current_stock ?? 0}
                        onChange={(e) => setEditForm({ ...editForm, current_stock: parseFloat(e.target.value) || 0 })}
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Ex: 20 (na unidade selecionada acima — L, mL, g, etc.)
                      </p>
                    </div>
                    <div>
                      <Label>Validade</Label>
                      <SafeDateInput
                        value={editForm.expiry_date as any}
                        onCommit={(v) => setEditForm({ ...editForm, expiry_date: v })}
                      />
                    </div>
                    <div>
                      <Label>Início do Uso</Label>
                      <SafeDateInput
                        value={editForm.started_using_at as any}
                        onCommit={(v) => setEditForm({ ...editForm, started_using_at: v })}
                      />
                    </div>
                    <div>
                      <Label>Término do Uso</Label>
                      <SafeDateInput
                        value={editForm.finished_at as any}
                        onCommit={(v) => setEditForm({ ...editForm, finished_at: v })}
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
                      <CurrencyInput
                        value={editForm.sale_price || ''}
                        onValueChange={(value) => setEditForm({ ...editForm, sale_price: value })}
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
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm text-muted-foreground">Estoque Atual</div>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setNewStockValue(product.current_stock);
                              setStockEditReason('');
                              setIsEditingStock(true);
                            }}
                            title="Editar quantidade"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
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

                  {/* Stock Edit Dialog */}
                  {isEditingStock && (
                    <div className="p-4 rounded-lg border-2 border-primary/50 bg-primary/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Editar Quantidade em Estoque</h4>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditingStock(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs">Nova Quantidade</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={newStockValue}
                            onChange={(e) => setNewStockValue(parseFloat(e.target.value) || 0)}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Motivo (opcional)</Label>
                          <Input
                            value={stockEditReason}
                            onChange={(e) => setStockEditReason(e.target.value)}
                            placeholder="Ex: Correção de inventário"
                            className="h-9"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setIsEditingStock(false)}>
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            const reason = stockEditReason ? ` (${stockEditReason})` : '';
                            const noteEntry = `\n[${format(new Date(), 'dd/MM/yyyy HH:mm')}] Estoque ajustado de ${product.current_stock} para ${newStockValue}${reason}`;
                            await onUpdateProduct({
                              id: product.id,
                              current_stock: newStockValue,
                              notes: (product.notes || '') + noteEntry,
                            });
                            setIsEditingStock(false);
                          }}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Salvar
                        </Button>
                      </div>
                    </div>
                  )}

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

                   {/* Usage Dates - Editable */}
                   <Separator />
                   <div>
                     <h4 className="font-medium flex items-center gap-2 mb-3">
                       <Calendar className="h-4 w-4" />
                       Período de Uso
                     </h4>

                     {cycleSummary && (
                       <div className="mb-3 space-y-2">
                         {cycleSummary.runningOutAlert && (
                           <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs text-amber-900 dark:text-amber-100">
                             ⚠️ {cycleSummary.runningOutAlert}
                           </div>
                         )}
                         <div className="grid grid-cols-2 gap-2">
                           <div className="rounded-lg border bg-muted/30 p-2.5">
                             <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ciclo atual</div>
                             <div className="text-xs tabular-nums mt-1">
                               {product.started_using_at && !product.finished_at
                                 ? `${cycleSummary.currentDays}d · ${cycleSummary.currentAppointments} atend.`
                                 : 'Não iniciado'}
                             </div>
                           </div>
                           <div className="rounded-lg border bg-muted/30 p-2.5">
                             <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ciclo anterior</div>
                             <div className="text-xs tabular-nums mt-1">
                               {cycleSummary.lastCycle
                                 ? `${cycleSummary.lastCycle.days}d · ${cycleSummary.lastCycle.appointments} atend.`
                                 : '—'}
                             </div>
                           </div>
                         </div>
                         {cycleSummary.nextPurchase && (
                           <div className="rounded-lg border border-dashed bg-muted/20 p-2.5 text-xs text-muted-foreground">
                             Próxima compra aguardando: {Number(cycleSummary.nextPurchase.quantity)} {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}
                             {' '}— ao informar o término, será iniciada automaticamente.
                           </div>
                         )}
                       </div>
                     )}


                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Início do Uso
                        </Label>
                        {canEdit ? (
                          <SafeDateInput
                            value={product.started_using_at || ''}
                            onCommit={(v) => {
                              // Ao informar/alterar o início do uso, limpamos o término
                              // (para que o usuário registre manualmente quando terminar).
                              onUpdateProduct({
                                id: product.id,
                                started_using_at: v,
                                ...(v ? { finished_at: null as any } : {}),
                              });
                            }}
                            className="h-9"
                          />
                        ) : (
                          <span className="text-sm">
                            {product.started_using_at 
                              ? format(parseISO(product.started_using_at), 'dd/MM/yyyy', { locale: ptBR })
                              : 'Não iniciado'}
                          </span>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Término do Uso
                        </Label>
                        {canEdit ? (
                           <SafeDateInput
                             value={product.finished_at || ''}
                             onCommit={async (v) => {
                               if (v) {
                                 // Marca o término do uso preservando o estoque atual
                                 // (o estoque reflete o consumo real registrado nos atendimentos
                                 // e NÃO deve ser zerado automaticamente ao informar o término).
                                 let activePurchase = productPurchases.find(
                                   p => p.started_using_at && !p.finished_at
                                 );
                                 if (!activePurchase) {
                                   activePurchase = productPurchases.find(p => !p.finished_at) || undefined;
                                 }
                                 if (activePurchase && onUpdatePurchase) {
                                   await onUpdatePurchase({
                                     id: activePurchase.id,
                                     finished_at: v,
                                     started_using_at:
                                       activePurchase.started_using_at
                                       || product.started_using_at
                                       || activePurchase.purchase_date
                                       || v,
                                   });
                                 }
                                 // Promove próxima compra pendente (se existir) como novo ciclo,
                                 // somando seu estoque ao saldo restante do ciclo encerrado.
                                 const next = productPurchases.find(
                                   p => !p.started_using_at && !p.finished_at && p.id !== activePurchase?.id
                                 );
                                 const today = new Date().toISOString().slice(0, 10);
                                 if (next && onUpdatePurchase) {
                                   await onUpdatePurchase({ id: next.id, started_using_at: today });
                                   await onUpdateProduct({
                                     id: product.id,
                                     finished_at: null as any,
                                     started_using_at: today,
                                     current_stock: (Number(product.current_stock) || 0) + (Number(next.quantity) || 0),
                                   });
                                 } else {
                                   // Apenas registra o término — preserva estoque e início do uso.
                                   await onUpdateProduct({
                                     id: product.id,
                                     finished_at: v,
                                   });
                                 }
                               } else {
                                 await onUpdateProduct({ id: product.id, finished_at: null as any });
                               }
                             }}
                             className="h-9"
                           />




                        ) : (
                          <span className="text-sm">
                            {product.finished_at 
                              ? format(parseISO(product.finished_at), 'dd/MM/yyyy', { locale: ptBR })
                              : 'Em uso'}
                          </span>
                    )}
                  </div>

                  {/* Per-service usage breakdown within the usage window */}
                  {usageStats.byService.length > 0 && (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <h5 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                        Consumo por serviço {product.started_using_at ? '(no período de uso)' : ''}
                      </h5>
                      <div className="space-y-1.5">
                        {usageStats.byService.map(s => (
                          <div key={s.service_id} className="flex items-center justify-between text-xs tabular-nums">
                            <span className="truncate flex-1">{s.service_name}</span>
                            <span className="text-muted-foreground ml-2">
                              {s.appointments} atend. × {s.qtyPerUse} {PRODUCT_UNITS.find(u => u.value === product.unit)?.label} ={' '}
                              <span className="font-medium text-foreground">{s.totalQty.toFixed(2)}</span>
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-xs tabular-nums pt-1.5 border-t mt-1.5">
                          <span className="font-medium">Total</span>
                          <span className="font-medium">
                            {usageStats.totalAppointments} atend. — média {usageStats.avgPerAppointment.toFixed(3)} {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}/uso
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                    </div>
                    {product.started_using_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {product.finished_at 
                          ? `Duração: ${differenceInDays(parseISO(product.finished_at), parseISO(product.started_using_at))} dias`
                          : `Em uso há ${differenceInDays(new Date(), parseISO(product.started_using_at))} dias`}
                      </p>
                    )}
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
                    {canEdit && (onUpdatePurchase || onDeletePurchase) && (
                      <TableHead className="text-right">Ações</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productPurchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Nenhuma compra registrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    productPurchases.map((purchase) => {
                      const daysInUse = purchase.started_using_at 
                        ? differenceInDays(
                            purchase.finished_at ? parseISO(purchase.finished_at) : new Date(),
                            parseISO(purchase.started_using_at)
                          )
                        : null;

                      const isEditingThisPurchase = editingPurchaseId === purchase.id;

                      if (isEditingThisPurchase) {
                        return (
                          <TableRow key={purchase.id} className="bg-muted/30">
                            <TableCell>
                              <SafeDateInput
                                value={purchaseEditForm.purchase_date}
                                onCommit={(v) => setPurchaseEditForm({ ...purchaseEditForm, purchase_date: v ?? '' })}
                                className="h-8 text-xs w-28"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={purchaseEditForm.quantity}
                                onChange={(e) => {
                                  const qty = parseFloat(e.target.value) || 0;
                                  setPurchaseEditForm({ 
                                    ...purchaseEditForm, 
                                    quantity: qty,
                                    total_price: qty * purchaseEditForm.unit_price
                                  });
                                }}
                                className="h-8 text-xs w-20"
                                min="0"
                                step="0.01"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <CurrencyInput
                                  value={purchaseEditForm.unit_price}
                                  onValueChange={(price) => {
                                    setPurchaseEditForm({ 
                                      ...purchaseEditForm, 
                                      unit_price: price,
                                      total_price: purchaseEditForm.quantity * price
                                    });
                                  }}
                                  className="h-8 text-xs w-24"
                                  placeholder="Unit."
                                />
                                <CurrencyInput
                                  value={purchaseEditForm.total_price}
                                  onValueChange={(total) => {
                                    const unitPrice = purchaseEditForm.quantity > 0 ? total / purchaseEditForm.quantity : 0;
                                    setPurchaseEditForm({ 
                                      ...purchaseEditForm, 
                                      total_price: total,
                                      unit_price: unitPrice
                                    });
                                  }}
                                  className="h-8 text-xs w-24"
                                  placeholder="Total"
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={purchaseEditForm.supplier || ''}
                                onChange={(e) => setPurchaseEditForm({ ...purchaseEditForm, supplier: e.target.value })}
                                className="h-8 text-xs w-28"
                                placeholder="Fornecedor"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <SafeDateInput
                                  value={purchaseEditForm.started_using_at || ''}
                                  onCommit={(v) => setPurchaseEditForm({ ...purchaseEditForm, started_using_at: v ?? '' })}
                                  className="h-8 text-xs w-28"
                                />
                                <SafeDateInput
                                  value={purchaseEditForm.finished_at || ''}
                                  onCommit={(v) => setPurchaseEditForm({ ...purchaseEditForm, finished_at: v ?? '' })}
                                  className="h-8 text-xs w-28"
                                  placeholder="Término"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={async () => {
                                    if (onUpdatePurchase) {
                                      await onUpdatePurchase({
                                        id: purchase.id,
                                        quantity: purchaseEditForm.quantity,
                                        unit_price: purchaseEditForm.unit_price,
                                        total_price: purchaseEditForm.total_price,
                                        purchase_date: purchaseEditForm.purchase_date,
                                        supplier: purchaseEditForm.supplier || null,
                                        started_using_at: purchaseEditForm.started_using_at || null,
                                        finished_at: purchaseEditForm.finished_at || null,
                                      });
                                    }
                                    setEditingPurchaseId(null);
                                  }}
                                >
                                  <Save className="h-3.5 w-3.5 text-green-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setEditingPurchaseId(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      }

                      return (
                        <TableRow key={purchase.id}>
                          <TableCell>
                            {format(parseISO(purchase.purchase_date), 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell>
                            {purchase.quantity} {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">R$ {purchase.total_price.toFixed(2)}</p>
                              <p className="text-xs text-muted-foreground">
                                R$ {purchase.unit_price.toFixed(2)}/{PRODUCT_UNITS.find(u => u.value === product.unit)?.label}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{purchase.supplier || '-'}</TableCell>
                          <TableCell>
                            {purchase.started_using_at ? (
                              <div className="text-sm">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(parseISO(purchase.started_using_at), 'dd/MM')}
                                  {purchase.finished_at && (
                                    <> - {format(parseISO(purchase.finished_at), 'dd/MM')}</>
                                  )}
                                </div>
                                {daysInUse !== null && (
                                  <Badge variant="secondary" className="mt-1 text-xs">
                                    {daysInUse} dias
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">Não iniciado</span>
                            )}
                          </TableCell>
                          {canEdit && (onUpdatePurchase || onDeletePurchase) && (
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                {onUpdatePurchase && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setEditingPurchaseId(purchase.id);
                                      setPurchaseEditForm({
                                        quantity: purchase.quantity,
                                        unit_price: purchase.unit_price,
                                        total_price: purchase.total_price,
                                        purchase_date: purchase.purchase_date,
                                        supplier: purchase.supplier || '',
                                        started_using_at: purchase.started_using_at || '',
                                        finished_at: purchase.finished_at || '',
                                        notes: purchase.notes || '',
                                      });
                                    }}
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {onDeletePurchase && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => onDeletePurchase(purchase.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="services" className="mt-4">
              {/* Add Service Link */}
              {canEdit && availableServicesToLink.length > 0 && (
                <div className="mb-4 p-4 rounded-lg border bg-muted/30 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Vincular a Serviço</span>
                    <Badge variant="outline" className="text-xs">
                      {knowsQuantity === 'no' ? 'Modo Estimado' : 'Modo Exato'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um serviço para vincular" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableServicesToLink.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} - {s.category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        Você sabe a quantidade usada por atendimento?
                      </Label>
                      <Select value={knowsQuantity} onValueChange={(v: 'yes' | 'no') => setKnowsQuantity(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Sim, sei a quantidade exata</SelectItem>
                          <SelectItem value="no">Não sei — calcular por recipiente / atendimentos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {knowsQuantity === 'no' ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Quantidade no recipiente em uso
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              value={containerAmount}
                              onChange={(e) => setContainerAmount(parseFloat(e.target.value) || 0)}
                              min="0"
                              step="0.01"
                              className="flex-1"
                            />
                            <Select value={containerUnit} onValueChange={(v: ProductUnit) => setContainerUnit(v)}>
                              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PRODUCT_UNITS.map(u => (
                                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Ex: 1 L de um galão de 5 L
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
                            placeholder="Ex: 30"
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Média estimada de atendimentos
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Quantidade usada por atendimento
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={quantityPerUse}
                            onChange={(e) => setQuantityPerUse(parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                            className="flex-1"
                          />
                          <Select value={quantityPerUseUnit} onValueChange={(v: ProductUnit) => setQuantityPerUseUnit(v)}>
                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PRODUCT_UNITS.map(u => (
                                <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {quantityPerUseUnit !== product.unit && (
                          <p className="text-[10px] text-muted-foreground">
                            Será convertido e salvo em {PRODUCT_UNITS.find(u => u.value === product.unit)?.label} (unidade do estoque).
                          </p>
                        )}
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
                    {canEdit && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productServiceLinks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 5 : 4} className="text-center py-6 text-muted-foreground">
                        <Link2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Nenhum serviço vinculado
                      </TableCell>
                    </TableRow>
                  ) : (
                    productServiceLinks.map(sp => {
                      const service = services.find(s => s.id === sp.service_id);
                      const isEstimated = sp.tracking_method === 'estimated';
                      
                      let remainingAppointments = 0;
                      if (isEstimated && sp.estimated_appointments && sp.container_amount) {
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
                          {canEdit && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => onDeleteServiceLink(sp.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="templates" className="mt-4">
              <div className="text-sm text-muted-foreground mb-3">
                Vincule produtos aos <strong>templates de pacotes</strong>. O consumo será contabilizado automaticamente em cada sessão agendada.
              </div>
              
              {/* Add Template Link */}
              {canEdit && (
                <div className="mb-4 p-4 rounded-lg border bg-muted/30 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Vincular a Template de Pacote</span>
                    <Badge variant="outline" className="text-xs">
                      {knowsQuantity === 'no' ? 'Modo Estimado' : 'Modo Exato'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {availableTemplatesToLink.length > 0 ? (
                      <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um template de pacote" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTemplatesToLink.map(t => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name} ({t.total_sessions} sessões)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-sm text-muted-foreground p-2 text-center">
                        {templates.length === 0
                          ? 'Nenhum template de pacote cadastrado. Cadastre um template de pacote primeiro.'
                          : 'Todos os templates já estão vinculados a este produto.'}
                      </div>
                    )}

                    {availableTemplatesToLink.length > 0 && (
                      <>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Você sabe a quantidade usada por sessão?
                          </Label>
                          <Select value={knowsQuantity} onValueChange={(v: 'yes' | 'no') => setKnowsQuantity(v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">Sim, sei a quantidade exata</SelectItem>
                              <SelectItem value="no">Não sei — calcular por recipiente / atendimentos</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {knowsQuantity === 'no' ? (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-muted-foreground mb-1 block">
                                Quantidade no recipiente em uso
                              </Label>
                              <div className="flex gap-2">
                                <Input
                                  type="number"
                                  value={containerAmount}
                                  onChange={(e) => setContainerAmount(parseFloat(e.target.value) || 0)}
                                  min="0"
                                  step="0.01"
                                  className="flex-1"
                                />
                                <Select value={containerUnit} onValueChange={(v: ProductUnit) => setContainerUnit(v)}>
                                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {PRODUCT_UNITS.map(u => (
                                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
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
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground mb-1 block">
                              Quantidade usada por sessão
                            </Label>
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                value={quantityPerUse}
                                onChange={(e) => setQuantityPerUse(parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.01"
                                className="flex-1"
                              />
                              <Select value={quantityPerUseUnit} onValueChange={(v: ProductUnit) => setQuantityPerUseUnit(v)}>
                                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {PRODUCT_UNITS.map(u => (
                                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {quantityPerUseUnit !== product.unit && (
                              <p className="text-[10px] text-muted-foreground">
                                Será convertido e salvo em {PRODUCT_UNITS.find(u => u.value === product.unit)?.label} (unidade do estoque).
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  
                  {availableTemplatesToLink.length > 0 && (
                    <Button onClick={handleAddTemplateLink} disabled={!selectedTemplateId} className="w-full">
                      <Gift className="h-4 w-4 mr-1" />
                      Vincular Produto ao Template
                    </Button>
                  )}
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template de Pacote</TableHead>
                    <TableHead>Sessões</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Consumo/Sessão</TableHead>
                    {canEdit && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productTemplateLinks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 5 : 4} className="text-center py-6 text-muted-foreground">
                        <Gift className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Nenhum template de pacote vinculado
                      </TableCell>
                    </TableRow>
                  ) : (
                    productTemplateLinks.map(tp => {
                      const isEstimated = tp.tracking_method === 'estimated';
                      
                      return (
                        <TableRow key={tp.id}>
                          <TableCell>
                            <Badge variant="outline">{tp.template?.name || '-'}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {tp.template?.total_sessions || 0} sessões
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isEstimated ? 'secondary' : 'outline'} className="text-xs">
                              {isEstimated ? 'Estimado' : 'Exato'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isEstimated ? (
                              <div className="text-sm">
                                <span className="font-medium">{tp.container_amount} {tp.container_unit}</span>
                                <span className="text-muted-foreground"> → {tp.estimated_appointments} atend.</span>
                              </div>
                            ) : (
                              <span>{tp.quantity_per_use} {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}/sessão</span>
                            )}
                          </TableCell>
                          {canEdit && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteTemplateProduct.mutate(tp.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="consumption" className="mt-4">
              <ProductAutomaticConsumption
                product={product}
                consumptionRecords={consumptionRecords}
                productConsumption={productConsumption}
                appointments={appointments}
                serviceLinks={productServiceLinks}
                templateLinks={productTemplateLinks}
              />
            </TabsContent>


          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ProductAutomaticConsumption({
  product,
  consumptionRecords,
  productConsumption,
  appointments,
  serviceLinks,
  templateLinks,
}: {
  product: Product;
  consumptionRecords: any[];
  productConsumption: ReturnType<typeof useProductConsumption>['consumptionReport'][number] | null | undefined;
  appointments: any[];
  serviceLinks: any[];
  templateLinks: any[];
}) {
  const unitLabel = PRODUCT_UNITS.find(u => u.value === product.unit)?.label || product.unit;

  const productRecords = useMemo(
    () => (consumptionRecords || []).filter((r: any) => r.product_id === product.id),
    [consumptionRecords, product.id]
  );

  // Eventos de consumo derivados: usa registros explícitos quando existem,
  // senão calcula a partir dos atendimentos concluídos vinculados ao produto.
  const consumptionEvents = useMemo(() => {
    if (productRecords.length > 0) {
      return productRecords
        .map((r: any) => ({
          date: r.appointment?.start_time ? parseISO(r.appointment.start_time) : null,
          qty: Number(r.quantity_used) || 0,
        }))
        .filter((e: any) => e.date instanceof Date && !isNaN(e.date.getTime()));
    }

    // Fallback automático: deriva consumo de atendimentos concluídos
    const serviceQtyMap = new Map<string, number>();
    for (const sp of serviceLinks || []) {
      serviceQtyMap.set(sp.service_id, Number(sp.quantity_per_use) || 0);
    }
    const templateQtyMap = new Map<string, number>();
    for (const tp of templateLinks || []) {
      templateQtyMap.set(tp.package_template_id, Number(tp.quantity_per_use) || 0);
    }

    const events: { date: Date; qty: number }[] = [];
    for (const apt of appointments || []) {
      if (apt.status !== 'completed') continue;
      let qty = 0;
      if (apt.service_id && serviceQtyMap.has(apt.service_id)) {
        qty = serviceQtyMap.get(apt.service_id) || 0;
      } else if (apt.package_template_id && templateQtyMap.has(apt.package_template_id)) {
        qty = templateQtyMap.get(apt.package_template_id) || 0;
      }
      if (qty <= 0) continue;
      const d = apt.start_time ? new Date(apt.start_time) : null;
      if (!d || isNaN(d.getTime())) continue;
      events.push({ date: d, qty });
    }
    return events;
  }, [productRecords, appointments, serviceLinks, templateLinks]);

  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const semesterStart = subMonths(now, 6);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const acc = { today: 0, week: 0, month: 0, semester: 0, year: 0 };
    for (const e of consumptionEvents) {
      const d = e.date;
      const qty = e.qty;
      const dStr = format(d, 'yyyy-MM-dd');
      if (dStr === todayStr) acc.today += qty;
      if (d >= weekStart && d <= weekEnd) acc.week += qty;
      if (d >= monthStart && d <= monthEnd) acc.month += qty;
      if (d >= semesterStart) acc.semester += qty;
      if (d >= yearStart) acc.year += qty;
    }
    return acc;
  }, [consumptionEvents]);

  const history = useMemo(() => {
    return [...productRecords]
      .filter((r: any) => r.appointment?.start_time)
      .sort((a: any, b: any) => new Date(b.appointment.start_time).getTime() - new Date(a.appointment.start_time).getTime())
      .slice(0, 50);
  }, [productRecords]);


  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: 'Hoje', value: stats.today },
          { label: 'Semana', value: stats.week },
          { label: 'Mês', value: stats.month },
          { label: 'Semestre', value: stats.semester },
          { label: 'Ano', value: stats.year },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-lg border bg-card text-center">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-lg font-bold">{s.value.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground">{unitLabel}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          O consumo é calculado automaticamente a partir dos atendimentos concluídos
          que utilizam este produto (via vínculo com serviços ou pacotes).
        </p>
      </div>

      {productConsumption && (
        <>
          <h4 className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Resumo Automático
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-lg font-bold">{productConsumption.total_quantity.toFixed(2)} {unitLabel}</div>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-xs text-muted-foreground">Atendimentos</div>
              <div className="text-lg font-bold">{productConsumption.appointment_count}</div>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-xs text-muted-foreground">Média/Atend.</div>
              <div className="text-lg font-bold">{productConsumption.avg_per_appointment.toFixed(3)} {unitLabel}</div>
            </div>
          </div>
        </>
      )}

      {history.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Serviço</TableHead>
              <TableHead>Quantidade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">
                  {format(parseISO(r.appointment.start_time), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </TableCell>
                <TableCell className="text-sm">
                  {r.appointment?.service?.name || '-'}
                </TableCell>
                <TableCell className="text-sm font-medium tabular-nums">
                  {Number(r.quantity_used).toFixed(2)} {unitLabel}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="text-center py-6 text-muted-foreground">
          <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum consumo automático registrado.</p>
          <p className="text-xs mt-1">
            Vincule este produto a serviços/pacotes e conclua atendimentos para ver o consumo aqui.
          </p>
        </div>
      )}
    </div>
  );
}

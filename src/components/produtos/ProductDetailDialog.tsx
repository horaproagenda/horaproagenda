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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  Info,
  PlayCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SafeDateInput } from '@/components/ui/safe-date-input';
import { convertQuantity, areUnitsCrossFamily } from '@/lib/productStock';
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

/**
 * Retorna a nomenclatura correta para o "recipiente/embalagem em uso"
 * de acordo com a unidade de medida cadastrada do produto. Evita chamar
 * de "recipiente de 500 ml" um produto sólido contabilizado em unidades.
 */
function getContainerTerms(unit: ProductUnit | string | null | undefined) {
  const u = (unit || '').toString().toLowerCase();
  if (u === 'un') {
    return {
      noun: 'unidade em uso',
      nounShort: 'unidade',
      exampleHint: 'Ex.: 1 caixa, 1 pacote, 1 frasco.',
      startLabel: 'Início do uso da unidade',
      endLabel: 'Término do uso da unidade',
      quantityLabel: 'Quantidade por unidade em uso',
      refillTitle: 'Nova unidade iniciada?',
      refillDesc: 'iniciou uma nova unidade',
      calcOption: 'Não sei — calcular por unidade / atendimentos',
    };
  }
  if (u === 'ml' || u === 'l') {
    return {
      noun: 'recipiente em uso',
      nounShort: 'recipiente',
      exampleHint: 'Ex.: 500 ml do recipiente em uso.',
      startLabel: 'Início do uso do recipiente',
      endLabel: 'Término do uso do recipiente',
      quantityLabel: 'Quantidade no recipiente em uso',
      refillTitle: 'Recipiente reabastecido?',
      refillDesc: 'reabasteceu o recipiente',
      calcOption: 'Não sei — calcular por recipiente / atendimentos',
    };
  }
  if (u === 'g' || u === 'kg') {
    return {
      noun: 'embalagem em uso',
      nounShort: 'embalagem',
      exampleHint: 'Ex.: 500 g da embalagem em uso.',
      startLabel: 'Início do uso da embalagem',
      endLabel: 'Término do uso da embalagem',
      quantityLabel: 'Quantidade na embalagem em uso',
      refillTitle: 'Embalagem reposta?',
      refillDesc: 'iniciou uma nova embalagem',
      calcOption: 'Não sei — calcular por embalagem / atendimentos',
    };
  }
  return {
    noun: 'embalagem em uso',
    nounShort: 'embalagem',
    exampleHint: 'Refere-se ao volume/quantidade da embalagem em uso, não ao total comprado.',
    startLabel: 'Início do uso da embalagem',
    endLabel: 'Término do uso da embalagem',
    quantityLabel: 'Quantidade na embalagem em uso',
    refillTitle: 'Embalagem reposta?',
    refillDesc: 'iniciou uma nova embalagem',
    calcOption: 'Não sei — calcular por embalagem / atendimentos',
  };
}


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
  const { serviceProducts, updateServiceProduct } = useServiceProducts();
  const { templateProducts, createTemplateProduct, updateTemplateProduct, deleteTemplateProduct } = usePackageTemplateProducts();
  const { consumptionReport, consumptionRecords } = useProductConsumption();

  const { appointments } = useAppointments();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('receptionist');



  const [isEditing, setIsEditing] = useState(false);
  const [showCalcDetails, setShowCalcDetails] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [serviceLinkSearch, setServiceLinkSearch] = useState('');
  const [templateLinkSearch, setTemplateLinkSearch] = useState('');
  const [quantityPerUse, setQuantityPerUse] = useState(0);
  const [quantityPerUseUnit, setQuantityPerUseUnit] = useState<ProductUnit>('un');
  // estimatedAppointments removido do formulário — agora é calculado automaticamente ao preencher o término do uso
  const [containerAmount, setContainerAmount] = useState(1);
  const [containerUnit, setContainerUnit] = useState<ProductUnit>('ml');
  const [knowsQuantity, setKnowsQuantity] = useState<'yes' | 'no'>('yes');
  const [isSaving, setIsSaving] = useState(false);

  // Confirmation dialogs for cycle lifecycle (container-based: refers to the recipient, not the total purchased qty)
  const [pendingStartDate, setPendingStartDate] = useState<string | null>(null);
  const [pendingEndDate, setPendingEndDate] = useState<string | null>(null);
  const [pendingRefill, setPendingRefill] = useState<{ remainingStock: number } | null>(null);
  
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

  // Produto "a granel": sem vínculo a serviços/pacotes E sem nenhum vínculo com recipiente.
  // Nesse caso o ciclo refere-se à quantidade total comprada, não a um recipiente.
  const isBulkProduct = useMemo(() => {
    const hasServiceLink = productServiceLinks.length > 0;
    const hasTemplateLink = productTemplateLinks.length > 0;
    const hasContainerLink =
      productServiceLinks.some(sp => sp.tracking_method === 'estimated' && Number(sp.container_amount || 0) > 0) ||
      productTemplateLinks.some((tp: any) => tp.tracking_method === 'estimated' && Number(tp.container_amount || 0) > 0);
    return !hasServiceLink && !hasTemplateLink && !hasContainerLink;
  }, [productServiceLinks, productTemplateLinks]);

  // Nomenclatura adaptada à unidade cadastrada (sólido = "unidade", líquido = "recipiente", etc.)
  const containerTerms = useMemo(
    () => getContainerTerms(product?.unit as any),
    [product?.unit],
  );




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

  // Cycle summary: tracks current cycle (days & appointments) and previous cycle benchmark.
  // Funciona para TODOS os produtos — com ou sem vínculo a serviços. Quando o produto não
  // tem vínculos, contabiliza todos os atendimentos concluídos no período como sinal de uso.
  const cycleSummary = useMemo(() => {
    if (!product) return null;

    const hasServiceLinks = productServiceLinks.length > 0;
    const matchesProduct = (a: any) =>
      !hasServiceLinks || productServiceLinks.some(sp => sp.service_id === a.service_id);

    const finishedCycles = productPurchases
      .filter(p => p.started_using_at && p.finished_at)
      .map(p => {
        const start = parseISO(p.started_using_at! + 'T00:00:00');
        const end = parseISO(p.finished_at! + 'T23:59:59');
        const days = Math.max(1, differenceInDays(end, start) + 1);
        const apts = appointments.filter(a => {
          if (a.status !== 'completed') return false;
          const t = new Date(a.start_time);
          return t >= start && t <= end && matchesProduct(a);
        }).length;
        const qtyConsumed = Number(p.quantity || 0);
        return { purchase: p, days, appointments: apts, qtyConsumed };
      });

    const lastCycle = finishedCycles[0] || null;

    const activePurchase = productPurchases.find(p => p.started_using_at && !p.finished_at) || null;

    // Fonte de verdade do ciclo ativo: a compra ativa. O campo
    // product.started_using_at é apenas um cache denormalizado que pode ficar
    // defasado quando uma nova compra é promovida fora do fluxo principal
    // (edição manual de compra, encerramento + nova compra etc.). Sempre que
    // houver uma compra ativa, usamos a data dela.
    const effectiveCycleStart =
      activePurchase?.started_using_at
      || (product.finished_at ? null : product.started_using_at)
      || null;
    const isCycleActive = !!activePurchase || (!!product.started_using_at && !product.finished_at);

    let currentDays = 0;
    let currentAppointments = 0;
    let currentConsumed = 0;
    let initialQty = 0;
    if (effectiveCycleStart && isCycleActive) {
      const start = parseISO(effectiveCycleStart + 'T00:00:00');
      currentDays = Math.max(0, differenceInDays(new Date(), start));
      currentAppointments = appointments.filter(a => {
        if (a.status !== 'completed') return false;
        const t = new Date(a.start_time);
        return t >= start && matchesProduct(a);
      }).length;
      initialQty = Number(activePurchase?.quantity ?? product.quantity_purchased ?? 0);
      currentConsumed = Math.max(0, initialQty - Number(product.current_stock || 0));
    }

    const nextPurchase = productPurchases.find(p => !p.started_using_at && !p.finished_at) || null;

    let runningOutAlert: string | null = null;
    if (lastCycle && isCycleActive && effectiveCycleStart) {
      const pctDays = currentDays / lastCycle.days;
      const pctApts = lastCycle.appointments > 0 ? currentAppointments / lastCycle.appointments : 0;
      const pctQty = lastCycle.qtyConsumed > 0 ? currentConsumed / lastCycle.qtyConsumed : 0;
      const pct = Math.max(pctDays, pctApts, pctQty);
      if (pct >= 0.8) {
        runningOutAlert = `Atenção: já atingiu ${Math.round(pct * 100)}% do ciclo anterior (${lastCycle.days}d / ${lastCycle.appointments} atend.). Produto pode estar acabando.`;
      }
    }

    // Detecta necessidade de iniciar manualmente: produto tem estoque, mas não está com ciclo ativo.
    const stock = Number(product.current_stock || 0);
    const cycleClosedWithStock =
      !activePurchase && !!product.started_using_at && !!product.finished_at && stock > 0;
    const neverStartedWithHistory =
      !activePurchase &&
      !product.started_using_at &&
      stock > 0 &&
      (finishedCycles.length > 0 || productPurchases.length > 0);
    const needsManualStart = cycleClosedWithStock || neverStartedWithHistory;

    // Inconsistências: estoque negativo, ou consumo registrado ≠ variação do estoque
    const inconsistencies: string[] = [];
    if (stock < 0) {
      inconsistencies.push(`Estoque negativo (${stock}). Verifique compras e baixas.`);
    }
    if (activePurchase && initialQty > 0) {
      const expectedRemaining = initialQty - currentConsumed;
      if (Math.abs(expectedRemaining - stock) > 0.001) {
        inconsistencies.push(
          `Estoque (${stock}) diverge do esperado (${expectedRemaining.toFixed(2)}) com base na compra ativa de ${initialQty}.`
        );
      }
    }
    if (productPurchases.some(p => !p.started_using_at && !p.finished_at) && product.started_using_at) {
      // já há ciclo ativo, mas existe compra pendente — apenas informativo, não inconsistência
    }

    return {
      finishedCycles,
      lastCycle,
      currentDays,
      currentAppointments,
      currentConsumed,
      initialQty,
      activePurchase,
      nextPurchase,
      runningOutAlert,
      needsManualStart,
      inconsistencies,
      hasServiceLinks,
      effectiveCycleStart,
      isCycleActive,
    };
  }, [product, productPurchases, appointments, productServiceLinks]);

  // === Cycle lifecycle helpers (container-based) ===
  // O ciclo é sempre relativo ao RECIPIENTE em uso (ex.: 500 ml), e não ao total
  // comprado (ex.: 5 L). O início/término do uso registra apenas a janela em que
  // o conteúdo do recipiente atual foi consumido.

  const endCyclePreview = useMemo(() => {
    if (!product || !pendingEndDate) return null;
    const activePurchase =
      productPurchases.find(p => p.started_using_at && !p.finished_at)
      || productPurchases.find(p => !p.finished_at)
      || null;
    const cycleStart = activePurchase?.started_using_at || product.started_using_at;
    const startDate = cycleStart ? parseISO(cycleStart + 'T00:00:00') : null;
    const endDate = parseISO(pendingEndDate + 'T23:59:59');
    const days = startDate ? Math.max(1, differenceInDays(endDate, startDate) + 1) : 0;
    const linkedServiceIds = productServiceLinks.map(sp => sp.service_id);
    const hasLinks = linkedServiceIds.length > 0;
    const cycleApts = appointments.filter(a => {
      if (a.status !== 'completed') return false;
      if (hasLinks && !linkedServiceIds.includes(a.service_id)) return false;
      const t = new Date(a.start_time);
      if (startDate && t < startDate) return false;
      return t <= endDate;
    });

    // Detecta se algum vínculo usa recipiente (modo estimated com container_amount)
    const hasContainerLink = productServiceLinks.some(
      sp => sp.tracking_method === 'estimated' && Number(sp.container_amount || 0) > 0,
    ) || productTemplateLinks.some(
      (tp: any) => tp.tracking_method === 'estimated' && Number(tp.container_amount || 0) > 0,
    );

    // Modo "produto a granel": sem vínculo com serviço/pacote E sem recipiente.
    // Toda a quantidade da compra ativa (ou o estoque atual) é o consumo do ciclo.
    const isBulk = !hasLinks && !hasContainerLink;

    // Quantidade que será deduzida do estoque total (mesma lógica do handler real)
    const containerDeductions = new Map<string, number>();
    let exactDeduction = 0;
    let usedCrossFamilyConversion = false;
    for (const sp of productServiceLinks) {
      const aptsThis = cycleApts.filter(a => a.service_id === sp.service_id).length;
      if (aptsThis <= 0) continue;
      if (sp.tracking_method === 'estimated') {
        const fromUnit = sp.container_unit || product.unit;
        if (areUnitsCrossFamily(fromUnit, product.unit)) {
          usedCrossFamilyConversion = true;
        }
        const inStockUnit = convertQuantity(
          Number(sp.container_amount || 0),
          fromUnit,
          product.unit,
        ) ?? Number(sp.container_amount || 0);
        const key = `${sp.container_amount}-${sp.container_unit}`;
        if (!containerDeductions.has(key) || (containerDeductions.get(key) || 0) < inStockUnit) {
          containerDeductions.set(key, inStockUnit);
        }
      } else {
        exactDeduction += aptsThis * Number(sp.quantity_per_use || 0);
      }
    }
    const estimatedDeduction = Array.from(containerDeductions.values()).reduce((s, x) => s + x, 0);
    const stockBefore = Number(product.current_stock || 0);
    let totalDeduction = estimatedDeduction + exactDeduction;

    if (isBulk) {
      // Produto sem vínculo e sem recipiente: consome a quantidade total da compra ativa
      // (papel toalha, álcool a granel, etc.). Se não houver compra ativa registrada,
      // usa o estoque atual como referência.
      const bulkQty = Number(activePurchase?.quantity ?? product.quantity_purchased ?? stockBefore);
      totalDeduction = Math.max(0, Math.min(stockBefore, bulkQty));
    }

    const remainingStock = Math.max(0, stockBefore - totalDeduction);
    return {
      days,
      appointments: cycleApts.length,
      totalDeduction,
      stockBefore,
      remainingStock,
      hasLinks,
      hasContainerLink,
      isBulk,
      activePurchase,
      cycleApts,
      usedCrossFamilyConversion,
    };
  }, [product, pendingEndDate, productPurchases, productServiceLinks, productTemplateLinks, appointments]);

  const runStartCycle = async (dateStr: string) => {
    if (!product) return;
    const pending = productPurchases.find(p => !p.started_using_at && !p.finished_at);
    if (pending && onUpdatePurchase) {
      await onUpdatePurchase({ id: pending.id, started_using_at: dateStr });
    }
    await onUpdateProduct({
      id: product.id,
      started_using_at: dateStr,
      finished_at: null as any,
    });
    toast.success('Início do uso registrado em ' + format(parseISO(dateStr + 'T00:00:00'), 'dd/MM/yyyy'));
  };

  const runEndCycle = async (dateStr: string) => {
    if (!product || !endCyclePreview) return;
    const { activePurchase, cycleApts, totalDeduction } = endCyclePreview;
    // Persiste médias para vínculos estimados que tiveram uso
    for (const sp of productServiceLinks) {
      if (sp.tracking_method !== 'estimated') continue;
      const aptsThis = cycleApts.filter(a => a.service_id === sp.service_id).length;
      const containerInStockUnit = convertQuantity(
        Number(sp.container_amount || 0),
        sp.container_unit || product.unit,
        product.unit,
      ) ?? Number(sp.container_amount || 0);
      if (aptsThis > 0 && containerInStockUnit > 0) {
        const avg = containerInStockUnit / aptsThis;
        await updateServiceProduct.mutateAsync({
          id: sp.id,
          quantity_per_use: avg,
          estimated_appointments: aptsThis,
        } as any);
      }
    }

    const newStock = Math.max(0, (Number(product.current_stock) || 0) - totalDeduction);

    // Fecha a compra ativa com o término informado
    if (activePurchase && onUpdatePurchase) {
      await onUpdatePurchase({
        id: activePurchase.id,
        finished_at: dateStr,
        started_using_at:
          activePurchase.started_using_at
          || product.started_using_at
          || activePurchase.purchase_date
          || dateStr,
      });
    }

    // Atualiza estoque e fecha o ciclo do produto (sem auto-iniciar novo).
    await onUpdateProduct({
      id: product.id,
      finished_at: dateStr,
      current_stock: newStock,
    });

    toast.success(
      `Ciclo encerrado: ${cycleApts.length} atend., ${totalDeduction.toFixed(2)} ${PRODUCT_UNITS.find(u => u.value === product.unit)?.label} descontado(s) do estoque.`,
    );

    // Se ainda há estoque, oferece reabastecer o recipiente / iniciar novo ciclo
    if (newStock > 0) {
      setPendingRefill({ remainingStock: newStock });
    }
  };






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
    if (!product || selectedServiceIds.length === 0) return;

    const useEstimated = knowsQuantity === 'no';

    for (const serviceId of selectedServiceIds) {
      if (useEstimated) {
        // Modo estimado: usuário só informa o recipiente em uso.
        // A média por atendimento será calculada automaticamente ao preencher o término do uso.
        await onCreateServiceLink({
          service_id: serviceId,
          product_id: product.id,
          quantity_per_use: 0,
          estimated_appointments: null,
          container_amount: containerAmount,
          container_unit: containerUnit,
          tracking_method: 'estimated',
          notes: null,
        });
      } else {
        const normalizedQty = convertQuantity(quantityPerUse, quantityPerUseUnit, product.unit) ?? quantityPerUse;
        await onCreateServiceLink({
          service_id: serviceId,
          product_id: product.id,
          quantity_per_use: normalizedQty,
          tracking_method: 'exact',
          notes: null,
        });
      }
    }

    setSelectedServiceIds([]);
    setServiceLinkSearch('');
    setQuantityPerUse(0);
    setContainerAmount(1);
    setKnowsQuantity('yes');
  };

  const handleAddTemplateLink = async () => {
    if (!product || selectedTemplateIds.length === 0) return;

    const useEstimated = knowsQuantity === 'no';

    for (const templateId of selectedTemplateIds) {
      if (useEstimated) {
        await createTemplateProduct.mutateAsync({
          template_id: templateId,
          product_id: product.id,
          quantity_per_use: 0,
          estimated_appointments: null,
          container_amount: containerAmount,
          container_unit: containerUnit,
          tracking_method: 'estimated',
          notes: null,
        });
      } else {
        const normalizedQty = convertQuantity(quantityPerUse, quantityPerUseUnit, product.unit) ?? quantityPerUse;
        await createTemplateProduct.mutateAsync({
          template_id: templateId,
          product_id: product.id,
          quantity_per_use: normalizedQty,
          tracking_method: 'exact',
          notes: null,
        });
      }
    }

    setSelectedTemplateIds([]);
    setTemplateLinkSearch('');
    setQuantityPerUse(0);
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
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-xl">{product.name}</DialogTitle>
              <DialogDescription>
                {product.brand && <span className="mr-2">{product.brand}</span>}
                {product.category && <Badge variant="outline">{product.category}</Badge>}
              </DialogDescription>
            </div>
            {canEdit && !isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartEdit}
                className="mr-8"
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar informações
              </Button>
            )}
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
                          {cycleSummary.inconsistencies.length > 0 && (
                            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-2.5 text-xs text-red-900 dark:text-red-100 space-y-1">
                              <div className="font-medium flex items-center gap-1">
                                <AlertCircle className="h-3.5 w-3.5" /> Inconsistência detectada
                              </div>
                              {cycleSummary.inconsistencies.map((msg, i) => (
                                <div key={i}>• {msg}</div>
                              ))}
                            </div>
                          )}

                          {cycleSummary.needsManualStart && canEdit && (
                            <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-2.5 text-xs text-blue-900 dark:text-blue-100 space-y-2">
                              <div className="flex items-start gap-1.5">
                                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                <span>
                                  Este produto tem <strong>{Number(product.current_stock)} {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}</strong> em estoque mas <strong>nenhum ciclo ativo</strong>.
                                  {product.started_using_at && product.finished_at
                                    ? ` O ciclo anterior foi encerrado em ${format(parseISO(product.finished_at + 'T00:00:00'), 'dd/MM/yyyy')}. Se ${containerTerms.refillDesc}, registre o novo início para retomar a contagem.`
                                    : ' Os atendimentos não estão sendo contabilizados. Informe o início do uso para retomar a contagem.'}

                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setPendingStartDate(format(new Date(), 'yyyy-MM-dd'));
                                }}
                              >
                                <PlayCircle className="h-3.5 w-3.5 mr-1" />
                                Iniciar uso hoje
                              </Button>
                            </div>
                          )}

                          {cycleSummary.runningOutAlert && (
                            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs text-amber-900 dark:text-amber-100">
                              ⚠️ {cycleSummary.runningOutAlert}
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-lg border bg-muted/30 p-2.5">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ciclo atual</div>
                              <div className="text-xs tabular-nums mt-1">
                                {cycleSummary.isCycleActive
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

                          {/* Painel "Como esse cálculo foi feito?" */}
                          <button
                            type="button"
                            onClick={() => setShowCalcDetails(v => !v)}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showCalcDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            Como esse cálculo foi feito?
                          </button>
                          {showCalcDetails && (
                            <div className="rounded-lg border bg-muted/20 p-2.5 text-[11px] space-y-1.5 leading-relaxed">
                              <div className="font-medium text-foreground">Regras aplicadas:</div>
                              <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                                <li>
                                  <strong>Dias:</strong> diferença entre hoje e a data de início do uso
                                  {cycleSummary.effectiveCycleStart && (
                                    <> ({format(parseISO(cycleSummary.effectiveCycleStart + 'T00:00:00'), 'dd/MM/yyyy')}) → {cycleSummary.currentDays} dia(s)</>
                                  )}.
                                </li>
                                {!isBulkProduct && (
                                  <li>
                                    <strong>Atendimentos:</strong> agendamentos concluídos no período de uso
                                    {cycleSummary.hasServiceLinks
                                      ? ' que utilizam algum dos serviços vinculados a este produto'
                                      : ' (todos os atendimentos concluídos, pois o produto não está vinculado a serviços específicos)'}
                                    → {cycleSummary.currentAppointments} atend.
                                  </li>
                                )}
                                {isBulkProduct && (
                                  <li>
                                    <strong>Modo a granel:</strong> este produto não tem vínculo com serviços, pacotes nem recipiente.
                                    Ao encerrar o ciclo, será descontada a <strong>quantidade total comprada</strong> do estoque.
                                  </li>
                                )}
                                <li>
                                  <strong>Estoque consumido:</strong> quantidade da compra ativa ({cycleSummary.initialQty}) − estoque atual ({Number(product.current_stock || 0)}) = {cycleSummary.currentConsumed.toFixed(2)} {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}.
                                </li>
                                <li>
                                  <strong>Alerta de fim de ciclo:</strong> dispara quando dias, atendimentos ou consumo atingem ≥ 80% do ciclo anterior.
                                </li>
                                <li>
                                  <strong>Ciclo anterior (referência):</strong>{' '}
                                  {cycleSummary.lastCycle
                                    ? `${cycleSummary.lastCycle.days}d, ${cycleSummary.lastCycle.appointments} atend., ${cycleSummary.lastCycle.qtyConsumed} ${PRODUCT_UNITS.find(u => u.value === product.unit)?.label}`
                                    : 'sem histórico ainda.'}
                                </li>
                              </ul>
                            </div>
                          )}
                        </div>
                      )}



                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          {isBulkProduct ? 'Início do uso do pacote' : containerTerms.startLabel}
                        </Label>
                        {canEdit ? (
                          <SafeDateInput
                            value={cycleSummary?.effectiveCycleStart || ''}
                            onCommit={(v) => {
                              if (!v) {
                                onUpdateProduct({
                                  id: product.id,
                                  started_using_at: null as any,
                                });
                                return;
                              }
                              setPendingStartDate(v);
                            }}
                            className="h-9"
                          />
                        ) : (
                          <span className="text-sm">
                            {cycleSummary?.effectiveCycleStart
                              ? format(parseISO(cycleSummary.effectiveCycleStart), 'dd/MM/yyyy', { locale: ptBR })
                              : 'Não iniciado'}
                          </span>
                        )}
                        <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
                          {isBulkProduct
                            ? 'Data em que esta compra começou a ser usada. O ciclo considera a quantidade total comprada.'
                            : `Refere-se à ${containerTerms.noun}, não ao total comprado. ${containerTerms.exampleHint}`}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          {isBulkProduct ? 'Término do uso do pacote' : containerTerms.endLabel}
                        </Label>
                        {canEdit ? (
                          <SafeDateInput
                            value={product.finished_at || ''}
                            onCommit={async (v) => {
                              if (!v) {
                                await onUpdateProduct({ id: product.id, finished_at: null as any });
                                return;
                              }
                              setPendingEndDate(v);
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
                        <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
                          {isBulkProduct
                            ? 'Encerra este ciclo de consumo. A quantidade total da compra será baixada do estoque.'
                            : `Encerra o ciclo da ${containerTerms.nounShort} atual. Atendimentos do período serão contabilizados.`}
                        </p>

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
                                    // Mantém product.started_using_at / finished_at em sincronia
                                    // com a compra ativa, evitando que o cache do produto fique
                                    // defasado (ex.: alerta "ciclo anterior" continuar mostrando
                                    // a data antiga após promover uma nova compra).
                                    const startedAt = purchaseEditForm.started_using_at || null;
                                    const finishedAt = purchaseEditForm.finished_at || null;
                                    if (startedAt && !finishedAt) {
                                      await onUpdateProduct({
                                        id: product!.id,
                                        started_using_at: startedAt,
                                        finished_at: null as any,
                                      });
                                    } else if (
                                      finishedAt &&
                                      product?.started_using_at === purchase.started_using_at
                                    ) {
                                      await onUpdateProduct({
                                        id: product!.id,
                                        finished_at: finishedAt,
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
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          placeholder="Buscar serviço..."
                          value={serviceLinkSearch}
                          onChange={(e) => setServiceLinkSearch(e.target.value)}
                          className="h-9 flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs h-9"
                          onClick={() => {
                            const filtered = availableServicesToLink.filter(s =>
                              !serviceLinkSearch ||
                              s.name.toLowerCase().includes(serviceLinkSearch.toLowerCase()) ||
                              (s.category || '').toLowerCase().includes(serviceLinkSearch.toLowerCase())
                            );
                            const allIds = filtered.map(s => s.id);
                            const allSelected = allIds.every(id => selectedServiceIds.includes(id));
                            setSelectedServiceIds(allSelected
                              ? selectedServiceIds.filter(id => !allIds.includes(id))
                              : Array.from(new Set([...selectedServiceIds, ...allIds]))
                            );
                          }}
                        >
                          Selecionar todos
                        </Button>
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded-md border bg-background p-2 space-y-1">
                        {availableServicesToLink
                          .filter(s =>
                            !serviceLinkSearch ||
                            s.name.toLowerCase().includes(serviceLinkSearch.toLowerCase()) ||
                            (s.category || '').toLowerCase().includes(serviceLinkSearch.toLowerCase())
                          )
                          .map(s => {
                            const checked = selectedServiceIds.includes(s.id);
                            return (
                              <label
                                key={s.id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 cursor-pointer text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    setSelectedServiceIds(e.target.checked
                                      ? [...selectedServiceIds, s.id]
                                      : selectedServiceIds.filter(id => id !== s.id)
                                    );
                                  }}
                                  className="h-3.5 w-3.5"
                                />
                                <span className="flex-1 truncate">{s.name}</span>
                                {s.category && (
                                  <span className="text-muted-foreground text-[10px]">{s.category}</span>
                                )}
                              </label>
                            );
                          })}
                        {availableServicesToLink.length === 0 && (
                          <div className="text-xs text-muted-foreground text-center py-3">
                            Nenhum serviço disponível para vincular.
                          </div>
                        )}
                      </div>
                      {selectedServiceIds.length > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          {selectedServiceIds.length} serviço(s) selecionado(s)
                        </p>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        Você sabe a quantidade usada por atendimento?
                      </Label>
                      <Select value={knowsQuantity} onValueChange={(v: 'yes' | 'no') => setKnowsQuantity(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Sim, sei a quantidade exata</SelectItem>
                          <SelectItem value="no">{containerTerms.calcOption}</SelectItem>

                        </SelectContent>
                      </Select>
                    </div>

                    {knowsQuantity === 'no' ? (
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          {containerTerms.quantityLabel}

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
                          Ex: 500 mL de um galão de 5 L. A média por atendimento será calculada automaticamente quando você preencher o término do uso.
                        </p>
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
                  
                  <Button onClick={handleAddServiceLink} disabled={selectedServiceIds.length === 0} className="w-full">
                    <Link2 className="h-4 w-4 mr-1" />
                    Vincular Produto {selectedServiceIds.length > 1 ? `a ${selectedServiceIds.length} Serviços` : 'ao Serviço'}
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
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Input
                            placeholder="Buscar pacote..."
                            value={templateLinkSearch}
                            onChange={(e) => setTemplateLinkSearch(e.target.value)}
                            className="h-9 flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs h-9"
                            onClick={() => {
                              const filtered = availableTemplatesToLink.filter(t =>
                                !templateLinkSearch ||
                                t.name.toLowerCase().includes(templateLinkSearch.toLowerCase())
                              );
                              const allIds = filtered.map(t => t.id);
                              const allSelected = allIds.every(id => selectedTemplateIds.includes(id));
                              setSelectedTemplateIds(allSelected
                                ? selectedTemplateIds.filter(id => !allIds.includes(id))
                                : Array.from(new Set([...selectedTemplateIds, ...allIds]))
                              );
                            }}
                          >
                            Selecionar todos
                          </Button>
                        </div>
                        <div className="max-h-48 overflow-y-auto rounded-md border bg-background p-2 space-y-1">
                          {availableTemplatesToLink
                            .filter(t =>
                              !templateLinkSearch ||
                              t.name.toLowerCase().includes(templateLinkSearch.toLowerCase())
                            )
                            .map(t => {
                              const checked = selectedTemplateIds.includes(t.id);
                              return (
                                <label
                                  key={t.id}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 cursor-pointer text-xs"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      setSelectedTemplateIds(e.target.checked
                                        ? [...selectedTemplateIds, t.id]
                                        : selectedTemplateIds.filter(id => id !== t.id)
                                      );
                                    }}
                                    className="h-3.5 w-3.5"
                                  />
                                  <span className="flex-1 truncate">{t.name}</span>
                                  <span className="text-muted-foreground text-[10px]">{t.total_sessions} sessões</span>
                                </label>
                              );
                            })}
                        </div>
                        {selectedTemplateIds.length > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            {selectedTemplateIds.length} pacote(s) selecionado(s)
                          </p>
                        )}
                      </div>
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
                              <SelectItem value="no">{containerTerms.calcOption}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {knowsQuantity === 'no' ? (
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">
                              {containerTerms.quantityLabel}

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
                              A média por sessão será calculada automaticamente quando você preencher o término do uso.
                            </p>
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
                    <Button onClick={handleAddTemplateLink} disabled={selectedTemplateIds.length === 0} className="w-full">
                      <Gift className="h-4 w-4 mr-1" />
                      Vincular Produto {selectedTemplateIds.length > 1 ? `a ${selectedTemplateIds.length} Pacotes` : 'ao Pacote'}
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

    {/* Confirmação: registrar INÍCIO do uso do recipiente */}
    <AlertDialog open={!!pendingStartDate} onOpenChange={(o) => { if (!o) setPendingStartDate(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isBulkProduct ? 'Registrar início do uso' : `Registrar início do uso da ${containerTerms.nounShort}`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Você está iniciando um <strong>novo ciclo</strong> em{' '}
                <strong>{pendingStartDate ? format(parseISO(pendingStartDate + 'T00:00:00'), 'dd/MM/yyyy') : ''}</strong>.
              </p>
              {isBulkProduct ? (
                <p>
                  Será contabilizada a <strong>quantidade total comprada</strong> deste produto no ciclo,
                  já que ele não tem vínculo com serviços, pacotes ou recipientes.
                </p>
              ) : (
                <p>
                  Será contabilizada a quantidade informada nos <strong>vínculos com serviços e pacotes</strong>{' '}
                  (o conteúdo da {containerTerms.nounShort} em uso) — <strong>não</strong> a quantidade total comprada do produto.
                </p>
              )}
              {product && (
                <p className="text-xs text-muted-foreground">
                  Estoque total atual: {Number(product.current_stock || 0)}{' '}
                  {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              const d = pendingStartDate!;
              setPendingStartDate(null);
              await runStartCycle(d);
            }}
          >
            <Save className="h-4 w-4 mr-1" /> Salvar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Confirmação: registrar TÉRMINO do uso do recipiente */}
    <AlertDialog open={!!pendingEndDate} onOpenChange={(o) => { if (!o) setPendingEndDate(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isBulkProduct ? 'Registrar término do uso' : `Registrar término do uso da ${containerTerms.nounShort}`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Será encerrado o ciclo em{' '}
                <strong>{pendingEndDate ? format(parseISO(pendingEndDate + 'T00:00:00'), 'dd/MM/yyyy') : ''}</strong>
                {isBulkProduct
                  ? <> com base na <strong>quantidade total comprada</strong> deste produto.</>
                  : <> com base nas quantidades informadas nos <strong>vínculos com serviços e pacotes</strong>.</>}
              </p>
              {endCyclePreview && product && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-1">
                  <div>Período: <strong>{endCyclePreview.days} dia(s)</strong></div>
                  {!endCyclePreview.isBulk && (
                    <div>Atendimentos no período: <strong>{endCyclePreview.appointments}</strong></div>
                  )}
                  <div>
                    Será descontado do estoque total:{' '}
                    <strong>
                      {endCyclePreview.totalDeduction.toFixed(2)}{' '}
                      {PRODUCT_UNITS.find(u => u.value === product.unit)?.label}
                    </strong>{' '}
                    (de {endCyclePreview.stockBefore} → {endCyclePreview.remainingStock}).
                  </div>
                  {endCyclePreview.usedCrossFamilyConversion && (
                    <div className="text-amber-700 dark:text-amber-300">
                      ⚠️ A unidade do recipiente difere da unidade do estoque (ex.: ml × kg).
                      Convertido assumindo densidade ≈ 1 g/ml (água/gel). Se o produto for
                      muito mais denso ou leve, ajuste a unidade do recipiente para casar
                      com o estoque.
                    </div>
                  )}
                  {!endCyclePreview.hasLinks && !endCyclePreview.isBulk && (
                    <div className="text-amber-700 dark:text-amber-300">
                      ⚠️ Nenhum vínculo com serviços/pacotes — nada será deduzido. Cadastre os vínculos antes.
                    </div>
                  )}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              const d = pendingEndDate!;
              setPendingEndDate(null);
              await runEndCycle(d);
            }}
          >
            <Save className="h-4 w-4 mr-1" /> Salvar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Confirmação: recipiente reabastecido → iniciar novo ciclo? */}
    <AlertDialog open={!!pendingRefill} onOpenChange={(o) => { if (!o) setPendingRefill(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{containerTerms.refillTitle}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Ainda há{' '}
                <strong>
                  {pendingRefill?.remainingStock}{' '}
                  {product ? PRODUCT_UNITS.find(u => u.value === product.unit)?.label : ''}
                </strong>{' '}
                no estoque total.
              </p>
              <p>
                Se você {containerTerms.refillDesc}, podemos iniciar um <strong>novo ciclo hoje</strong>{' '}
                automaticamente. Caso contrário, deixe o produto sem ciclo ativo e inicie manualmente quando repor.
              </p>

            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Apenas registrar fechamento</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              setPendingRefill(null);
              await runStartCycle(format(new Date(), 'yyyy-MM-dd'));
            }}
          >
            <PlayCircle className="h-4 w-4 mr-1" /> Iniciar novo ciclo hoje
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
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

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Package,
  Plus,
  Trash2,
  ShoppingCart,
  Droplets,
  Box,
  AlertTriangle,
  Search,
  Eye,
  Store,
  Building2,
  Filter,
  X,
  Upload,
  Download,
  WarehouseIcon,
} from 'lucide-react';
import { cn, normalizeBrazilianCurrency } from '@/lib/utils';
import { useProducts, useProductPurchases, type Product, type ProductType, type ProductUnit } from '@/hooks/useProducts';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useServices } from '@/hooks/useServices';
import { useServiceProducts } from '@/hooks/useServiceProducts';
import { useAppointments } from '@/hooks/useAppointments';
import { useAuth } from '@/contexts/AuthContext';
import { ManageSuppliersDialog } from '@/components/produtos/ManageSuppliersDialog';
import { ProductDetailDialog } from '@/components/produtos/ProductDetailDialog';
import { ServiceProductsDialog } from '@/components/produtos/ServiceProductsDialog';
import { toast } from 'sonner';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { exportToCSV } from '@/lib/exportUtils';

const PRODUCT_TYPES: { value: ProductType; label: string; icon: React.ReactNode }[] = [
  { value: 'solid', label: 'Sólido', icon: <Box className="h-4 w-4" /> },
  { value: 'liquid', label: 'Líquido', icon: <Droplets className="h-4 w-4" /> },
  { value: 'cream', label: 'Creme', icon: <Package className="h-4 w-4" /> },
  { value: 'gel', label: 'Gel', icon: <Droplets className="h-4 w-4" /> },
  { value: 'powder', label: 'Pó', icon: <Package className="h-4 w-4" /> },
  { value: 'other', label: 'Outro', icon: <Package className="h-4 w-4" /> },
];

const PRODUCT_UNITS: { value: ProductUnit; label: string }[] = [
  { value: 'un', label: 'Unidade(s)' },
  { value: 'ml', label: 'mL' },
  { value: 'l', label: 'L' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'other', label: 'Outros' },
];

const getTypeLabel = (type: ProductType) => PRODUCT_TYPES.find(t => t.value === type)?.label || type;
const getUnitLabel = (unit: ProductUnit) => PRODUCT_UNITS.find(u => u.value === unit)?.label || unit;

/** Map product_type to default unit */
function getDefaultUnit(type: ProductType): ProductUnit {
  switch (type) {
    case 'liquid': return 'ml';
    case 'cream':
    case 'gel': return 'g';
    case 'solid': return 'un';
    case 'powder': return 'g';
    default: return 'un';
  }
}

interface ProductFilters {
  type: string;
  status: string;
  forSale: string;
  lowStock: boolean;
}

const defaultFilters: ProductFilters = {
  type: 'all',
  status: 'all',
  forSale: 'all',
  lowStock: false,
};

export default function Produtos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { products, isLoading, createProduct, updateProduct, deleteProduct } = useProducts();
  const { purchases, createPurchase, updatePurchase, deletePurchase } = useProductPurchases();
  const { activeSuppliers } = useSuppliers();
  const { serviceProducts, createServiceProduct: createSPMutation } = useServiceProducts();
  const { appointments } = useAppointments();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('receptionist');
  const canDelete = hasRole('admin');

  const [filters, setFilters] = useLocalStorage<ProductFilters>('produtos-filters', defaultFilters);
  const [searchTerm, setSearchTerm] = useState('');

  // ── Dialog states ───────────────────────────────────────
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);

  // Product Detail
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // ── Novo Produto form ───────────────────────────────────
  const [productForm, setProductForm] = useState({
    name: '',
    brand: '',
    category: '',
    product_type: 'solid' as ProductType,
    supplier: '',
    supplier_id: '',
    is_for_sale: false,
    sale_price: 0,
  });

  // ── Adicionar no Estoque form ───────────────────────────
  const [stockForm, setStockForm] = useState({
    product_id: '',
    quantity: 0,
    unit_price: 0,
    total_price: 0,
    purchase_date: format(new Date(), 'yyyy-MM-dd'),
    expiry_date: '',
    skip_cash_transaction: false,
  });

  // ── Nova Compra form ────────────────────────────────────
  const [purchaseForm, setPurchaseForm] = useState({
    product_id: '',
    quantity: 0,
    unit_price: 0,
    total_price: 0,
    supplier: '',
    supplier_id: '',
    purchase_date: format(new Date(), 'yyyy-MM-dd'),
    expiry_date: '',
    is_for_sale: false,
    skip_cash_transaction: false,
  });

  // Open product from URL param
  useEffect(() => {
    const productId = searchParams.get('product');
    if (productId && products.length > 0) {
      const product = products.find(p => p.id === productId);
      if (product) {
        setSelectedProduct(product);
        setDetailDialogOpen(true);
        searchParams.delete('product');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, products, setSearchParams]);

  // ── Filtering ───────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!p.name.toLowerCase().includes(search) &&
            !p.brand?.toLowerCase().includes(search) &&
            !p.category?.toLowerCase().includes(search)) return false;
      }
      if (filters.type !== 'all' && p.product_type !== filters.type) return false;
      if (filters.status === 'active' && !p.is_active) return false;
      if (filters.status === 'inactive' && p.is_active) return false;
      if (filters.forSale === 'yes' && !p.is_for_sale) return false;
      if (filters.forSale === 'no' && p.is_for_sale) return false;
      if (filters.lowStock && !(p.current_stock <= (p.min_stock_alert || 0) && p.is_active)) return false;
      return true;
    });
  }, [products, searchTerm, filters]);

  const hasActiveFilters = filters.type !== 'all' || filters.status !== 'all' || filters.forSale !== 'all' || filters.lowStock;
  const activeFiltersCount = [filters.type !== 'all', filters.status !== 'all', filters.forSale !== 'all', filters.lowStock].filter(Boolean).length;
  const clearFilters = () => setFilters(defaultFilters);

  const lowStockProducts = useMemo(() => products.filter(p => p.current_stock <= (p.min_stock_alert || 0) && p.is_active), [products]);

  // Calculate appointments for a product
  const getProductAppointments = (productId: string) => {
    const linkedServices = serviceProducts.filter(sp => sp.product_id === productId);
    let total = 0;
    linkedServices.forEach(sp => {
      total += appointments.filter(apt => apt.service_id === sp.service_id && apt.status === 'completed').length;
    });
    return total;
  };

  // ── Handlers ────────────────────────────────────────────
  const handleProductSubmit = async () => {
    if (!productForm.name.trim()) return;
    try {
      const unit = getDefaultUnit(productForm.product_type);
      await createProduct.mutateAsync({
        name: productForm.name,
        description: null,
        brand: productForm.brand || null,
        category: productForm.category || null,
        product_type: productForm.product_type,
        unit,
        quantity_purchased: 0,
        unit_price: 0,
        total_price: 0,
        supplier: productForm.supplier || null,
        purchase_date: null,
        expiry_date: null,
        started_using_at: null,
        finished_at: null,
        current_stock: 0,
        min_stock_alert: null,
        notes: null,
        is_active: true,
        is_for_sale: productForm.is_for_sale,
        sale_price: normalizeBrazilianCurrency(productForm.sale_price),
      });
      setProductDialogOpen(false);
      setProductForm({ name: '', brand: '', category: '', product_type: 'solid', supplier: '', supplier_id: '', is_for_sale: false, sale_price: 0 });
    } catch {
      // toast already shown by mutation
    }
  };

  const handleStockSubmit = async () => {
    if (!stockForm.product_id || stockForm.quantity <= 0) return;
    try {
      const product = products.find(p => p.id === stockForm.product_id);
      if (!product) return;

      // Create purchase record
      await createPurchase.mutateAsync({
        product_id: stockForm.product_id,
        quantity: stockForm.quantity,
        unit_price: normalizeBrazilianCurrency(stockForm.unit_price),
        total_price: normalizeBrazilianCurrency(stockForm.total_price),
        supplier: product.supplier || null,
        purchase_date: stockForm.purchase_date,
        started_using_at: null,
        finished_at: null,
        notes: stockForm.expiry_date ? `Validade: ${stockForm.expiry_date}` : null,
        skip_cash_transaction: stockForm.skip_cash_transaction,
      });

      // Update product stock and expiry
      await updateProduct.mutateAsync({
        id: product.id,
        current_stock: product.current_stock + stockForm.quantity,
        expiry_date: stockForm.expiry_date || product.expiry_date,
      });

      setStockDialogOpen(false);
      setStockForm({ product_id: '', quantity: 0, unit_price: 0, total_price: 0, purchase_date: format(new Date(), 'yyyy-MM-dd'), expiry_date: '', skip_cash_transaction: false });
    } catch {
      // toast shown by mutation
    }
  };

  const handlePurchaseSubmit = async () => {
    if (!purchaseForm.product_id || purchaseForm.quantity <= 0) return;
    try {
      const product = products.find(p => p.id === purchaseForm.product_id);
      if (!product) return;

      await createPurchase.mutateAsync({
        product_id: purchaseForm.product_id,
        quantity: purchaseForm.quantity,
        unit_price: normalizeBrazilianCurrency(purchaseForm.unit_price),
        total_price: normalizeBrazilianCurrency(purchaseForm.total_price),
        supplier: purchaseForm.supplier || null,
        purchase_date: purchaseForm.purchase_date,
        started_using_at: null,
        finished_at: null,
        notes: purchaseForm.expiry_date ? `Validade: ${purchaseForm.expiry_date}` : null,
        skip_cash_transaction: purchaseForm.skip_cash_transaction,
      });

      // Update stock
      await updateProduct.mutateAsync({
        id: product.id,
        current_stock: product.current_stock + purchaseForm.quantity,
        is_for_sale: purchaseForm.is_for_sale,
        expiry_date: purchaseForm.expiry_date || product.expiry_date,
      });

      setPurchaseDialogOpen(false);
      setPurchaseForm({ product_id: '', quantity: 0, unit_price: 0, total_price: 0, supplier: '', supplier_id: '', purchase_date: format(new Date(), 'yyyy-MM-dd'), expiry_date: '', is_for_sale: false, skip_cash_transaction: false });
    } catch {
      // toast shown by mutation
    }
  };

  const handleExport = () => {
    exportToCSV({
      filename: 'produtos',
      headers: ['Nome', 'Marca', 'Categoria', 'Tipo', 'Estoque', 'Unidade', 'Tipo Uso', 'Status', 'Atendimentos'],
      rows: filteredProducts.map(p => [
        p.name, p.brand || '-', p.category || '-', getTypeLabel(p.product_type),
        p.current_stock, getUnitLabel(p.unit),
        p.is_for_sale ? 'Venda' : 'Clínica',
        p.is_active ? 'Ativo' : 'Inativo',
        getProductAppointments(p.id),
      ]),
      successMessage: 'Produtos exportados com sucesso!'
    });
  };

  // Bidirectional price calc helpers
  const updateStockUnitPrice = (price: number) => setStockForm(prev => ({ ...prev, unit_price: price, total_price: prev.quantity * price }));
  const updateStockTotalPrice = (total: number) => setStockForm(prev => ({ ...prev, total_price: total, unit_price: prev.quantity > 0 ? total / prev.quantity : 0 }));
  const updateStockQuantity = (qty: number) => setStockForm(prev => ({ ...prev, quantity: qty, total_price: qty * prev.unit_price }));

  const updatePurchaseUnitPrice = (price: number) => setPurchaseForm(prev => ({ ...prev, unit_price: price, total_price: prev.quantity * price }));
  const updatePurchaseTotalPrice = (total: number) => setPurchaseForm(prev => ({ ...prev, total_price: total, unit_price: prev.quantity > 0 ? total / prev.quantity : 0 }));
  const updatePurchaseQuantity = (qty: number) => setPurchaseForm(prev => ({ ...prev, quantity: qty, total_price: qty * prev.unit_price }));

  // Auto-fill supplier on stock form product selection
  const handleStockProductSelect = (productId: string) => {
    const product = products.find(p => p.id === productId);
    setStockForm(prev => ({ ...prev, product_id: productId }));
    // supplier auto-filled from product
  };

  const handlePurchaseProductSelect = (productId: string) => {
    const product = products.find(p => p.id === productId);
    setPurchaseForm(prev => ({
      ...prev,
      product_id: productId,
      supplier: product?.supplier || '',
      is_for_sale: product?.is_for_sale || false,
    }));
  };

  if (isLoading) {
    return (
      <AppLayout title="Produtos" subtitle="Gerenciamento de produtos e estoque">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Produtos" subtitle="Gerenciamento de produtos e estoque">
      <div className="space-y-4 page-enter">
        {/* Search */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Buscar por nome, marca ou categoria..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>

        {/* Actions Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Filters */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                  <Filter className="h-3.5 w-3.5" />
                  Filtros
                  {activeFiltersCount > 0 && <Badge variant="secondary" className="h-4 w-4 p-0 text-[9px] justify-center">{activeFiltersCount}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-medium">Filtros</h4>
                    {hasActiveFilters && <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 px-2 text-[10px]">Limpar</Button>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] text-muted-foreground">Tipo</Label>
                    <Select value={filters.type} onValueChange={(v) => setFilters({...filters, type: v})}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">Todos</SelectItem>
                        {PRODUCT_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] text-muted-foreground">Status</Label>
                    <Select value={filters.status} onValueChange={(v) => setFilters({...filters, status: v})}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">Todos</SelectItem>
                        <SelectItem value="active" className="text-xs">Ativos</SelectItem>
                        <SelectItem value="inactive" className="text-xs">Inativos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] text-muted-foreground">Para Venda</Label>
                    <Select value={filters.forSale} onValueChange={(v) => setFilters({...filters, forSale: v})}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">Todos</SelectItem>
                        <SelectItem value="yes" className="text-xs">Sim</SelectItem>
                        <SelectItem value="no" className="text-xs">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <Label className="text-xs">Estoque Baixo</Label>
                    <Switch checked={filters.lowStock} onCheckedChange={(v) => setFilters({...filters, lowStock: v})} />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                  <Upload className="h-3.5 w-3.5" /><span className="hidden sm:inline">/</span><Download className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handleExport}><Download className="h-4 w-4 mr-2" />Exportar Produtos</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <ManageSuppliersDialog />
            <ServiceProductsDialog />
          </div>

          {canEdit && (
            <div className="flex items-center gap-2">
              {/* ── Adicionar no Estoque ── */}
              <Dialog open={stockDialogOpen} onOpenChange={(open) => { setStockDialogOpen(open); if (!open) setStockForm({ product_id: '', quantity: 0, unit_price: 0, total_price: 0, purchase_date: format(new Date(), 'yyyy-MM-dd'), expiry_date: '', skip_cash_transaction: false }); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                    <WarehouseIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Adicionar no Estoque</span>
                    <span className="sm:hidden">Estoque</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="text-base">Adicionar no Estoque</DialogTitle>
                    <DialogDescription className="text-xs">Registre a quantidade atual de um produto no estoque</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2.5">
                    <div>
                      <Label className="text-xs">Produto *</Label>
                      <Select value={stockForm.product_id} onValueChange={handleStockProductSelect}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                        <SelectContent>
                          {products.map(p => <SelectItem key={p.id} value={p.id} className="text-sm">{p.name} {p.brand && `(${p.brand})`}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {stockForm.product_id && (() => {
                      const selectedProd = products.find(p => p.id === stockForm.product_id);
                      return selectedProd?.supplier ? (
                        <div className="p-2 bg-muted/50 rounded text-xs"><strong>Fornecedor:</strong> {selectedProd.supplier}</div>
                      ) : null;
                    })()}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Quantidade *</Label>
                        <Input type="number" value={stockForm.quantity || ''} onChange={(e) => updateStockQuantity(parseFloat(e.target.value) || 0)} min="0" step="0.01" className="h-7 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Valor Unitário (R$)</Label>
                        <CurrencyInput value={stockForm.unit_price} onValueChange={updateStockUnitPrice} className="h-7 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Valor Total (R$)</Label>
                        <CurrencyInput value={stockForm.total_price} onValueChange={updateStockTotalPrice} className="h-7 text-xs" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Data da Compra</Label>
                        <Input type="date" value={stockForm.purchase_date} onChange={(e) => setStockForm({ ...stockForm, purchase_date: e.target.value })} className="h-7 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Data de Validade</Label>
                        <Input type="date" value={stockForm.expiry_date} onChange={(e) => setStockForm({ ...stockForm, expiry_date: e.target.value })} className="h-7 text-xs" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
                      <div>
                        <Label className="text-xs font-medium">Produto já pago</Label>
                        <p className="text-[10px] text-muted-foreground">Não gerar saída no caixa/financeiro</p>
                      </div>
                      <Switch checked={stockForm.skip_cash_transaction} onCheckedChange={(v) => setStockForm({ ...stockForm, skip_cash_transaction: v })} />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setStockDialogOpen(false)}>Cancelar</Button>
                      <Button size="sm" className="btn-vibrant" onClick={handleStockSubmit} disabled={!stockForm.product_id || stockForm.quantity <= 0 || createPurchase.isPending}>
                        {createPurchase.isPending ? 'Salvando...' : 'Adicionar'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* ── Nova Compra ── */}
              <Dialog open={purchaseDialogOpen} onOpenChange={(open) => { setPurchaseDialogOpen(open); if (!open) setPurchaseForm({ product_id: '', quantity: 0, unit_price: 0, total_price: 0, supplier: '', supplier_id: '', purchase_date: format(new Date(), 'yyyy-MM-dd'), expiry_date: '', is_for_sale: false, skip_cash_transaction: false }); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Nova Compra</span>
                    <span className="sm:hidden">Compra</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="text-base">Nova Compra</DialogTitle>
                    <DialogDescription className="text-xs">Registre uma nova compra de produto</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2.5">
                    <div>
                      <Label className="text-xs">Produto *</Label>
                      <Select value={purchaseForm.product_id} onValueChange={handlePurchaseProductSelect}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                        <SelectContent>
                          {products.map(p => <SelectItem key={p.id} value={p.id} className="text-sm">{p.name} {p.brand && `(${p.brand})`}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Quantidade *</Label>
                        <Input type="number" value={purchaseForm.quantity || ''} onChange={(e) => updatePurchaseQuantity(parseFloat(e.target.value) || 0)} min="0" step="0.01" className="h-7 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Preço Unitário (R$)</Label>
                        <CurrencyInput value={purchaseForm.unit_price} onValueChange={updatePurchaseUnitPrice} className="h-7 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Preço Total (R$)</Label>
                        <CurrencyInput value={purchaseForm.total_price} onValueChange={updatePurchaseTotalPrice} className="h-7 text-xs" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Fornecedor</Label>
                        <Select
                          value={purchaseForm.supplier_id || "none"}
                          onValueChange={(v) => {
                            const supplier = activeSuppliers.find(s => s.id === v);
                            setPurchaseForm({ ...purchaseForm, supplier_id: v === "none" ? "" : v, supplier: supplier?.name || "" });
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-sm">Nenhum</SelectItem>
                            {activeSuppliers.map(s => <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Data da Compra</Label>
                        <Input type="date" value={purchaseForm.purchase_date} onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })} className="h-7 text-xs" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Data de Validade</Label>
                      <Input type="date" value={purchaseForm.expiry_date} onChange={(e) => setPurchaseForm({ ...purchaseForm, expiry_date: e.target.value })} className="h-7 text-xs" />
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-2">
                      <div>
                        <Label className="text-xs">Para Venda ou Uso da Clínica</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Clínica</span>
                        <Switch checked={purchaseForm.is_for_sale} onCheckedChange={(v) => setPurchaseForm({ ...purchaseForm, is_for_sale: v })} />
                        <span className="text-xs text-muted-foreground">Venda</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
                      <div>
                        <Label className="text-xs font-medium">Produto já pago</Label>
                        <p className="text-[10px] text-muted-foreground">Não gerar saída no caixa/financeiro</p>
                      </div>
                      <Switch checked={purchaseForm.skip_cash_transaction} onCheckedChange={(v) => setPurchaseForm({ ...purchaseForm, skip_cash_transaction: v })} />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setPurchaseDialogOpen(false)}>Cancelar</Button>
                      <Button size="sm" className="btn-vibrant" onClick={handlePurchaseSubmit} disabled={!purchaseForm.product_id || purchaseForm.quantity <= 0 || createPurchase.isPending}>
                        {createPurchase.isPending ? 'Salvando...' : 'Registrar Compra'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* ── Novo Produto ── */}
              <Dialog open={productDialogOpen} onOpenChange={(open) => { setProductDialogOpen(open); if (!open) setProductForm({ name: '', brand: '', category: '', product_type: 'solid', supplier: '', supplier_id: '', is_for_sale: false, sale_price: 0 }); }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-9 gap-1.5 text-xs btn-vibrant">
                    <Plus className="h-3.5 w-3.5" />
                    Novo Produto
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-base">Novo Produto</DialogTitle>
                    <DialogDescription className="text-xs">Cadastre as informações básicas do produto</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Nome *</Label>
                        <Input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="Nome do produto" className="h-7 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Marca</Label>
                        <Input value={productForm.brand} onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })} placeholder="Marca" className="h-7 text-xs" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Categoria</Label>
                        <Input value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} placeholder="Ex: Tratamento facial" className="h-7 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Tipo *</Label>
                        <Select value={productForm.product_type} onValueChange={(v: ProductType) => setProductForm({ ...productForm, product_type: v })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PRODUCT_TYPES.map(type => (
                              <SelectItem key={type.value} value={type.value} className="text-sm">
                                <div className="flex items-center gap-2">{type.icon}{type.label}</div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Fornecedor</Label>
                      <Select
                        value={productForm.supplier_id || "none"}
                        onValueChange={(v) => {
                          const supplier = activeSuppliers.find(s => s.id === v);
                          setProductForm({ ...productForm, supplier_id: v === "none" ? "" : v, supplier: supplier?.name || "" });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-sm">Nenhum</SelectItem>
                          {activeSuppliers.map(s => <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-2">
                      <div>
                        <Label className="text-xs">Para Venda</Label>
                        <p className="text-[10px] text-muted-foreground">Produto disponível para venda</p>
                      </div>
                      <Switch checked={productForm.is_for_sale} onCheckedChange={(v) => setProductForm({ ...productForm, is_for_sale: v })} />
                    </div>
                    {productForm.is_for_sale && (
                      <div>
                        <Label className="text-xs">Preço de Venda (R$)</Label>
                        <CurrencyInput value={productForm.sale_price} onValueChange={(value) => setProductForm({ ...productForm, sale_price: value })} className="h-7 text-xs" />
                      </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setProductDialogOpen(false)}>Cancelar</Button>
                      <Button size="sm" className="btn-vibrant" onClick={handleProductSubmit} disabled={!productForm.name.trim() || createProduct.isPending}>
                        {createProduct.isPending ? 'Salvando...' : 'Cadastrar'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        {/* Active Filters Badges */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1.5">
            {filters.type !== 'all' && (
              <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                Tipo: {getTypeLabel(filters.type as ProductType)}
                <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters({...filters, type: 'all'})} />
              </Badge>
            )}
            {filters.status !== 'all' && (
              <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                Status: {filters.status === 'active' ? 'Ativo' : 'Inativo'}
                <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters({...filters, status: 'all'})} />
              </Badge>
            )}
            {filters.forSale !== 'all' && (
              <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                Venda: {filters.forSale === 'yes' ? 'Sim' : 'Não'}
                <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters({...filters, forSale: 'all'})} />
              </Badge>
            )}
            {filters.lowStock && (
              <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                Estoque Baixo
                <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters({...filters, lowStock: false})} />
              </Badge>
            )}
          </div>
        )}

        {/* Low Stock Alert */}
        {lowStockProducts.length > 0 && !filters.lowStock && (
          <Card className="border-warning/50 bg-warning/5 card-hover">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm flex items-center gap-2 text-warning">
                <AlertTriangle className="h-4 w-4" />
                Estoque Baixo ({lowStockProducts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-3">
              <div className="flex flex-wrap gap-1.5">
                {lowStockProducts.slice(0, 5).map(p => (
                  <Badge key={p.id} variant="outline" className="border-warning/50 text-warning text-[10px] cursor-pointer hover:bg-warning/10" onClick={() => { setSelectedProduct(p); setDetailDialogOpen(true); }}>
                    {p.name} ({p.current_stock} {getUnitLabel(p.unit)})
                  </Badge>
                ))}
                {lowStockProducts.length > 5 && <Badge variant="outline" className="text-[10px]">+{lowStockProducts.length - 5} mais</Badge>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Products Table */}
        <Card className="card-hover">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="h-8 py-1.5 text-[11px]">Produto</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Estoque</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Tipo de Uso</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Atend.</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px]">Status</TableHead>
                    <TableHead className="h-8 py-1.5 text-[11px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        <p>Nenhum produto cadastrado</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProducts.map(product => {
                      const isLowStock = product.current_stock <= (product.min_stock_alert || 0) && product.is_active;
                      const totalAppointments = getProductAppointments(product.id);

                      return (
                        <TableRow
                          key={product.id}
                          className={cn("cursor-pointer hover:bg-muted/50", isLowStock && "bg-amber-50/50 dark:bg-amber-950/20")}
                          onClick={() => { setSelectedProduct(product); setDetailDialogOpen(true); }}
                        >
                          <TableCell className="py-1.5">
                            <div>
                              <p className="font-medium text-xs leading-tight">{product.name}</p>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                {product.brand && <span>{product.brand}</span>}
                                {product.category && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{product.category}</Badge>}
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{getTypeLabel(product.product_type)}</Badge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <span className={cn("font-medium text-xs", isLowStock && "text-amber-600")}>
                              {product.current_stock} {getUnitLabel(product.unit)}
                            </span>
                            {isLowStock && <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 h-4 border-amber-500 text-amber-600">Baixo</Badge>}
                          </TableCell>
                          <TableCell className="py-1.5">
                            {product.is_for_sale ? (
                              <div className="flex items-center gap-1 text-green-600">
                                <Store className="h-3 w-3" /><span className="text-[11px]">Venda</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-blue-600">
                                <Building2 className="h-3 w-3" /><span className="text-[11px]">Clínica</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{totalAppointments}</Badge>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Badge variant={product.is_active ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-4">
                              {product.is_active ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-0.5 justify-end">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedProduct(product); setDetailDialogOpen(true); }} title="Ver detalhes">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {canDelete && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Excluir Produto</AlertDialogTitle>
                                      <AlertDialogDescription>Tem certeza que deseja excluir "{product.name}"? Esta ação não pode ser desfeita.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => deleteProduct.mutateAsync(product.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
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
            </div>
          </CardContent>
        </Card>

        {/* Product Detail Dialog */}
        <ProductDetailDialog
          product={selectedProduct}
          purchases={purchases}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          onUpdateProduct={async (data) => { await updateProduct.mutateAsync(data); }}
          onUpdatePurchase={async (data) => { await updatePurchase.mutateAsync(data); }}
          onDeletePurchase={async (id) => { await deletePurchase.mutateAsync(id); }}
          onCreateServiceLink={async (data) => {
            await createSPMutation.mutateAsync(data);
          }}
          onUpdateServiceLink={async () => {}}
          onDeleteServiceLink={async () => {}}
        />
      </div>
    </AppLayout>
  );
}

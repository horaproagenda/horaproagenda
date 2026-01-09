import { useState, useMemo } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  Edit, 
  Trash2, 
  ShoppingCart,
  Droplets,
  Box,
  Calendar,
  Clock,
  AlertTriangle,
  Truck,
  Search,
  Eye,
  Store,
  Building2,
  CheckCircle2,
  Filter,
  X,
  Upload,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProducts, useProductPurchases, type Product, type ProductPurchase, type ProductType, type ProductUnit } from '@/hooks/useProducts';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useServices } from '@/hooks/useServices';
import { useServiceProducts } from '@/hooks/useServiceProducts';
import { useAppointments } from '@/hooks/useAppointments';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useAuth } from '@/contexts/AuthContext';
import { ManageSuppliersDialog } from '@/components/produtos/ManageSuppliersDialog';
import { ProductDetailDialog } from '@/components/produtos/ProductDetailDialog';
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
  { value: 'gel', label: 'Gel (aplicação)' },
];

const getTypeLabel = (type: ProductType) => PRODUCT_TYPES.find(t => t.value === type)?.label || type;
const getUnitLabel = (unit: ProductUnit) => PRODUCT_UNITS.find(u => u.value === unit)?.label || unit;

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
  const { products, isLoading, createProduct, updateProduct, deleteProduct } = useProducts();
  const { purchases, createPurchase, updatePurchase, deletePurchase } = useProductPurchases();
  const { activeSuppliers } = useSuppliers();
  const { activeServices } = useServices();
  const { serviceProducts, createServiceProduct, updateServiceProduct, deleteServiceProduct } = useServiceProducts();
  const { appointments } = useAppointments();
  const { activePaymentMethods } = usePaymentMethods();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('receptionist');
  const canDelete = hasRole('admin');

  // Persistent filters
  const [filters, setFilters] = useLocalStorage<ProductFilters>('produtos-filters', defaultFilters);
  const [searchTerm, setSearchTerm] = useState('');

  // Product Dialog State
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    brand: '',
    category: '',
    product_type: 'solid' as ProductType,
    unit: 'un' as ProductUnit,
    quantity_purchased: 0,
    unit_price: 0,
    total_price: 0,
    supplier: '',
    supplier_id: '',
    purchase_date: '',
    expiry_date: '',
    started_using_at: '',
    current_stock: 0,
    min_stock_alert: 0,
    notes: '',
    is_active: true,
    is_for_sale: false,
    sale_price: 0,
  });

  // Purchase Dialog State
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    product_id: '',
    quantity: 1,
    unit_price: 0,
    total_price: 0,
    supplier: '',
    supplier_id: '',
    purchase_date: format(new Date(), 'yyyy-MM-dd'),
    started_using_at: '',
    notes: '',
  });

  // Product Detail Dialog
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // Filtered products based on search and filters
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!p.name.toLowerCase().includes(search) &&
            !p.brand?.toLowerCase().includes(search) &&
            !p.category?.toLowerCase().includes(search)) {
          return false;
        }
      }
      
      // Type filter
      if (filters.type !== 'all' && p.product_type !== filters.type) return false;
      
      // Status filter
      if (filters.status === 'active' && !p.is_active) return false;
      if (filters.status === 'inactive' && p.is_active) return false;
      if (filters.status === 'finished' && !p.finished_at) return false;
      
      // For sale filter
      if (filters.forSale === 'yes' && !p.is_for_sale) return false;
      if (filters.forSale === 'no' && p.is_for_sale) return false;
      
      // Low stock filter
      if (filters.lowStock && !(p.current_stock <= (p.min_stock_alert || 0) && p.is_active)) return false;
      
      return true;
    });
  }, [products, searchTerm, filters]);
  
  const hasActiveFilters = filters.type !== 'all' || filters.status !== 'all' || filters.forSale !== 'all' || filters.lowStock;
  const activeFiltersCount = [
    filters.type !== 'all',
    filters.status !== 'all',
    filters.forSale !== 'all',
    filters.lowStock
  ].filter(Boolean).length;
  
  const clearFilters = () => setFilters(defaultFilters);
  
  const handleExport = () => {
    exportToCSV({
      filename: 'produtos',
      headers: ['Nome', 'Marca', 'Categoria', 'Tipo', 'Estoque', 'Unidade', 'Status', 'Para Venda'],
      rows: filteredProducts.map(p => [
        p.name,
        p.brand || '-',
        p.category || '-',
        getTypeLabel(p.product_type),
        p.current_stock,
        getUnitLabel(p.unit),
        p.finished_at ? 'Finalizado' : (p.is_active ? 'Ativo' : 'Inativo'),
        p.is_for_sale ? 'Sim' : 'Não'
      ]),
      successMessage: 'Produtos exportados com sucesso!'
    });
  };

  // Low stock products
  const lowStockProducts = useMemo(() => {
    return products.filter(p => p.current_stock <= (p.min_stock_alert || 0) && p.is_active);
  }, [products]);

  // Calculate appointments for a product
  const getProductAppointments = (productId: string) => {
    const linkedServices = serviceProducts.filter(sp => sp.product_id === productId);
    let total = 0;
    linkedServices.forEach(sp => {
      const completed = appointments.filter(
        apt => apt.service_id === sp.service_id && apt.status === 'completed'
      );
      total += completed.length;
    });
    return total;
  };

  const resetProductForm = () => {
    setProductForm({
      name: '',
      description: '',
      brand: '',
      category: '',
      product_type: 'solid',
      unit: 'un',
      quantity_purchased: 0,
      unit_price: 0,
      total_price: 0,
      supplier: '',
      supplier_id: '',
      purchase_date: '',
      expiry_date: '',
      started_using_at: '',
      current_stock: 0,
      min_stock_alert: 0,
      notes: '',
      is_active: true,
      is_for_sale: false,
      sale_price: 0,
    });
    setEditingProduct(null);
  };

  const resetPurchaseForm = () => {
    setPurchaseForm({
      product_id: '',
      quantity: 1,
      unit_price: 0,
      total_price: 0,
      supplier: '',
      supplier_id: '',
      purchase_date: format(new Date(), 'yyyy-MM-dd'),
      started_using_at: '',
      notes: '',
    });
  };

  const handleProductSubmit = async () => {
    if (!productForm.name.trim()) return;

    const productData = {
      ...productForm,
      description: productForm.description || null,
      brand: productForm.brand || null,
      category: productForm.category || null,
      supplier: productForm.supplier || null,
      supplier_id: productForm.supplier_id || null,
      purchase_date: productForm.purchase_date || null,
      expiry_date: productForm.expiry_date || null,
      started_using_at: productForm.started_using_at || null,
      finished_at: null,
      notes: productForm.notes || null,
    };

    if (editingProduct) {
      await updateProduct.mutateAsync({ id: editingProduct.id, ...productData });
    } else {
      await createProduct.mutateAsync(productData);
    }

    setProductDialogOpen(false);
    resetProductForm();
  };

  const handlePurchaseSubmit = async () => {
    if (!purchaseForm.product_id) return;

    const purchaseData = {
      ...purchaseForm,
      supplier: purchaseForm.supplier || null,
      supplier_id: purchaseForm.supplier_id || null,
      started_using_at: purchaseForm.started_using_at || null,
      finished_at: null,
    };

    // Create purchase - stock is updated automatically via trigger/hook
    await createPurchase.mutateAsync(purchaseData);

    // Update product stock
    const product = products.find(p => p.id === purchaseForm.product_id);
    if (product) {
      await updateProduct.mutateAsync({
        id: product.id,
        current_stock: product.current_stock + purchaseForm.quantity,
      });
    }

    setPurchaseDialogOpen(false);
    resetPurchaseForm();
  };

  const handleMarkFinished = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const totalAppointments = getProductAppointments(productId);
    const startDate = product.started_using_at ? parseISO(product.started_using_at) : null;
    const now = new Date();
    const durationDays = startDate ? differenceInDays(now, startDate) : 0;

    const avgPerAppointment = totalAppointments > 0 
      ? (product.quantity_purchased / totalAppointments).toFixed(2)
      : 'N/A';

    await updateProduct.mutateAsync({
      id: productId,
      finished_at: format(now, 'yyyy-MM-dd'),
      current_stock: 0,
      notes: `${product.notes || ''}\n[${format(now, 'dd/MM/yyyy')}] Produto finalizado.\n- Total atendimentos: ${totalAppointments}\n- Duração: ${durationDays} dias\n- Média por atendimento: ${avgPerAppointment} ${getUnitLabel(product.unit)}`.trim(),
    });

    toast.success(`Produto finalizado! ${totalAppointments} atendimentos registrados.`);
  };

  const handleUpdateStartDate = async (productId: string, date: string) => {
    await updateProduct.mutateAsync({
      id: productId,
      started_using_at: date || null,
    });
  };

  const handleUpdateFinishedDate = async (productId: string, date: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (date) {
      const totalAppointments = getProductAppointments(productId);
      const startDate = product.started_using_at ? parseISO(product.started_using_at) : null;
      const endDate = parseISO(date);
      const durationDays = startDate ? differenceInDays(endDate, startDate) : 0;

      const avgPerAppointment = totalAppointments > 0 
        ? (product.quantity_purchased / totalAppointments).toFixed(2)
        : 'N/A';

      await updateProduct.mutateAsync({
        id: productId,
        finished_at: date,
        current_stock: 0,
        notes: `${product.notes || ''}\n[${format(endDate, 'dd/MM/yyyy')}] Produto finalizado.\n- Total atendimentos: ${totalAppointments}\n- Duração: ${durationDays} dias\n- Média por atendimento: ${avgPerAppointment} ${getUnitLabel(product.unit)}`.trim(),
      });
      toast.success(`Produto finalizado! ${totalAppointments} atendimentos registrados.`);
    } else {
      await updateProduct.mutateAsync({
        id: productId,
        finished_at: null,
      });
    }
  };

  const openProductDetail = (product: Product) => {
    setSelectedProduct(product);
    setDetailDialogOpen(true);
  };

  const updatePurchaseTotal = (qty: number, price: number) => {
    setPurchaseForm(prev => ({
      ...prev,
      quantity: qty,
      unit_price: price,
      total_price: qty * price,
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
        {/* Search Row */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome, marca ou categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        
        {/* Actions Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Filters */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                  <Filter className="h-3.5 w-3.5" />
                  <span>Filtros</span>
                  {activeFiltersCount > 0 && (
                    <Badge variant="secondary" className="h-4 w-4 p-0 text-[9px] justify-center">
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-medium">Filtros</h4>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 px-2 text-[10px]">
                        Limpar
                      </Button>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-[10px] text-muted-foreground">Tipo</Label>
                    <Select value={filters.type} onValueChange={(v) => setFilters({...filters, type: v})}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">Todos</SelectItem>
                        {PRODUCT_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-[10px] text-muted-foreground">Status</Label>
                    <Select value={filters.status} onValueChange={(v) => setFilters({...filters, status: v})}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">Todos</SelectItem>
                        <SelectItem value="active" className="text-xs">Ativos</SelectItem>
                        <SelectItem value="inactive" className="text-xs">Inativos</SelectItem>
                        <SelectItem value="finished" className="text-xs">Finalizados</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-[10px] text-muted-foreground">Para Venda</Label>
                    <Select value={filters.forSale} onValueChange={(v) => setFilters({...filters, forSale: v})}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">Todos</SelectItem>
                        <SelectItem value="yes" className="text-xs">Sim</SelectItem>
                        <SelectItem value="no" className="text-xs">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <Label className="text-xs">Estoque Baixo</Label>
                    <Switch 
                      checked={filters.lowStock} 
                      onCheckedChange={(v) => setFilters({...filters, lowStock: v})} 
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            {/* Import/Export */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">/</span>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar Produtos
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <ManageSuppliersDialog />
          </div>
          
          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <Dialog open={purchaseDialogOpen} onOpenChange={(open) => {
                  setPurchaseDialogOpen(open);
                  if (!open) resetPurchaseForm();
                }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                      <ShoppingCart className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Nova Compra</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="text-base">Registrar Compra</DialogTitle>
                      <DialogDescription className="text-xs">
                        O estoque será atualizado automaticamente
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Produto *</Label>
                        <Select
                          value={purchaseForm.product_id}
                          onValueChange={(v) => setPurchaseForm({ ...purchaseForm, product_id: v })}
                        >
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                          <SelectContent>
                            {products.map(product => (
                              <SelectItem key={product.id} value={product.id} className="text-sm">
                                {product.name} {product.brand && `(${product.brand})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Quantidade</Label>
                          <Input
                            type="number"
                            value={purchaseForm.quantity}
                            onChange={(e) => updatePurchaseTotal(parseFloat(e.target.value) || 0, purchaseForm.unit_price)}
                            min="0"
                            step="0.01"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Preço Unit. (R$)</Label>
                          <Input
                            type="number"
                            value={purchaseForm.unit_price}
                            onChange={(e) => updatePurchaseTotal(purchaseForm.quantity, parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Total (R$)</Label>
                          <Input
                            type="number"
                            value={purchaseForm.total_price}
                            readOnly
                            className="bg-muted h-8 text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Fornecedor</Label>
                          <Select
                            value={purchaseForm.supplier_id || "none"}
                            onValueChange={(v) => {
                              const supplier = activeSuppliers.find(s => s.id === v);
                              setPurchaseForm({ 
                                ...purchaseForm, 
                                supplier_id: v === "none" ? "" : v,
                                supplier: supplier?.name || "" 
                              });
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" className="text-sm">Nenhum</SelectItem>
                              {activeSuppliers.map(s => (
                                <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Data da Compra</Label>
                          <Input
                            type="date"
                            value={purchaseForm.purchase_date}
                            onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">Data Início de Uso (opcional)</Label>
                        <Input
                          type="date"
                          value={purchaseForm.started_using_at}
                          onChange={(e) => setPurchaseForm({ ...purchaseForm, started_using_at: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => { setPurchaseDialogOpen(false); resetPurchaseForm(); }}>
                          Cancelar
                        </Button>
                        <Button size="sm" className="btn-vibrant" onClick={handlePurchaseSubmit} disabled={!purchaseForm.product_id || createPurchase.isPending}>
                          {createPurchase.isPending ? 'Salvando...' : 'Registrar'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                
                <Dialog open={productDialogOpen} onOpenChange={(open) => {
                  setProductDialogOpen(open);
                  if (!open) resetProductForm();
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-9 gap-1.5 text-xs btn-vibrant">
                      <Plus className="h-3.5 w-3.5" />
                      <span>Novo Produto</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-base">Novo Produto</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[65vh] pr-4">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Nome *</Label>
                            <Input
                              value={productForm.name}
                              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                              placeholder="Nome do produto"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Marca</Label>
                            <Input
                              value={productForm.brand}
                              onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })}
                              placeholder="Marca"
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs">Categoria</Label>
                            <Input
                              value={productForm.category}
                              onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                              placeholder="Categoria"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Tipo</Label>
                            <Select
                              value={productForm.product_type}
                              onValueChange={(v: ProductType) => setProductForm({ ...productForm, product_type: v })}
                            >
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PRODUCT_TYPES.map(type => (
                                  <SelectItem key={type.value} value={type.value} className="text-sm">
                                    <div className="flex items-center gap-2">
                                      {type.icon}
                                      {type.label}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Unidade</Label>
                            <Select
                              value={productForm.unit}
                              onValueChange={(v: ProductUnit) => setProductForm({ ...productForm, unit: v })}
                            >
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PRODUCT_UNITS.map(unit => (
                                  <SelectItem key={unit.value} value={unit.value} className="text-sm">{unit.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Fornecedor</Label>
                            <Select
                              value={productForm.supplier_id || "none"}
                              onValueChange={(v) => {
                                const supplier = activeSuppliers.find(s => s.id === v);
                                setProductForm({ 
                                  ...productForm, 
                                  supplier_id: v === "none" ? "" : v,
                                  supplier: supplier?.name || "" 
                                });
                              }}
                            >
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none" className="text-sm">Nenhum</SelectItem>
                                {activeSuppliers.map(s => (
                                  <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Alerta Estoque Mín.</Label>
                            <Input
                              type="number"
                              value={productForm.min_stock_alert}
                              onChange={(e) => setProductForm({ ...productForm, min_stock_alert: parseFloat(e.target.value) || 0 })}
                              min="0"
                              step="0.01"
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-md border p-2">
                          <div>
                            <Label className="text-xs">Para Venda</Label>
                            <p className="text-[10px] text-muted-foreground">Produto disponível para venda</p>
                          </div>
                          <Switch
                            checked={productForm.is_for_sale}
                            onCheckedChange={(v) => setProductForm({ ...productForm, is_for_sale: v })}
                          />
                        </div>
                        
                        {productForm.is_for_sale && (
                          <div>
                            <Label className="text-xs">Preço de Venda (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={productForm.sale_price}
                              onChange={(e) => setProductForm({ ...productForm, sale_price: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-sm"
                            />
                          </div>
                        )}

                        <div>
                          <Label className="text-xs">Descrição</Label>
                          <Textarea
                            value={productForm.description}
                            onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                            placeholder="Descrição do produto"
                            rows={2}
                            className="text-sm resize-none"
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <Button variant="outline" size="sm" onClick={() => { setProductDialogOpen(false); resetProductForm(); }}>
                            Cancelar
                          </Button>
                          <Button size="sm" className="btn-vibrant" onClick={handleProductSubmit} disabled={!productForm.name.trim() || createProduct.isPending}>
                            {createProduct.isPending ? 'Salvando...' : 'Cadastrar'}
                          </Button>
                        </div>
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
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
                Status: {filters.status === 'active' ? 'Ativo' : filters.status === 'inactive' ? 'Inativo' : 'Finalizado'}
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
                  <Badge 
                    key={p.id} 
                    variant="outline" 
                    className="border-warning/50 text-warning text-[10px] cursor-pointer hover:bg-warning/10"
                    onClick={() => openProductDetail(p)}
                  >
                    {p.name} ({p.current_stock})
                  </Badge>
                ))}
                {lowStockProducts.length > 5 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{lowStockProducts.length - 5} mais
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Products Table */}
        <Card className="card-hover">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Estoque</TableHead>
                    <TableHead>Tipo de Uso</TableHead>
                    <TableHead>Início Uso</TableHead>
                    <TableHead>Término</TableHead>
                    <TableHead>Atendimentos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                        <p>Nenhum produto cadastrado</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProducts.map(product => {
                      const isLowStock = product.current_stock <= (product.min_stock_alert || 0);
                      const totalAppointments = getProductAppointments(product.id);
                      const isFinished = !!product.finished_at;

                      return (
                        <TableRow 
                          key={product.id} 
                          className={cn(
                            "cursor-pointer hover:bg-muted/50",
                            isLowStock && !isFinished && "bg-amber-50/50 dark:bg-amber-950/20"
                          )}
                          onClick={() => openProductDetail(product)}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium">{product.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {product.brand && <span>{product.brand}</span>}
                                {product.category && <Badge variant="outline" className="text-xs">{product.category}</Badge>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={cn(
                              "font-medium",
                              isLowStock && !isFinished && "text-amber-600"
                            )}>
                              {product.current_stock} {getUnitLabel(product.unit)}
                            </span>
                            {isLowStock && !isFinished && (
                              <Badge variant="outline" className="ml-2 text-xs border-amber-500 text-amber-600">
                                Baixo
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {product.is_for_sale ? (
                              <div className="flex items-center gap-1 text-green-600">
                                <Store className="h-4 w-4" />
                                <span className="text-sm">Venda</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-blue-600">
                                <Building2 className="h-4 w-4" />
                                <span className="text-sm">Clínica</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Input
                              type="date"
                              value={product.started_using_at || ''}
                              onChange={(e) => handleUpdateStartDate(product.id, e.target.value)}
                              className="w-32 h-8 text-xs"
                              disabled={isFinished}
                            />
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {isFinished ? (
                              <div className="flex items-center gap-1 text-sm">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                {format(parseISO(product.finished_at!), 'dd/MM/yy')}
                              </div>
                            ) : (
                              <Input
                                type="date"
                                value=""
                                onChange={(e) => handleUpdateFinishedDate(product.id, e.target.value)}
                                className="w-32 h-8 text-xs"
                                disabled={!product.started_using_at}
                                title={!product.started_using_at ? "Preencha a data de início primeiro" : ""}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{totalAppointments}</Badge>
                          </TableCell>
                          <TableCell>
                            {isFinished ? (
                              <Badge variant="outline" className="text-muted-foreground">Finalizado</Badge>
                            ) : (
                              <Badge variant={product.is_active ? 'default' : 'secondary'}>
                                {product.is_active ? 'Ativo' : 'Inativo'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openProductDetail(product)}
                                title="Ver detalhes"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {canEdit && !isFinished && product.started_using_at && product.current_stock > 0 && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-amber-600" title="Marcar como finalizado">
                                      <CheckCircle2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Finalizar Produto</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Isso irá marcar "{product.name}" como finalizado e registrar o total de atendimentos realizados.
                                        O estoque será zerado.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleMarkFinished(product.id)}>
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
                                      <AlertDialogTitle>Excluir Produto</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Tem certeza que deseja excluir "{product.name}"? Esta ação não pode ser desfeita.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteProduct.mutateAsync(product.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Excluir
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
            </div>
          </CardContent>
        </Card>

        {/* Product Detail Dialog */}
        <ProductDetailDialog
          product={selectedProduct}
          purchases={purchases}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          onUpdateProduct={async (data) => {
            await updateProduct.mutateAsync(data);
          }}
          onCreateServiceLink={async (data) => {
            await createServiceProduct.mutateAsync(data);
          }}
          onUpdateServiceLink={async (data) => {
            await updateServiceProduct.mutateAsync(data);
          }}
          onDeleteServiceLink={async (id) => {
            await deleteServiceProduct.mutateAsync(id);
          }}
        />
      </div>
    </AppLayout>
  );
}

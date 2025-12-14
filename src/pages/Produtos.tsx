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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Package, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  ShoppingCart,
  Droplets,
  Box,
  Calendar,
  Clock,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  BarChart3,
  Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProducts, useProductPurchases, type Product, type ProductPurchase, type ProductType, type ProductUnit } from '@/hooks/useProducts';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useAuth } from '@/contexts/AuthContext';
import { ManageSuppliersDialog } from '@/components/produtos/ManageSuppliersDialog';
import { ServiceProductsDialog } from '@/components/produtos/ServiceProductsDialog';

const PRODUCT_TYPES: { value: ProductType; label: string; icon: React.ReactNode }[] = [
  { value: 'solid', label: 'Sólido', icon: <Box className="h-4 w-4" /> },
  { value: 'liquid', label: 'Líquido', icon: <Droplets className="h-4 w-4" /> },
  { value: 'cream', label: 'Creme', icon: <Package className="h-4 w-4" /> },
  { value: 'powder', label: 'Pó', icon: <Package className="h-4 w-4" /> },
  { value: 'other', label: 'Outro', icon: <Package className="h-4 w-4" /> },
];

const PRODUCT_UNITS: { value: ProductUnit; label: string }[] = [
  { value: 'un', label: 'Unidade(s)' },
  { value: 'ml', label: 'mL' },
  { value: 'l', label: 'L' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
];

const getTypeLabel = (type: ProductType) => PRODUCT_TYPES.find(t => t.value === type)?.label || type;
const getUnitLabel = (unit: ProductUnit) => PRODUCT_UNITS.find(u => u.value === unit)?.label || unit;

export default function Produtos() {
  const { products, isLoading, createProduct, updateProduct, deleteProduct } = useProducts();
  const { purchases, createPurchase, updatePurchase, deletePurchase } = useProductPurchases();
  const { suppliers, activeSuppliers } = useSuppliers();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('receptionist');
  const canDelete = hasRole('admin');

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'low_stock'>('all');

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
    quantity_purchased: 1,
    unit_price: 0,
    total_price: 0,
    supplier: '',
    supplier_id: '',
    purchase_date: format(new Date(), 'yyyy-MM-dd'),
    expiry_date: '',
    started_using_at: '',
    finished_at: '',
    current_stock: 0,
    min_stock_alert: 0,
    notes: '',
    is_active: true,
  });

  // Purchase Dialog State
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<ProductPurchase | null>(null);
  const [selectedProductForPurchase, setSelectedProductForPurchase] = useState<string>('');
  const [purchaseForm, setPurchaseForm] = useState({
    product_id: '',
    quantity: 1,
    unit_price: 0,
    total_price: 0,
    supplier: '',
    supplier_id: '',
    purchase_date: format(new Date(), 'yyyy-MM-dd'),
    started_using_at: '',
    finished_at: '',
    notes: '',
  });

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = typeFilter === 'all' || product.product_type === typeFilter;
      
      const matchesStatus = 
        statusFilter === 'all' ? true :
        statusFilter === 'active' ? product.is_active :
        statusFilter === 'inactive' ? !product.is_active :
        statusFilter === 'low_stock' ? (product.current_stock <= (product.min_stock_alert || 0)) : true;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [products, searchTerm, typeFilter, statusFilter]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalProducts = products.length;
    const totalValue = products.reduce((sum, p) => sum + p.total_price, 0);
    const lowStockCount = products.filter(p => p.current_stock <= (p.min_stock_alert || 0)).length;
    const activeCount = products.filter(p => p.is_active).length;
    return { totalProducts, totalValue, lowStockCount, activeCount };
  }, [products]);

  const resetProductForm = () => {
    setProductForm({
      name: '',
      description: '',
      brand: '',
      category: '',
      product_type: 'solid',
      unit: 'un',
      quantity_purchased: 1,
      unit_price: 0,
      total_price: 0,
      supplier: '',
      supplier_id: '',
      purchase_date: format(new Date(), 'yyyy-MM-dd'),
      expiry_date: '',
      started_using_at: '',
      finished_at: '',
      current_stock: 0,
      min_stock_alert: 0,
      notes: '',
      is_active: true,
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
      finished_at: '',
      notes: '',
    });
    setEditingPurchase(null);
    setSelectedProductForPurchase('');
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      description: product.description || '',
      brand: product.brand || '',
      category: product.category || '',
      product_type: product.product_type,
      unit: product.unit,
      quantity_purchased: product.quantity_purchased,
      unit_price: product.unit_price,
      total_price: product.total_price,
      supplier: product.supplier || '',
      supplier_id: (product as any).supplier_id || '',
      purchase_date: product.purchase_date || '',
      expiry_date: product.expiry_date || '',
      started_using_at: product.started_using_at || '',
      finished_at: product.finished_at || '',
      current_stock: product.current_stock,
      min_stock_alert: product.min_stock_alert || 0,
      notes: product.notes || '',
      is_active: product.is_active,
    });
    setProductDialogOpen(true);
  };

  const openEditPurchase = (purchase: ProductPurchase) => {
    setEditingPurchase(purchase);
    setPurchaseForm({
      product_id: purchase.product_id,
      quantity: purchase.quantity,
      unit_price: purchase.unit_price,
      total_price: purchase.total_price,
      supplier: purchase.supplier || '',
      supplier_id: (purchase as any).supplier_id || '',
      purchase_date: purchase.purchase_date,
      started_using_at: purchase.started_using_at || '',
      finished_at: purchase.finished_at || '',
      notes: purchase.notes || '',
    });
    setSelectedProductForPurchase(purchase.product_id);
    setPurchaseDialogOpen(true);
  };

  const handleProductSubmit = async () => {
    if (!productForm.name.trim()) {
      return;
    }

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
      finished_at: productForm.finished_at || null,
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
    if (!purchaseForm.product_id) {
      return;
    }

    const purchaseData = {
      ...purchaseForm,
      supplier: purchaseForm.supplier || null,
      supplier_id: purchaseForm.supplier_id || null,
      started_using_at: purchaseForm.started_using_at || null,
      finished_at: purchaseForm.finished_at || null,
      notes: purchaseForm.notes || null,
    };

    if (editingPurchase) {
      await updatePurchase.mutateAsync({ id: editingPurchase.id, ...purchaseData });
    } else {
      await createPurchase.mutateAsync(purchaseData);
    }

    setPurchaseDialogOpen(false);
    resetPurchaseForm();
  };

  const handleDeleteProduct = async (id: string) => {
    await deleteProduct.mutateAsync(id);
  };

  const handleDeletePurchase = async (id: string) => {
    await deletePurchase.mutateAsync(id);
  };

  // Update total price when quantity or unit price changes
  const updateProductTotal = (qty: number, price: number) => {
    setProductForm(prev => ({
      ...prev,
      quantity_purchased: qty,
      unit_price: price,
      total_price: qty * price,
      current_stock: prev.current_stock || qty,
    }));
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
      <AppLayout title="Produtos" subtitle="Gerenciamento de produtos e compras">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Produtos" subtitle="Gerenciamento de produtos e compras">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Produtos</p>
                  <p className="text-xl font-bold">{totals.totalProducts}</p>
                </div>
                <Package className="h-8 w-8 text-muted-foreground/20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Ativos</p>
                  <p className="text-xl font-bold text-primary">{totals.activeCount}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-primary/20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Estoque Baixo</p>
                  <p className="text-xl font-bold text-warning">{totals.lowStockCount}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-warning/20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Valor Total</p>
                  <p className="text-xl font-bold text-green-600">
                    R$ {totals.totalValue.toFixed(2)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-600/20" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="products" className="space-y-4">
          <TabsList>
            <TabsTrigger value="products" className="gap-2">
              <Package className="h-4 w-4" />
              Produtos
            </TabsTrigger>
            <TabsTrigger value="purchases" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Compras
            </TabsTrigger>
          </TabsList>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-4">
            {/* Action Buttons */}
            <div className="flex gap-2 flex-wrap">
              <ManageSuppliersDialog />
              <ServiceProductsDialog />
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar produto..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Badge
                      variant={statusFilter === 'all' ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => setStatusFilter('all')}
                    >
                      Todos
                    </Badge>
                    <Badge
                      variant={statusFilter === 'active' ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => setStatusFilter('active')}
                    >
                      Ativos
                    </Badge>
                    <Badge
                      variant={statusFilter === 'inactive' ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => setStatusFilter('inactive')}
                    >
                      Inativos
                    </Badge>
                    <Badge
                      variant={statusFilter === 'low_stock' ? 'destructive' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => setStatusFilter('low_stock')}
                    >
                      Estoque Baixo
                    </Badge>
                  </div>

                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      {PRODUCT_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            {type.icon}
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {canEdit && (
                    <Dialog open={productDialogOpen} onOpenChange={(open) => {
                      setProductDialogOpen(open);
                      if (!open) resetProductForm();
                    }}>
                      <DialogTrigger asChild>
                        <Button className="gap-2">
                          <Plus className="h-4 w-4" />
                          Novo Produto
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh]">
                        <DialogHeader>
                          <DialogTitle>
                            {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                          </DialogTitle>
                          <DialogDescription>
                            {editingProduct ? 'Atualize as informações do produto' : 'Cadastre um novo produto'}
                          </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="max-h-[60vh] pr-4">
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="col-span-2">
                                <Label>Nome *</Label>
                                <Input
                                  value={productForm.name}
                                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                                  placeholder="Nome do produto"
                                />
                              </div>

                              <div>
                                <Label>Marca</Label>
                                <Input
                                  value={productForm.brand}
                                  onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })}
                                  placeholder="Marca"
                                />
                              </div>

                              <div>
                                <Label>Categoria</Label>
                                <Input
                                  value={productForm.category}
                                  onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                                  placeholder="Categoria"
                                />
                              </div>

                              <div>
                                <Label>Tipo</Label>
                                <Select
                                  value={productForm.product_type}
                                  onValueChange={(v: ProductType) => setProductForm({ ...productForm, product_type: v })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PRODUCT_TYPES.map(type => (
                                      <SelectItem key={type.value} value={type.value}>
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
                                <Label>Unidade</Label>
                                <Select
                                  value={productForm.unit}
                                  onValueChange={(v: ProductUnit) => setProductForm({ ...productForm, unit: v })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PRODUCT_UNITS.map(unit => (
                                      <SelectItem key={unit.value} value={unit.value}>
                                        {unit.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <Separator />

                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <Label>Quantidade Comprada</Label>
                                <Input
                                  type="number"
                                  value={productForm.quantity_purchased}
                                  onChange={(e) => updateProductTotal(parseFloat(e.target.value) || 0, productForm.unit_price)}
                                  min="0"
                                  step="0.01"
                                />
                              </div>

                              <div>
                                <Label>Preço Unitário (R$)</Label>
                                <Input
                                  type="number"
                                  value={productForm.unit_price}
                                  onChange={(e) => updateProductTotal(productForm.quantity_purchased, parseFloat(e.target.value) || 0)}
                                  min="0"
                                  step="0.01"
                                />
                              </div>

                              <div>
                                <Label>Preço Total (R$)</Label>
                                <Input
                                  type="number"
                                  value={productForm.total_price}
                                  readOnly
                                  className="bg-muted"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Estoque Atual</Label>
                                <Input
                                  type="number"
                                  value={productForm.current_stock}
                                  onChange={(e) => setProductForm({ ...productForm, current_stock: parseFloat(e.target.value) || 0 })}
                                  min="0"
                                  step="0.01"
                                />
                              </div>

                              <div>
                                <Label>Alerta Estoque Mínimo</Label>
                                <Input
                                  type="number"
                                  value={productForm.min_stock_alert}
                                  onChange={(e) => setProductForm({ ...productForm, min_stock_alert: parseFloat(e.target.value) || 0 })}
                                  min="0"
                                  step="0.01"
                                />
                              </div>
                            </div>

                            <Separator />

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Fornecedor Cadastrado</Label>
                                <Select
                                  value={productForm.supplier_id}
                                  onValueChange={(v) => {
                                    const supplier = activeSuppliers.find(s => s.id === v);
                                    setProductForm({ 
                                      ...productForm, 
                                      supplier_id: v,
                                      supplier: supplier?.name || productForm.supplier 
                                    });
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione um fornecedor" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">Nenhum</SelectItem>
                                    {activeSuppliers.map(s => (
                                      <SelectItem key={s.id} value={s.id}>
                                        <div className="flex items-center gap-2">
                                          <Truck className="h-3 w-3" />
                                          {s.name}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div>
                                <Label>Ou Digite o Fornecedor</Label>
                                <Input
                                  value={productForm.supplier}
                                  onChange={(e) => setProductForm({ ...productForm, supplier: e.target.value })}
                                  placeholder="Nome do fornecedor"
                                />
                              </div>

                              <div>
                                <Label>Data da Compra</Label>
                                <Input
                                  type="date"
                                  value={productForm.purchase_date}
                                  onChange={(e) => setProductForm({ ...productForm, purchase_date: e.target.value })}
                                />
                              </div>

                              <div>
                                <Label>Data de Validade</Label>
                                <Input
                                  type="date"
                                  value={productForm.expiry_date}
                                  onChange={(e) => setProductForm({ ...productForm, expiry_date: e.target.value })}
                                />
                              </div>

                              <div>
                                <Label>Começou a Usar em</Label>
                                <Input
                                  type="date"
                                  value={productForm.started_using_at}
                                  onChange={(e) => setProductForm({ ...productForm, started_using_at: e.target.value })}
                                />
                              </div>

                              <div>
                                <Label>Terminou em</Label>
                                <Input
                                  type="date"
                                  value={productForm.finished_at}
                                  onChange={(e) => setProductForm({ ...productForm, finished_at: e.target.value })}
                                />
                              </div>

                              <div className="flex items-center gap-2 pt-6">
                                <input
                                  type="checkbox"
                                  id="is_active"
                                  checked={productForm.is_active}
                                  onChange={(e) => setProductForm({ ...productForm, is_active: e.target.checked })}
                                  className="h-4 w-4 rounded border-input"
                                />
                                <Label htmlFor="is_active" className="cursor-pointer">
                                  Produto Ativo
                                </Label>
                              </div>
                            </div>

                            <div>
                              <Label>Descrição</Label>
                              <Textarea
                                value={productForm.description}
                                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                                placeholder="Descrição do produto"
                                rows={2}
                              />
                            </div>

                            <div>
                              <Label>Observações</Label>
                              <Textarea
                                value={productForm.notes}
                                onChange={(e) => setProductForm({ ...productForm, notes: e.target.value })}
                                placeholder="Observações adicionais"
                                rows={2}
                              />
                            </div>

                            <div className="flex justify-end gap-2 pt-4">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setProductDialogOpen(false);
                                  resetProductForm();
                                }}
                              >
                                Cancelar
                              </Button>
                              <Button
                                onClick={handleProductSubmit}
                                disabled={!productForm.name.trim() || createProduct.isPending || updateProduct.isPending}
                              >
                                {createProduct.isPending || updateProduct.isPending ? 'Salvando...' : 'Salvar'}
                              </Button>
                            </div>
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Products List */}
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Estoque</TableHead>
                        <TableHead>Preço</TableHead>
                        <TableHead>Duração</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                            <p>Nenhum produto encontrado</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredProducts.map(product => {
                          const isLowStock = product.current_stock <= (product.min_stock_alert || 0);
                          const duration = product.started_using_at && product.finished_at
                            ? differenceInDays(parseISO(product.finished_at), parseISO(product.started_using_at))
                            : null;

                          return (
                            <TableRow key={product.id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{product.name}</p>
                                  {product.brand && (
                                    <p className="text-xs text-muted-foreground">{product.brand}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="gap-1">
                                  {PRODUCT_TYPES.find(t => t.value === product.product_type)?.icon}
                                  {getTypeLabel(product.product_type)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className={cn(isLowStock && 'text-destructive font-medium')}>
                                  {product.current_stock} {getUnitLabel(product.unit)}
                                </span>
                                {isLowStock && (
                                  <AlertTriangle className="inline-block ml-1 h-4 w-4 text-destructive" />
                                )}
                              </TableCell>
                              <TableCell>
                                <span className="font-medium">R$ {product.total_price.toFixed(2)}</span>
                              </TableCell>
                              <TableCell>
                                {duration !== null ? (
                                  <div className="flex items-center gap-1 text-sm">
                                    <Clock className="h-3 w-3" />
                                    {duration} dias
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={product.is_active ? 'default' : 'secondary'}>
                                  {product.is_active ? 'Ativo' : 'Inativo'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex gap-1 justify-end">
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openEditProduct(product)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
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
                                            onClick={() => handleDeleteProduct(product.id)}
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
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Purchases Tab */}
          <TabsContent value="purchases" className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">Histórico de Compras</h3>
                  {canEdit && (
                    <Dialog open={purchaseDialogOpen} onOpenChange={(open) => {
                      setPurchaseDialogOpen(open);
                      if (!open) resetPurchaseForm();
                    }}>
                      <DialogTrigger asChild>
                        <Button className="gap-2">
                          <Plus className="h-4 w-4" />
                          Nova Compra
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg max-h-[90vh]">
                        <DialogHeader>
                          <DialogTitle>
                            {editingPurchase ? 'Editar Compra' : 'Nova Compra'}
                          </DialogTitle>
                          <DialogDescription>
                            {editingPurchase ? 'Atualize os dados da compra' : 'Registre uma nova compra de produto'}
                          </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="max-h-[60vh] pr-4">
                          <div className="space-y-4">
                            <div>
                              <Label>Produto *</Label>
                              <Select
                                value={purchaseForm.product_id}
                                onValueChange={(v) => setPurchaseForm({ ...purchaseForm, product_id: v })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione um produto" />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.map(product => (
                                    <SelectItem key={product.id} value={product.id}>
                                      {product.name} {product.brand && `(${product.brand})`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <Label>Quantidade</Label>
                                <Input
                                  type="number"
                                  value={purchaseForm.quantity}
                                  onChange={(e) => updatePurchaseTotal(parseFloat(e.target.value) || 0, purchaseForm.unit_price)}
                                  min="0"
                                  step="0.01"
                                />
                              </div>

                              <div>
                                <Label>Preço Unit. (R$)</Label>
                                <Input
                                  type="number"
                                  value={purchaseForm.unit_price}
                                  onChange={(e) => updatePurchaseTotal(purchaseForm.quantity, parseFloat(e.target.value) || 0)}
                                  min="0"
                                  step="0.01"
                                />
                              </div>

                              <div>
                                <Label>Total (R$)</Label>
                                <Input
                                  type="number"
                                  value={purchaseForm.total_price}
                                  readOnly
                                  className="bg-muted"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Fornecedor</Label>
                                <Input
                                  value={purchaseForm.supplier}
                                  onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier: e.target.value })}
                                  placeholder="Nome do fornecedor"
                                />
                              </div>

                              <div>
                                <Label>Data da Compra</Label>
                                <Input
                                  type="date"
                                  value={purchaseForm.purchase_date}
                                  onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })}
                                />
                              </div>
                            </div>

                            <Separator />

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Começou a Usar em</Label>
                                <Input
                                  type="date"
                                  value={purchaseForm.started_using_at}
                                  onChange={(e) => setPurchaseForm({ ...purchaseForm, started_using_at: e.target.value })}
                                />
                              </div>

                              <div>
                                <Label>Terminou em</Label>
                                <Input
                                  type="date"
                                  value={purchaseForm.finished_at}
                                  onChange={(e) => setPurchaseForm({ ...purchaseForm, finished_at: e.target.value })}
                                />
                              </div>
                            </div>

                            <div>
                              <Label>Observações</Label>
                              <Textarea
                                value={purchaseForm.notes}
                                onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                                placeholder="Observações sobre a compra"
                                rows={2}
                              />
                            </div>

                            <div className="flex justify-end gap-2 pt-4">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setPurchaseDialogOpen(false);
                                  resetPurchaseForm();
                                }}
                              >
                                Cancelar
                              </Button>
                              <Button
                                onClick={handlePurchaseSubmit}
                                disabled={!purchaseForm.product_id || createPurchase.isPending || updatePurchase.isPending}
                              >
                                {createPurchase.isPending || updatePurchase.isPending ? 'Salvando...' : 'Salvar'}
                              </Button>
                            </div>
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Quantidade</TableHead>
                        <TableHead>Preço</TableHead>
                        <TableHead>Data Compra</TableHead>
                        <TableHead>Uso</TableHead>
                        <TableHead>Duração</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-20" />
                            <p>Nenhuma compra registrada</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        purchases.map(purchase => (
                          <TableRow key={purchase.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{purchase.product?.name || '-'}</p>
                                {purchase.product?.brand && (
                                  <p className="text-xs text-muted-foreground">{purchase.product.brand}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {purchase.quantity} {purchase.product && getUnitLabel(purchase.product.unit)}
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">R$ {purchase.total_price.toFixed(2)}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-sm">
                                <Calendar className="h-3 w-3" />
                                {format(parseISO(purchase.purchase_date), 'dd/MM/yyyy', { locale: ptBR })}
                              </div>
                            </TableCell>
                            <TableCell>
                              {purchase.started_using_at ? (
                                <div className="text-xs">
                                  <p>Início: {format(parseISO(purchase.started_using_at), 'dd/MM/yy')}</p>
                                  {purchase.finished_at && (
                                    <p>Fim: {format(parseISO(purchase.finished_at), 'dd/MM/yy')}</p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">Não iniciado</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {purchase.duration_days !== null ? (
                                <Badge variant="outline" className="gap-1">
                                  <Clock className="h-3 w-3" />
                                  {purchase.duration_days} dias
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                {canEdit && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditPurchase(purchase)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
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
                                        <AlertDialogTitle>Excluir Compra</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Tem certeza que deseja excluir esta compra? Esta ação não pode ser desfeita.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDeletePurchase(purchase.id)}
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
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

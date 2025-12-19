import { useState, useMemo } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProducts, useProductPurchases, type Product, type ProductPurchase, type ProductType, type ProductUnit } from '@/hooks/useProducts';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useServices } from '@/hooks/useServices';
import { useServiceProducts } from '@/hooks/useServiceProducts';
import { useAuth } from '@/contexts/AuthContext';
import { ManageSuppliersDialog } from '@/components/produtos/ManageSuppliersDialog';

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
  const { activeSuppliers } = useSuppliers();
  const { activeServices } = useServices();
  const { serviceProducts, createServiceProduct } = useServiceProducts();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('receptionist');
  const canDelete = hasRole('admin');

  // Product Dialog State
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
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
    current_stock: 0,
    min_stock_alert: 0,
    notes: '',
    is_active: true,
    is_for_sale: false,
    sale_price: 0,
  });

  // Purchase Dialog State
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<ProductPurchase | null>(null);
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

  // Low stock products
  const lowStockProducts = useMemo(() => {
    return products.filter(p => p.current_stock <= (p.min_stock_alert || 0) && p.is_active);
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
      current_stock: 0,
      min_stock_alert: 0,
      notes: '',
      is_active: true,
      is_for_sale: false,
      sale_price: 0,
    });
    setEditingProduct(null);
    setSelectedServiceId('');
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
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    // Find linked service
    const linkedService = serviceProducts.find(sp => sp.product_id === product.id);
    setSelectedServiceId(linkedService?.service_id || '');
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
      current_stock: product.current_stock,
      min_stock_alert: product.min_stock_alert || 0,
      notes: product.notes || '',
      is_active: product.is_active,
      is_for_sale: product.is_for_sale || false,
      sale_price: product.sale_price || 0,
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
      finished_at: null,
      notes: productForm.notes || null,
    };

    let productId = editingProduct?.id;

    if (editingProduct) {
      await updateProduct.mutateAsync({ id: editingProduct.id, ...productData });
    } else {
      const newProduct = await createProduct.mutateAsync(productData);
      productId = newProduct.id;
    }

    // Link to service if selected
    if (selectedServiceId && productId) {
      const existingLink = serviceProducts.find(sp => sp.product_id === productId && sp.service_id === selectedServiceId);
      if (!existingLink) {
        await createServiceProduct.mutateAsync({
          service_id: selectedServiceId,
          product_id: productId,
          quantity_per_use: 1,
          notes: null,
        });
      }
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

  const handleUpdateFinishedAt = async (productId: string, finishedAt: string) => {
    await updateProduct.mutateAsync({ 
      id: productId, 
      finished_at: finishedAt || null 
    });
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

  // Update unit price when total price changes
  const updateProductFromTotal = (qty: number, total: number) => {
    const unitPrice = qty > 0 ? total / qty : 0;
    setProductForm(prev => ({
      ...prev,
      quantity_purchased: qty,
      unit_price: unitPrice,
      total_price: total,
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
            <TabsTrigger value="low_stock" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Estoque Baixo
              {lowStockProducts.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {lowStockProducts.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-4">
            {/* Action Buttons - Only essentials */}
            <div className="flex gap-2 flex-wrap">
              {canEdit && (
                <Dialog open={productDialogOpen} onOpenChange={(open) => {
                  setProductDialogOpen(open);
                  if (!open) resetProductForm();
                }}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="h-4 w-4" />
                      Cadastro de Produtos
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

                        {/* Link to Service */}
                        <div>
                          <Label>Vincular ao Serviço</Label>
                          <Select
                            value={selectedServiceId || "none"}
                            onValueChange={(v) => setSelectedServiceId(v === "none" ? "" : v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um serviço (opcional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhum</SelectItem>
                              {activeServices.map(service => (
                                <SelectItem key={service.id} value={service.id}>
                                  {service.name} ({service.category})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label>Quantidade Comprada</Label>
                            <Input
                              type="number"
                              value={productForm.quantity_purchased}
                              onChange={(e) => {
                                const qty = parseFloat(e.target.value) || 0;
                                updateProductTotal(qty, productForm.unit_price);
                              }}
                              min="0"
                              step="0.01"
                            />
                          </div>

                          <div>
                            <Label>Preço Unitário (R$)</Label>
                            <Input
                              type="number"
                              value={productForm.unit_price || ''}
                              onChange={(e) => {
                                const price = parseFloat(e.target.value) || 0;
                                updateProductTotal(productForm.quantity_purchased, price);
                              }}
                              min="0"
                              step="0.01"
                              placeholder="0,00"
                            />
                          </div>

                          <div>
                            <Label>Preço Total (R$)</Label>
                            <Input
                              type="number"
                              value={productForm.total_price || ''}
                              onChange={(e) => {
                                const total = parseFloat(e.target.value) || 0;
                                updateProductFromTotal(productForm.quantity_purchased, total);
                              }}
                              min="0"
                              step="0.01"
                              placeholder="0,00"
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
                              value={productForm.supplier_id || "none"}
                              onValueChange={(v) => {
                                const actualValue = v === "none" ? "" : v;
                                const supplier = activeSuppliers.find(s => s.id === actualValue);
                                setProductForm({ 
                                  ...productForm, 
                                  supplier_id: actualValue,
                                  supplier: supplier?.name || productForm.supplier 
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione um fornecedor" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Nenhum</SelectItem>
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

                          <div className="flex items-center gap-2 pt-2">
                            <input
                              type="checkbox"
                              id="is_for_sale"
                              checked={productForm.is_for_sale}
                              onChange={(e) => setProductForm({ ...productForm, is_for_sale: e.target.checked })}
                              className="h-4 w-4 rounded border-input"
                            />
                            <Label htmlFor="is_for_sale" className="cursor-pointer">
                              Produto para Venda
                            </Label>
                          </div>

                          {productForm.is_for_sale && (
                            <div>
                              <Label>Preço de Venda (R$)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={productForm.sale_price}
                                onChange={(e) => setProductForm({ ...productForm, sale_price: parseFloat(e.target.value) || 0 })}
                                placeholder="0.00"
                              />
                            </div>
                          )}
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

              <Dialog open={purchaseDialogOpen} onOpenChange={(open) => {
                setPurchaseDialogOpen(open);
                if (!open) resetPurchaseForm();
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <ShoppingCart className="h-4 w-4" />
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

              <ManageSuppliersDialog />
            </div>

            {/* Products List with horizontal scroll */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[1000px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Estoque</TableHead>
                        <TableHead>Preço Custo</TableHead>
                        <TableHead>Para Venda</TableHead>
                        <TableHead>Duração</TableHead>
                        <TableHead>Terminou em</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                            <p>Nenhum produto cadastrado</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        products.map(product => {
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
                                {product.is_for_sale ? (
                                  <div>
                                    <Badge variant="default" className="bg-green-600">Sim</Badge>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      R$ {(product.sale_price || 0).toFixed(2)}
                                    </p>
                                  </div>
                                ) : (
                                  <Badge variant="secondary">Não</Badge>
                                )}
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
                                <Input
                                  type="date"
                                  value={product.finished_at || ''}
                                  onChange={(e) => handleUpdateFinishedAt(product.id, e.target.value)}
                                  className="w-32 h-8 text-xs"
                                />
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
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Purchases Tab */}
          <TabsContent value="purchases" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[900px]">
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
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Low Stock Alert Tab */}
          <TabsContent value="low_stock" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Estoque Atual</TableHead>
                        <TableHead>Estoque Mínimo</TableHead>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowStockProducts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-20" />
                            <p>Nenhum produto com estoque baixo</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        lowStockProducts.map(product => (
                          <TableRow key={product.id} className="bg-destructive/5">
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
                              <span className="text-destructive font-bold">
                                {product.current_stock} {getUnitLabel(product.unit)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {product.min_stock_alert || 0} {getUnitLabel(product.unit)}
                            </TableCell>
                            <TableCell>
                              {product.supplier || '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => {
                                  setPurchaseForm(prev => ({
                                    ...prev,
                                    product_id: product.id,
                                  }));
                                  setPurchaseDialogOpen(true);
                                }}
                              >
                                <Plus className="h-3 w-3" />
                                Comprar
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

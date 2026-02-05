import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Calculator, 
  Package, 
  DollarSign, 
  Percent, 
  TrendingUp,
  Info,
  Sparkles,
  BarChart3,
  Plus,
  Trash2,
  RefreshCw,
  Check,
  AlertTriangle,
  Clock,
  Layers
} from 'lucide-react';
import { useServices } from '@/hooks/useServices';
import { useProducts, Product } from '@/hooks/useProducts';
import { useServiceProducts, ServiceProduct } from '@/hooks/useServiceProducts';
import { usePackageTemplates } from '@/hooks/usePackageTemplates';
import { usePackageTemplateProducts } from '@/hooks/usePackageTemplateProducts';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ManualCost {
  id: string;
  description: string;
  amount: number;
  type: 'fixed' | 'per_service';
}

type CalculationType = 'service' | 'package';

export function PrecificacaoServicos() {
  const { services, activeServices } = useServices();
  const { products, activeProducts } = useProducts();
  const { serviceProducts } = useServiceProducts();
  const { templates } = usePackageTemplates();
  const { templateProducts } = usePackageTemplateProducts();
  const { payables } = useFinancialEntries();
  const { expenseCategories } = useFinancialCategories();

  const [calculationType, setCalculationType] = useState<CalculationType>('service');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [profitType, setProfitType] = useState<'percentage' | 'fixed'>('percentage');
  const [profitValue, setProfitValue] = useState<number>(30);
  const [servicesPerMonth, setServicesPerMonth] = useState<number>(20);
  const [packagesPerMonth, setPackagesPerMonth] = useState<number>(5);
  const [workingHoursPerMonth, setWorkingHoursPerMonth] = useState<number>(176);
  const [manualCosts, setManualCosts] = useState<ManualCost[]>([]);
  const [newCostDesc, setNewCostDesc] = useState('');
  const [newCostAmount, setNewCostAmount] = useState('');
  const [newCostType, setNewCostType] = useState<'fixed' | 'per_service'>('fixed');
  const [activeTab, setActiveTab] = useState('calculator');

  const selectedService = activeServices.find(s => s.id === selectedServiceId);
  const selectedPackage = templates.find(t => t.id === selectedPackageId);
  
  // Get products linked to selected service
  const linkedServiceProducts = useMemo(() => {
    if (!selectedServiceId) return [];
    return serviceProducts.filter(sp => sp.service_id === selectedServiceId);
  }, [selectedServiceId, serviceProducts]);

  // Get products linked to selected package template
  const linkedPackageProducts = useMemo(() => {
    if (!selectedPackageId) return [];
    return templateProducts.filter(tp => tp.template_id === selectedPackageId);
  }, [selectedPackageId, templateProducts]);

  // Use appropriate linked products based on calculation type
  const linkedProducts = calculationType === 'service' ? linkedServiceProducts : linkedPackageProducts;

  // Calculate product costs for service or package
  const productCosts = useMemo(() => {
    return linkedProducts.map(sp => {
      const product = sp.product;
      if (!product) return { 
        ...sp, 
        costPerUse: 0,
        productName: 'Produto não encontrado',
        productUnit: 'un',
      };
      
      // Calculate cost per unit based on product pricing
      const costPerUnit = product.unit_price;
      const costPerUse = costPerUnit * sp.quantity_per_use;
      
      return {
        ...sp,
        costPerUse,
        productName: product.name,
        productUnit: product.unit,
      };
    });
  }, [linkedProducts]);

  // For packages, multiply product costs by total sessions
  const totalProductCost = useMemo(() => {
    const baseCost = productCosts.reduce((sum, pc) => sum + pc.costPerUse, 0);
    if (calculationType === 'package' && selectedPackage) {
      return baseCost * selectedPackage.total_sessions;
    }
    return baseCost;
  }, [productCosts, calculationType, selectedPackage]);

  // Calculate monthly fixed costs (from financial entries - expenses)
  const monthlyFixedCosts = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return payables.filter(entry => {
      const dueDate = new Date(entry.due_date);
      return dueDate.getMonth() === currentMonth && 
             dueDate.getFullYear() === currentYear &&
             entry.status !== 'cancelled';
    }).reduce((sum, entry) => sum + Number(entry.amount), 0);
  }, [payables]);

  // Fixed cost per item (distributed) - use appropriate monthly count
  const itemsPerMonth = calculationType === 'service' ? servicesPerMonth : packagesPerMonth;
  const fixedCostPerItem = itemsPerMonth > 0 
    ? monthlyFixedCosts / itemsPerMonth 
    : 0;

  // Manual additional costs
  const totalManualFixedCosts = manualCosts
    .filter(c => c.type === 'fixed')
    .reduce((sum, c) => sum + c.amount, 0);
  
  const totalManualPerItemCosts = manualCosts
    .filter(c => c.type === 'per_service')
    .reduce((sum, c) => sum + c.amount, 0);

  const manualFixedCostPerItem = itemsPerMonth > 0 
    ? totalManualFixedCosts / itemsPerMonth 
    : 0;

  // Item duration cost (hourly rate calculation)
  const itemDuration = calculationType === 'service' 
    ? (selectedService?.duration || 60)
    : (selectedPackage ? selectedPackage.duration * selectedPackage.total_sessions : 60);
  
  const hourlyOperatingCost = workingHoursPerMonth > 0 
    ? monthlyFixedCosts / workingHoursPerMonth 
    : 0;
  const timeCost = (itemDuration / 60) * hourlyOperatingCost;

  // Total base cost
  const totalBaseCost = totalProductCost + fixedCostPerItem + manualFixedCostPerItem + totalManualPerItemCosts;
  
  // Including time cost
  const totalCostWithTime = totalBaseCost + timeCost;

  // Calculate suggested price based on profit margin
  const calculateSuggestedPrice = (baseCost: number) => {
    if (profitType === 'percentage') {
      // Price = Cost / (1 - margin%)
      const margin = profitValue / 100;
      if (margin >= 1) return baseCost * 3; // Cap at 3x if margin >= 100%
      return baseCost / (1 - margin);
    } else {
      // Fixed profit
      return baseCost + profitValue;
    }
  };

  const suggestedPrice = calculateSuggestedPrice(totalCostWithTime);
  const actualProfit = suggestedPrice - totalCostWithTime;
  const actualMargin = suggestedPrice > 0 ? (actualProfit / suggestedPrice) * 100 : 0;

  // Current price comparison - works for both services and packages
  const currentPrice = calculationType === 'service' 
    ? (selectedService?.price || 0)
    : (selectedPackage?.price || 0);
  const currentProfit = currentPrice - totalCostWithTime;
  const currentMargin = currentPrice > 0 ? (currentProfit / currentPrice) * 100 : 0;
  const isProfitable = currentProfit > 0;

  // Selected item name and duration for display
  const selectedItemName = calculationType === 'service' 
    ? selectedService?.name 
    : selectedPackage?.name;
  const selectedItemDuration = calculationType === 'service'
    ? selectedService?.duration
    : (selectedPackage ? selectedPackage.duration * selectedPackage.total_sessions : 0);
  const hasSelectedItem = calculationType === 'service' ? !!selectedServiceId : !!selectedPackageId;

  const addManualCost = () => {
    if (!newCostDesc.trim() || !newCostAmount) return;
    
    const amount = parseFloat(newCostAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Valor inválido');
      return;
    }

    setManualCosts([
      ...manualCosts,
      {
        id: Date.now().toString(),
        description: newCostDesc.trim(),
        amount,
        type: newCostType,
      }
    ]);
    setNewCostDesc('');
    setNewCostAmount('');
  };

  const removeManualCost = (id: string) => {
    setManualCosts(manualCosts.filter(c => c.id !== id));
  };

  // All services pricing analysis
  const allServicesAnalysis = useMemo(() => {
    return activeServices.map(service => {
      const serviceLinkedProducts = serviceProducts.filter(sp => sp.service_id === service.id);
      
      const productCost = serviceLinkedProducts.reduce((sum, sp) => {
        const product = sp.product;
        if (!product) return sum;
        return sum + (product.unit_price * sp.quantity_per_use);
      }, 0);

      const fixedCostShare = servicesPerMonth > 0 ? monthlyFixedCosts / servicesPerMonth : 0;
      const serviceTimeCost = workingHoursPerMonth > 0 
        ? ((service.duration / 60) * (monthlyFixedCosts / workingHoursPerMonth))
        : 0;

      const totalCost = productCost + fixedCostShare + serviceTimeCost;
      const profit = service.price - totalCost;
      const margin = service.price > 0 ? (profit / service.price) * 100 : 0;

      return {
        service,
        productCost,
        fixedCostShare,
        timeCost: serviceTimeCost,
        totalCost,
        profit,
        margin,
        isProfitable: profit > 0,
      };
    }).sort((a, b) => a.margin - b.margin);
  }, [activeServices, serviceProducts, monthlyFixedCosts, servicesPerMonth, workingHoursPerMonth]);

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="calculator" className="text-xs gap-1.5">
            <Calculator className="h-3.5 w-3.5" />
            Calculadora
          </TabsTrigger>
          <TabsTrigger value="analysis" className="text-xs gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Análise Geral
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calculator" className="space-y-4 mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Configuration Panel */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Configuração
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Type toggle */}
                <div className="space-y-2">
                  <Label className="text-xs">Tipo de Cálculo</Label>
                  <RadioGroup 
                    value={calculationType} 
                    onValueChange={(v) => {
                      setCalculationType(v as CalculationType);
                      setSelectedServiceId('');
                      setSelectedPackageId('');
                    }}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="service" id="type-service" />
                      <Label htmlFor="type-service" className="text-xs font-normal cursor-pointer flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        Serviço
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="package" id="type-package" />
                      <Label htmlFor="type-package" className="text-xs font-normal cursor-pointer flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        Pacote
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <Separator />

                {/* Service/Package selector based on type */}
                {calculationType === 'service' ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Serviço</Label>
                    <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione um serviço..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeServices.map(service => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.name} - R$ {service.price.toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-xs">Pacote</Label>
                    <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione um pacote..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name} ({template.total_sessions} sessões) - R$ {template.price.toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Separator />

                {calculationType === 'service' ? (
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      Serviços por Mês
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Quantidade média de atendimentos mensais para este serviço</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={servicesPerMonth}
                      onChange={(e) => setServicesPerMonth(parseInt(e.target.value) || 1)}
                      className="h-9"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      Pacotes por Mês
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Quantidade média de pacotes vendidos mensalmente</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={packagesPerMonth}
                      onChange={(e) => setPackagesPerMonth(parseInt(e.target.value) || 1)}
                      className="h-9"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1">
                    Horas Trabalhadas/Mês
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Total de horas de trabalho por mês (176h = 8h/dia × 22 dias)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={workingHoursPerMonth}
                    onChange={(e) => setWorkingHoursPerMonth(parseInt(e.target.value) || 1)}
                    className="h-9"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-xs">Tipo de Lucro</Label>
                  <Select value={profitType} onValueChange={(v) => setProfitType(v as 'percentage' | 'fixed')}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Margem Percentual (%)</SelectItem>
                      <SelectItem value="fixed">Lucro Fixo (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">
                    {profitType === 'percentage' ? 'Margem de Lucro (%)' : 'Lucro Desejado (R$)'}
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      step={profitType === 'percentage' ? 1 : 0.01}
                      value={profitValue}
                      onChange={(e) => setProfitValue(parseFloat(e.target.value) || 0)}
                      className="h-9 pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {profitType === 'percentage' ? '%' : 'R$'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cost Breakdown */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  Composição de Custos
                </CardTitle>
                {hasSelectedItem && (
                  <CardDescription className="text-xs">
                    {selectedItemName} • {selectedItemDuration} min
                    {calculationType === 'package' && selectedPackage && (
                      <span> • {selectedPackage.total_sessions} sessões</span>
                    )}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {!hasSelectedItem ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calculator className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Selecione {calculationType === 'service' ? 'um serviço' : 'um pacote'} para calcular</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[350px]">
                    <div className="space-y-4 pr-2">
                      {/* Product Costs */}
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5" />
                          Custos de Produtos
                          {calculationType === 'package' && selectedPackage && (
                            <Badge variant="outline" className="text-[9px] px-1">
                              × {selectedPackage.total_sessions} sessões
                            </Badge>
                          )}
                        </h4>
                        {productCosts.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic p-2 bg-muted/30 rounded">
                            Nenhum produto vinculado a este {calculationType === 'service' ? 'serviço' : 'pacote'}
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {productCosts.map((pc, i) => (
                              <div key={i} className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                                <span>{pc.productName} ({pc.quantity_per_use} {pc.productUnit})</span>
                                <span className="font-medium">R$ {pc.costPerUse.toFixed(2)}</span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between p-2 bg-primary/10 rounded text-xs font-medium">
                              <span>Subtotal Produtos</span>
                              <span>R$ {totalProductCost.toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Fixed Costs */}
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          <DollarSign className="h-3.5 w-3.5" />
                          Custos Fixos (Rateio)
                        </h4>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                            <span className="flex items-center gap-1">
                              Despesas Mensais
                              <Badge variant="outline" className="text-[9px] px-1">
                                R$ {monthlyFixedCosts.toFixed(0)}/mês
                              </Badge>
                            </span>
                            <span className="font-medium">R$ {fixedCostPerItem.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Custo do Tempo ({itemDuration} min)
                              <Badge variant="outline" className="text-[9px] px-1">
                                R$ {hourlyOperatingCost.toFixed(2)}/h
                              </Badge>
                            </span>
                            <span className="font-medium">R$ {timeCost.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Manual Costs */}
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Plus className="h-3.5 w-3.5" />
                          Custos Adicionais
                        </h4>
                        <div className="space-y-2">
                          {manualCosts.map(cost => (
                            <div key={cost.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                              <span>
                                {cost.description}
                                <Badge variant="outline" className="ml-1 text-[9px] px-1">
                                  {cost.type === 'fixed' ? 'Fixo/mês' : 'Por serviço'}
                                </Badge>
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  R$ {cost.type === 'fixed' 
                                    ? (servicesPerMonth > 0 ? cost.amount / servicesPerMonth : 0).toFixed(2)
                                    : cost.amount.toFixed(2)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-destructive"
                                  onClick={() => removeManualCost(cost.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          
                          {/* Add new cost */}
                          <div className="flex gap-2 items-end p-2 border border-dashed rounded">
                            <div className="flex-1 space-y-1">
                              <Label className="text-[10px]">Descrição</Label>
                              <Input
                                value={newCostDesc}
                                onChange={(e) => setNewCostDesc(e.target.value)}
                                placeholder="Ex: Energia, Aluguel..."
                                className="h-7 text-xs"
                              />
                            </div>
                            <div className="w-24 space-y-1">
                              <Label className="text-[10px]">Valor (R$)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={newCostAmount}
                                onChange={(e) => setNewCostAmount(e.target.value)}
                                placeholder="0,00"
                                className="h-7 text-xs"
                              />
                            </div>
                            <div className="w-28 space-y-1">
                              <Label className="text-[10px]">Tipo</Label>
                              <Select value={newCostType} onValueChange={(v) => setNewCostType(v as 'fixed' | 'per_service')}>
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="fixed" className="text-xs">Fixo/mês</SelectItem>
                                  <SelectItem value="per_service" className="text-xs">Por serviço</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Button 
                              size="sm" 
                              className="h-7 px-2"
                              onClick={addManualCost}
                              disabled={!newCostDesc || !newCostAmount}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Results */}
          {hasSelectedItem && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Suggested Price */}
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-primary">
                      <TrendingUp className="h-4 w-4" />
                      Preço Sugerido
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="text-3xl font-bold text-primary">
                        R$ {suggestedPrice.toFixed(2)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 bg-background rounded">
                          <span className="text-muted-foreground">Custo Total</span>
                          <p className="font-medium">R$ {totalCostWithTime.toFixed(2)}</p>
                        </div>
                        <div className="p-2 bg-background rounded">
                          <span className="text-muted-foreground">Lucro</span>
                          <p className="font-medium text-green-600">R$ {actualProfit.toFixed(2)}</p>
                        </div>
                        <div className="p-2 bg-background rounded">
                          <span className="text-muted-foreground">Margem</span>
                          <p className="font-medium">{actualMargin.toFixed(1)}%</p>
                        </div>
                        <div className="p-2 bg-background rounded">
                          <span className="text-muted-foreground">
                            Lucro por {calculationType === 'service' ? 'Serviço' : 'Pacote'}
                          </span>
                          <p className="font-medium text-green-600">+{profitType === 'percentage' ? profitValue + '%' : 'R$ ' + profitValue.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Current Price Analysis */}
                <Card className={cn(
                  "border",
                  isProfitable ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/20" : "border-red-500/30 bg-red-50/50 dark:bg-red-950/20"
                )}>
                  <CardHeader className="pb-2">
                    <CardTitle className={cn(
                      "text-sm flex items-center gap-2",
                      isProfitable ? "text-green-600" : "text-red-600"
                    )}>
                      {isProfitable ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      Preço Atual: R$ {currentPrice.toFixed(2)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className={cn(
                        "text-3xl font-bold",
                        isProfitable ? "text-green-600" : "text-red-600"
                      )}>
                        {isProfitable ? '+' : ''} R$ {currentProfit.toFixed(2)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 bg-background rounded">
                          <span className="text-muted-foreground">Custo Total</span>
                          <p className="font-medium">R$ {totalCostWithTime.toFixed(2)}</p>
                        </div>
                        <div className="p-2 bg-background rounded">
                          <span className="text-muted-foreground">Margem Atual</span>
                          <p className={cn("font-medium", currentMargin >= 0 ? "text-green-600" : "text-red-600")}>
                            {currentMargin.toFixed(1)}%
                          </p>
                        </div>
                        <div className="p-2 bg-background rounded col-span-2">
                          <span className="text-muted-foreground">Diagnóstico</span>
                          <p className="font-medium text-xs">
                            {currentProfit >= actualProfit 
                              ? '✓ Acima do lucro desejado' 
                              : currentProfit > 0 
                                ? '⚠️ Abaixo do lucro desejado' 
                                : '✗ Operando com prejuízo'}
                          </p>
                        </div>
                      </div>
                      {!isProfitable && (
                        <p className="text-xs text-red-600">
                          Aumente o preço em pelo menos R$ {Math.abs(currentProfit).toFixed(2)} para não ter prejuízo.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Goal Suggestion Panel - How many appointments needed */}
              <Card className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-blue-600">
                    <BarChart3 className="h-4 w-4" />
                    Sugestão de Meta Mensal
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Quantos {calculationType === 'service' ? 'atendimentos' : 'pacotes'} você precisa realizar para cobrir despesas e ter lucro
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Break-even calculation */}
                    {(() => {
                      // Calculate appointments needed to cover monthly expenses
                      const profitPerItem = currentProfit;
                      const appointmentsToBreakEven = profitPerItem > 0 
                        ? Math.ceil(monthlyFixedCosts / profitPerItem)
                        : Infinity;
                      
                      // Appointments needed for different profit targets
                      const targetProfit1000 = profitPerItem > 0 
                        ? Math.ceil((monthlyFixedCosts + 1000) / profitPerItem)
                        : Infinity;
                      const targetProfit3000 = profitPerItem > 0 
                        ? Math.ceil((monthlyFixedCosts + 3000) / profitPerItem)
                        : Infinity;
                      const targetProfit5000 = profitPerItem > 0 
                        ? Math.ceil((monthlyFixedCosts + 5000) / profitPerItem)
                        : Infinity;
                        
                      const itemLabel = calculationType === 'service' ? 'atendimentos' : 'pacotes';
                      
                      return (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="p-3 bg-background rounded-lg border">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full bg-yellow-500" />
                              <span className="text-xs text-muted-foreground">Ponto de Equilíbrio</span>
                            </div>
                            <p className="text-lg font-bold">
                              {profitPerItem > 0 ? appointmentsToBreakEven : '∞'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {itemLabel}/mês para cobrir R$ {monthlyFixedCosts.toFixed(0)} em despesas
                            </p>
                          </div>
                          
                          <div className="p-3 bg-background rounded-lg border border-green-200">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-xs text-muted-foreground">Lucro R$ 1.000</span>
                            </div>
                            <p className="text-lg font-bold text-green-600">
                              {profitPerItem > 0 ? targetProfit1000 : '∞'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {itemLabel}/mês
                            </p>
                          </div>
                          
                          <div className="p-3 bg-background rounded-lg border border-green-300">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full bg-green-600" />
                              <span className="text-xs text-muted-foreground">Lucro R$ 3.000</span>
                            </div>
                            <p className="text-lg font-bold text-green-600">
                              {profitPerItem > 0 ? targetProfit3000 : '∞'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {itemLabel}/mês
                            </p>
                          </div>
                          
                          <div className="p-3 bg-background rounded-lg border border-green-400">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full bg-green-700" />
                              <span className="text-xs text-muted-foreground">Lucro R$ 5.000</span>
                            </div>
                            <p className="text-lg font-bold text-green-600">
                              {profitPerItem > 0 ? targetProfit5000 : '∞'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {itemLabel}/mês
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                    
                    {/* Warning if not profitable */}
                    {!isProfitable && (
                      <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Este {calculationType === 'service' ? 'serviço' : 'pacote'} opera com prejuízo. 
                          Ajuste o preço para ver as sugestões de meta.
                        </p>
                      </div>
                    )}
                    
                    {/* Tips */}
                    <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded">
                      <strong>Dica:</strong> Os custos fixos (R$ {monthlyFixedCosts.toFixed(0)}/mês) são rateados entre todos os serviços e pacotes. 
                      O lucro por {calculationType === 'service' ? 'serviço' : 'pacote'} atual é de R$ {currentProfit.toFixed(2)}.
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="analysis" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Análise de Rentabilidade - Todos os Serviços
              </CardTitle>
              <CardDescription className="text-xs">
                Baseado em {servicesPerMonth} serviços/mês e {workingHoursPerMonth}h trabalhadas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Serviço</TableHead>
                      <TableHead className="text-xs text-right">Preço</TableHead>
                      <TableHead className="text-xs text-right">Custo</TableHead>
                      <TableHead className="text-xs text-right">Lucro</TableHead>
                      <TableHead className="text-xs text-right">Margem</TableHead>
                      <TableHead className="text-xs text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allServicesAnalysis.map(({ service, totalCost, profit, margin, isProfitable }) => (
                      <TableRow key={service.id}>
                        <TableCell className="text-xs font-medium">
                          <div>
                            {service.name}
                            <span className="block text-[10px] text-muted-foreground">
                              {service.duration} min • {service.category}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          R$ {service.price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          R$ {totalCost.toFixed(2)}
                        </TableCell>
                        <TableCell className={cn(
                          "text-xs text-right font-medium",
                          profit >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {profit >= 0 ? '+' : ''} R$ {profit.toFixed(2)}
                        </TableCell>
                        <TableCell className={cn(
                          "text-xs text-right font-medium",
                          margin >= 30 ? "text-green-600" : margin >= 0 ? "text-yellow-600" : "text-red-600"
                        )}>
                          {margin.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-center">
                          {isProfitable ? (
                            margin >= 30 ? (
                              <Badge className="bg-green-100 text-green-700 text-[10px]">
                                Saudável
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-700 text-[10px]">
                                Margem Baixa
                              </Badge>
                            )
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">
                              Prejuízo
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

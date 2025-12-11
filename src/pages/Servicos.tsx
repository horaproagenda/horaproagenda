import React, { useState, useEffect } from 'react';
import { Plus, Sparkles, Filter, Loader2, Package, FolderPlus } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ServiceCard } from '@/components/services/ServiceCard';
import { NewServiceDialog } from '@/components/services/NewServiceDialog';
import { NewPackageDialog } from '@/components/services/NewPackageDialog';
import { ServiceDetailDialog } from '@/components/services/ServiceDetailDialog';
import { PackageDetailDialog } from '@/components/services/PackageDetailDialog';
import { NewCategoryDialog } from '@/components/services/NewCategoryDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useServices } from '@/hooks/useServices';
import { useServicePackages } from '@/hooks/useServicePackages';
import { cn } from '@/lib/utils';
import { Service } from '@/types';
import { Tables } from '@/integrations/supabase/types';

type ServicePackageDB = Tables<'service_packages'>;

// Default categories
const defaultCategories = [
  'Cabelo',
  'Unhas',
  'Estética',
  'Massagem',
  'Maquiagem',
  'Depilação',
  'Tratamentos',
  'Outros',
];

const Servicos: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('services');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ServicePackageDB | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const { services, isLoading, refetch } = useServices();
  const { packages, isLoading: packagesLoading, refetch: refetchPackages } = useServicePackages();

  // Load custom categories from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('customCategories');
    if (saved) {
      setCustomCategories(JSON.parse(saved));
    }
  }, []);

  // Combine default, custom, and existing service categories
  const allCategories = [...new Set([
    ...defaultCategories,
    ...customCategories,
    ...services.map(s => s.category)
  ])].sort();

  // Categories that have services
  const categoriesWithServices = [...new Set(services.map(s => s.category))];
  
  const filteredServices = selectedCategory
    ? services.filter(s => s.category === selectedCategory)
    : services;

  const handleCategoryCreated = (category: string) => {
    const updatedCategories = [...customCategories, category];
    setCustomCategories(updatedCategories);
    localStorage.setItem('customCategories', JSON.stringify(updatedCategories));
  };

  return (
    <AppLayout 
      title="Serviços" 
      subtitle="Catálogo de procedimentos e pacotes"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <TabsList>
            <TabsTrigger value="services">Serviços</TabsTrigger>
            <TabsTrigger value="packages">Pacotes</TabsTrigger>
          </TabsList>
          
          {activeTab === 'services' ? (
            <div className="flex gap-2">
              <NewCategoryDialog 
                existingCategories={allCategories}
                onCategoryCreated={handleCategoryCreated}
              />
              <NewServiceDialog onServiceCreated={refetch} />
            </div>
          ) : (
            <NewPackageDialog onPackageCreated={refetchPackages} />
          )}
        </div>

        <TabsContent value="services" className="mt-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Badge
                variant="outline"
                className={cn(
                  'cursor-pointer transition-colors',
                  !selectedCategory && 'bg-primary text-primary-foreground border-primary'
                )}
                onClick={() => setSelectedCategory(null)}
              >
                Todos
              </Badge>
              {categoriesWithServices.map(category => (
                <Badge
                  key={category}
                  variant="outline"
                  className={cn(
                    'cursor-pointer transition-colors',
                    selectedCategory === category && 'bg-primary text-primary-foreground border-primary'
                  )}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </Badge>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-6 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-display font-semibold">{services.filter(s => s.is_active).length}</p>
                <p className="text-xs text-muted-foreground">Serviços ativos</p>
              </div>
            </div>
            <div className="h-10 w-px bg-border" />
            <div>
              <p className="text-2xl font-display font-semibold">{categoriesWithServices.length}</p>
              <p className="text-xs text-muted-foreground">Categorias</p>
            </div>
            {services.length > 0 && (
              <>
                <div className="h-10 w-px bg-border" />
                <div>
                  <p className="text-2xl font-display font-semibold">
                    R$ {Math.round(services.reduce((acc, s) => acc + Number(s.price), 0) / services.length)}
                  </p>
                  <p className="text-xs text-muted-foreground">Ticket médio</p>
                </div>
              </>
            )}
          </div>

          <div className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredServices.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredServices.map((service, index) => (
                  <div
                    key={service.id}
                    style={{ animationDelay: `${index * 50}ms` }}
                    className="animate-slide-up cursor-pointer"
                    onClick={() => setSelectedService(service)}
                  >
                    <ServiceCard service={service} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
                <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 text-muted-foreground">
                  Nenhum serviço cadastrado
                </p>
                <NewServiceDialog onServiceCreated={refetch}>
                  <Button className="mt-4" variant="secondary">
                    <Plus className="h-4 w-4 mr-2" />
                    Cadastrar Serviço
                  </Button>
                </NewServiceDialog>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="packages" className="mt-0">
          {packagesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : packages.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((pkg) => (
                <Card 
                  key={pkg.id} 
                  className="overflow-hidden cursor-pointer hover:border-primary/30 hover:shadow-lg transition-all"
                  onClick={() => setSelectedPackage(pkg)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-primary/10 p-2">
                          <Package className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle className="text-lg">{pkg.name}</CardTitle>
                      </div>
                      <Badge variant={pkg.is_active ? 'default' : 'secondary'}>
                        {pkg.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {pkg.description && (
                      <p className="text-sm text-muted-foreground">{pkg.description}</p>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-xs text-muted-foreground">Sessões</p>
                        <p className="font-medium">{pkg.total_sessions}</p>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-xs text-muted-foreground">Duração</p>
                        <p className="font-medium">{pkg.duration || 60} min</p>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-xs text-muted-foreground">Intervalo</p>
                        <p className="font-medium">{pkg.interval_days} dias</p>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-xs text-muted-foreground">Agendamento</p>
                        <p className="font-medium">{pkg.auto_schedule ? 'Automático' : 'Manual'}</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t">
                      <span className="text-sm text-muted-foreground">Valor</span>
                      <span className="text-xl font-bold text-primary">
                        R$ {Number(pkg.total_price).toFixed(2)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-muted-foreground">
                Nenhum pacote cadastrado
              </p>
              <NewPackageDialog onPackageCreated={refetchPackages}>
                <Button className="mt-4" variant="secondary">
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Pacote
                </Button>
              </NewPackageDialog>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Service Detail Dialog */}
      {selectedService && (
        <ServiceDetailDialog
          service={selectedService}
          open={!!selectedService}
          onOpenChange={(open) => !open && setSelectedService(null)}
          categories={allCategories}
          onServiceUpdated={refetch}
        />
      )}

      {/* Package Detail Dialog */}
      {selectedPackage && (
        <PackageDetailDialog
          pkg={selectedPackage}
          open={!!selectedPackage}
          onOpenChange={(open) => !open && setSelectedPackage(null)}
          onPackageUpdated={refetchPackages}
        />
      )}
    </AppLayout>
  );
};

export default Servicos;

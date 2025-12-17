import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Sparkles, Loader2, Package, Users } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ServiceCard } from '@/components/services/ServiceCard';
import { NewServiceDialog } from '@/components/services/NewServiceDialog';
import { NewPackageDialog } from '@/components/services/NewPackageDialog';
import { ServiceDetailDialog } from '@/components/services/ServiceDetailDialog';
import { PackageDetailDialog } from '@/components/services/PackageDetailDialog';
import { NewCategoryDialog } from '@/components/services/NewCategoryDialog';
import { ServiceFilters } from '@/components/services/ServiceFilters';
import { PackageFilters } from '@/components/services/PackageFilters';
import { BulkImportDialog } from '@/components/services/BulkImportDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useServices } from '@/hooks/useServices';
import { useServicePackages } from '@/hooks/useServicePackages';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { useClients } from '@/hooks/useClients';
import { useAppointments } from '@/hooks/useAppointments';
import { Service } from '@/types';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type ServicePackageDB = Tables<'service_packages'>;

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
  const [activeTab, setActiveTab] = useState<string>('services');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ServicePackageDB | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  // Service filters
  const [serviceCategory, setServiceCategory] = useState<string | null>(null);
  const [serviceProfessional, setServiceProfessional] = useState<string | null>(null);
  const [serviceRoom, setServiceRoom] = useState<string | null>(null);
  const [serviceClient, setServiceClient] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<string | null>(null);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceSort, setServiceSort] = useState('name-asc');

  // Package filters
  const [packageCategory, setPackageCategory] = useState<string | null>(null);
  const [packageProfessional, setPackageProfessional] = useState<string | null>(null);
  const [packageRoom, setPackageRoom] = useState<string | null>(null);
  const [packageClient, setPackageClient] = useState<string | null>(null);
  const [packageSessions, setPackageSessions] = useState<string | null>(null);
  const [packageStatus, setPackageStatus] = useState<string | null>(null);
  const [packageSearch, setPackageSearch] = useState('');
  const [packageSort, setPackageSort] = useState('name-asc');

  const { services, isLoading, refetch } = useServices();
  const { packages, isLoading: packagesLoading, refetch: refetchPackages } = useServicePackages();
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();
  const { clients } = useClients();
  const { appointments } = useAppointments();

  useEffect(() => {
    const saved = localStorage.getItem('customCategories');
    if (saved) {
      setCustomCategories(JSON.parse(saved));
    }
  }, []);

  const allCategories = [...new Set([
    ...defaultCategories,
    ...customCategories,
    ...services.map(s => s.category),
    ...packages.map(p => p.category).filter(Boolean) as string[]
  ])].sort();

  const categoriesWithServices = [...new Set(services.map(s => s.category))];
  const categoriesWithPackages = [...new Set(packages.map(p => p.category).filter(Boolean))];

  // Get unique clients that have used services (via appointments)
  const serviceClients = useMemo(() => {
    const clientIds = [...new Set(appointments.map(a => a.client_id))];
    return clientIds
      .map(id => clients.find(c => c.id === id))
      .filter(Boolean)
      .map(c => ({ id: c!.id, name: c!.name }));
  }, [appointments, clients]);

  // Get unique clients from packages
  const packageClients = useMemo(() => {
    return [...new Map(
      packages
        .filter(p => p.client_id)
        .map(p => [p.client_id, { id: p.client_id!, name: clients.find(c => c.id === p.client_id)?.name || 'Cliente' }])
    ).values()];
  }, [packages, clients]);

  // Filter and sort services
  const filteredServices = useMemo(() => {
    let result = services.filter(service => {
      if (serviceCategory && service.category !== serviceCategory) return false;
      if (serviceProfessional && service.professional_id !== serviceProfessional) return false;
      if (serviceRoom && service.room_id !== serviceRoom) return false;
      if (serviceStatus === 'active' && !service.is_active) return false;
      if (serviceStatus === 'inactive' && service.is_active) return false;
      if (serviceClient) {
        const serviceAppointments = appointments.filter(a => a.service_id === service.id);
        if (!serviceAppointments.some(a => a.client_id === serviceClient)) return false;
      }
      if (serviceSearch && !service.name.toLowerCase().includes(serviceSearch.toLowerCase())) return false;
      return true;
    });

    // Sort
    result.sort((a, b) => {
      switch (serviceSort) {
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'price-asc': return Number(a.price) - Number(b.price);
        case 'price-desc': return Number(b.price) - Number(a.price);
        case 'date-asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'date-desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default: return 0;
      }
    });

    return result;
  }, [services, serviceCategory, serviceProfessional, serviceRoom, serviceClient, serviceStatus, serviceSearch, serviceSort, appointments]);

  // Filter and sort packages
  const filteredPackages = useMemo(() => {
    let result = packages.filter(pkg => {
      if (packageCategory && pkg.category !== packageCategory) return false;
      if (packageProfessional && pkg.professional_id !== packageProfessional) return false;
      if (packageRoom && pkg.room_id !== packageRoom) return false;
      if (packageClient && pkg.client_id !== packageClient) return false;
      if (packageStatus === 'active' && !pkg.is_active) return false;
      if (packageStatus === 'inactive' && pkg.is_active) return false;
      if (packageSearch && !pkg.name.toLowerCase().includes(packageSearch.toLowerCase())) return false;
      if (packageSessions) {
        if (packageSessions === '10+') {
          if (pkg.total_sessions <= 10) return false;
        } else {
          const num = parseInt(packageSessions);
          if (!isNaN(num) && pkg.total_sessions !== num) return false;
        }
      }
      return true;
    });

    // Sort
    result.sort((a, b) => {
      switch (packageSort) {
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'price-asc': return Number(a.total_price) - Number(b.total_price);
        case 'price-desc': return Number(b.total_price) - Number(a.total_price);
        case 'sessions-asc': return a.total_sessions - b.total_sessions;
        case 'sessions-desc': return b.total_sessions - a.total_sessions;
        case 'date-asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'date-desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default: return 0;
      }
    });

    return result;
  }, [packages, packageCategory, packageProfessional, packageRoom, packageClient, packageSessions, packageStatus, packageSearch, packageSort]);

  const handleCategoryCreated = (category: string) => {
    const updatedCategories = [...customCategories, category];
    setCustomCategories(updatedCategories);
    localStorage.setItem('customCategories', JSON.stringify(updatedCategories));
  };

  const clearServiceFilters = () => {
    setServiceCategory(null);
    setServiceProfessional(null);
    setServiceRoom(null);
    setServiceClient(null);
    setServiceStatus(null);
    setServiceSearch('');
  };

  const clearPackageFilters = () => {
    setPackageCategory(null);
    setPackageProfessional(null);
    setPackageRoom(null);
    setPackageClient(null);
    setPackageSessions(null);
    setPackageStatus(null);
    setPackageSearch('');
  };

  const exportServicesCSV = () => {
    const headers = ['Nome', 'Categoria', 'Preço', 'Duração (min)', 'Retorno (dias)', 'Status'];
    const rows = filteredServices.map(s => [
      s.name,
      s.category,
      Number(s.price).toFixed(2),
      s.duration,
      s.return_days || '-',
      s.is_active ? 'Ativo' : 'Inativo'
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `servicos_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Serviços exportados com sucesso!');
  };

  const exportPackagesCSV = () => {
    const headers = ['Nome', 'Categoria', 'Preço Total', 'Sessões', 'Duração (min)', 'Intervalo (dias)', 'Status'];
    const rows = filteredPackages.map(p => [
      p.name,
      p.category || '-',
      Number(p.total_price).toFixed(2),
      p.total_sessions,
      p.duration || 60,
      p.interval_days || 7,
      p.is_active ? 'Ativo' : 'Inativo'
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pacotes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Pacotes exportados com sucesso!');
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
            <div className="flex gap-2 flex-wrap">
              <BulkImportDialog type="services" onImportComplete={refetch} />
              <NewCategoryDialog 
                existingCategories={allCategories}
                onCategoryCreated={handleCategoryCreated}
              />
              <NewServiceDialog onServiceCreated={refetch} />
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <BulkImportDialog type="services" onImportComplete={refetchPackages} />
              <NewPackageDialog onPackageCreated={refetchPackages} categories={allCategories} />
            </div>
          )}
        </div>

        <TabsContent value="services" className="mt-0">
          <ServiceFilters
            categories={categoriesWithServices}
            professionals={professionals.map(p => ({ id: p.id, name: p.name }))}
            rooms={rooms.map(r => ({ id: r.id, name: r.name }))}
            clients={serviceClients}
            selectedCategory={serviceCategory}
            selectedProfessional={serviceProfessional}
            selectedRoom={serviceRoom}
            selectedClient={serviceClient}
            selectedStatus={serviceStatus}
            searchTerm={serviceSearch}
            sortBy={serviceSort}
            onCategoryChange={setServiceCategory}
            onProfessionalChange={setServiceProfessional}
            onRoomChange={setServiceRoom}
            onClientChange={setServiceClient}
            onStatusChange={setServiceStatus}
            onSearchChange={setServiceSearch}
            onSortChange={setServiceSort}
            onClearFilters={clearServiceFilters}
            onExport={exportServicesCSV}
          />

          <div className="mt-6 flex items-center gap-6 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-display font-semibold">{filteredServices.filter(s => s.is_active).length}</p>
                <p className="text-xs text-muted-foreground">Serviços {serviceCategory || serviceProfessional || serviceRoom || serviceClient || serviceSearch ? 'filtrados' : 'ativos'}</p>
              </div>
            </div>
            <div className="h-10 w-px bg-border" />
            <div>
              <p className="text-2xl font-display font-semibold">{categoriesWithServices.length}</p>
              <p className="text-xs text-muted-foreground">Categorias</p>
            </div>
            {filteredServices.length > 0 && (
              <>
                <div className="h-10 w-px bg-border" />
                <div>
                  <p className="text-2xl font-display font-semibold">
                    R$ {Math.round(filteredServices.reduce((acc, s) => acc + Number(s.price), 0) / filteredServices.length)}
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
                    <ServiceCard 
                      service={service} 
                      onEdit={(s) => setSelectedService(s)}
                      onDelete={refetch}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
                <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 text-muted-foreground">
                  {serviceCategory || serviceProfessional || serviceRoom || serviceClient || serviceSearch
                    ? 'Nenhum serviço encontrado com os filtros aplicados' 
                    : 'Nenhum serviço cadastrado'}
                </p>
                {!(serviceCategory || serviceProfessional || serviceRoom || serviceClient || serviceSearch) && (
                  <NewServiceDialog onServiceCreated={refetch}>
                    <Button className="mt-4" variant="secondary">
                      <Plus className="h-4 w-4 mr-2" />
                      Cadastrar Serviço
                    </Button>
                  </NewServiceDialog>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="packages" className="mt-0">
          <PackageFilters
            categories={categoriesWithPackages as string[]}
            professionals={professionals.map(p => ({ id: p.id, name: p.name }))}
            rooms={rooms.map(r => ({ id: r.id, name: r.name }))}
            clients={packageClients}
            selectedCategory={packageCategory}
            selectedProfessional={packageProfessional}
            selectedRoom={packageRoom}
            selectedClient={packageClient}
            selectedSessions={packageSessions}
            selectedStatus={packageStatus}
            searchTerm={packageSearch}
            sortBy={packageSort}
            onCategoryChange={setPackageCategory}
            onProfessionalChange={setPackageProfessional}
            onRoomChange={setPackageRoom}
            onClientChange={setPackageClient}
            onSessionsChange={setPackageSessions}
            onStatusChange={setPackageStatus}
            onSearchChange={setPackageSearch}
            onSortChange={setPackageSort}
            onClearFilters={clearPackageFilters}
            onExport={exportPackagesCSV}
          />

          <div className="mt-6 flex items-center gap-6 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-display font-semibold">{filteredPackages.filter(p => p.is_active).length}</p>
                <p className="text-xs text-muted-foreground">Pacotes ativos</p>
              </div>
            </div>
            <div className="h-10 w-px bg-border" />
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/10 p-2">
                <Users className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-display font-semibold">{packages.filter(p => p.client_id).length}</p>
                <p className="text-xs text-muted-foreground">Com clientes</p>
              </div>
            </div>
            {filteredPackages.length > 0 && (
              <>
                <div className="h-10 w-px bg-border" />
                <div>
                  <p className="text-2xl font-display font-semibold">
                    R$ {Math.round(filteredPackages.reduce((acc, p) => acc + Number(p.total_price), 0) / filteredPackages.length)}
                  </p>
                  <p className="text-xs text-muted-foreground">Ticket médio</p>
                </div>
              </>
            )}
          </div>

          {packagesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredPackages.length > 0 ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPackages.map((pkg) => (
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
                    {pkg.category && (
                      <Badge variant="outline" className="text-xs">{pkg.category}</Badge>
                    )}
                    {pkg.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{pkg.description}</p>
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
            <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-muted-foreground">
                {packageCategory || packageProfessional || packageRoom || packageClient || packageSessions || packageStatus || packageSearch
                  ? 'Nenhum pacote encontrado com os filtros aplicados'
                  : 'Nenhum pacote cadastrado'}
              </p>
              {!(packageCategory || packageProfessional || packageRoom || packageClient || packageSessions || packageStatus || packageSearch) && (
                <NewPackageDialog onPackageCreated={refetchPackages} categories={allCategories}>
                  <Button className="mt-4" variant="secondary">
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Pacote
                  </Button>
                </NewPackageDialog>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {selectedService && (
        <ServiceDetailDialog
          service={selectedService}
          open={!!selectedService}
          onOpenChange={(open) => !open && setSelectedService(null)}
          categories={allCategories}
          onServiceUpdated={refetch}
        />
      )}

      {selectedPackage && (
        <PackageDetailDialog
          pkg={selectedPackage}
          open={!!selectedPackage}
          onOpenChange={(open) => !open && setSelectedPackage(null)}
          onPackageUpdated={refetchPackages}
          categories={allCategories}
        />
      )}
    </AppLayout>
  );
};

export default Servicos;

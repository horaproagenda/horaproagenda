import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Sparkles, Loader2, Package, Download, FolderPlus, MoreHorizontal } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ServiceCard } from '@/components/services/ServiceCard';
import { NewServiceDialog } from '@/components/services/NewServiceDialog';
import { NewPackageDialog } from '@/components/services/NewPackageDialog';
import { ServiceDetailDialog } from '@/components/services/ServiceDetailDialog';
import { PackageDetailDialog } from '@/components/services/PackageDetailDialog';
import { NewCategoryDialog } from '@/components/services/NewCategoryDialog';
import { UnifiedServiceFilters } from '@/components/services/UnifiedServiceFilters';
import { BulkImportDialog } from '@/components/services/BulkImportDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useServices } from '@/hooks/useServices';
import { useServicePackages } from '@/hooks/useServicePackages';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { useClients } from '@/hooks/useClients';
import { useAppointments } from '@/hooks/useAppointments';
import { Service } from '@/types';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { Clock, DollarSign, Layers, Search } from 'lucide-react';

type ServicePackageDB = Tables<'service_packages'>;

const defaultCategories = [
  'Cabelo', 'Unhas', 'Estética', 'Massagem', 'Maquiagem', 'Depilação', 'Tratamentos', 'Outros',
];

const Servicos: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('services');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ServicePackageDB | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Service filters
  const [serviceCategory, setServiceCategory] = useState<string | null>(null);
  const [serviceProfessional, setServiceProfessional] = useState<string | null>(null);
  const [serviceRoom, setServiceRoom] = useState<string | null>(null);
  const [serviceClient, setServiceClient] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<string | null>(null);
  const [serviceSort, setServiceSort] = useState('name-asc');

  // Package filters
  const [packageCategory, setPackageCategory] = useState<string | null>(null);
  const [packageProfessional, setPackageProfessional] = useState<string | null>(null);
  const [packageRoom, setPackageRoom] = useState<string | null>(null);
  const [packageClient, setPackageClient] = useState<string | null>(null);
  const [packageSessions, setPackageSessions] = useState<string | null>(null);
  const [packageStatus, setPackageStatus] = useState<string | null>(null);
  const [packageSort, setPackageSort] = useState('name-asc');

  const { services, isLoading, refetch } = useServices();
  const { packages, isLoading: packagesLoading, refetch: refetchPackages } = useServicePackages();
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();
  const { clients } = useClients();
  const { appointments } = useAppointments();

  useEffect(() => {
    const saved = localStorage.getItem('customCategories');
    if (saved) setCustomCategories(JSON.parse(saved));
  }, []);

  const allCategories = [...new Set([
    ...defaultCategories,
    ...customCategories,
    ...services.map(s => s.category),
    ...packages.map(p => p.category).filter(Boolean) as string[]
  ])].sort();

  const categoriesWithServices = [...new Set(services.map(s => s.category))];
  const categoriesWithPackages = [...new Set(packages.map(p => p.category).filter(Boolean))];

  const serviceClients = useMemo(() => {
    const clientIds = [...new Set(appointments.map(a => a.client_id))];
    return clientIds
      .map(id => clients.find(c => c.id === id))
      .filter(Boolean)
      .map(c => ({ id: c!.id, name: c!.name }));
  }, [appointments, clients]);

  const packageClients = useMemo(() => {
    return [...new Map(
      packages
        .filter(p => p.client_id)
        .map(p => [p.client_id, { id: p.client_id!, name: clients.find(c => c.id === p.client_id)?.name || 'Cliente' }])
    ).values()];
  }, [packages, clients]);

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
      if (searchTerm && !service.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });

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
  }, [services, serviceCategory, serviceProfessional, serviceRoom, serviceClient, serviceStatus, searchTerm, serviceSort, appointments]);

  const filteredPackages = useMemo(() => {
    let result = packages.filter(pkg => {
      if (!packageClient && pkg.client_id) return false;
      if (packageCategory && pkg.category !== packageCategory) return false;
      if (packageProfessional && pkg.professional_id !== packageProfessional) return false;
      if (packageRoom && pkg.room_id !== packageRoom) return false;
      if (packageClient && pkg.client_id !== packageClient) return false;
      if (packageStatus === 'active' && !pkg.is_active) return false;
      if (packageStatus === 'inactive' && pkg.is_active) return false;
      if (searchTerm && !pkg.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
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
  }, [packages, packageCategory, packageProfessional, packageRoom, packageClient, packageSessions, packageStatus, searchTerm, packageSort]);

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
  };

  const clearPackageFilters = () => {
    setPackageCategory(null);
    setPackageProfessional(null);
    setPackageRoom(null);
    setPackageClient(null);
    setPackageSessions(null);
    setPackageStatus(null);
  };

  const exportServicesCSV = () => {
    const headers = ['Nome', 'Categoria', 'Preço', 'Duração (min)', 'Retorno (dias)', 'Status'];
    const rows = filteredServices.map(s => [
      s.name, s.category, Number(s.price).toFixed(2), s.duration, s.return_days || '-', s.is_active ? 'Ativo' : 'Inativo'
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `servicos_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Serviços exportados!');
  };

  const exportPackagesCSV = () => {
    const headers = ['Nome', 'Categoria', 'Preço Total', 'Sessões', 'Duração (min)', 'Intervalo (dias)', 'Status'];
    const rows = filteredPackages.map(p => [
      p.name, p.category || '-', Number(p.total_price).toFixed(2), p.total_sessions, p.duration || 60, p.interval_days || 7, p.is_active ? 'Ativo' : 'Inativo'
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pacotes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Pacotes exportados!');
  };

  return (
    <AppLayout title="Serviços" subtitle="Catálogo de procedimentos e pacotes">
      <div className="space-y-3">
        {/* Line 1: Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar serviço ou pacote..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Line 2: Tabs (Serviços / Pacotes) */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="h-8">
            <TabsTrigger value="services" className="text-xs h-7 px-3">Serviços</TabsTrigger>
            <TabsTrigger value="packages" className="text-xs h-7 px-3">Pacotes</TabsTrigger>
          </TabsList>

          {/* Services Tab */}
          <TabsContent value="services" className="mt-3 space-y-3">
            {/* Line 3: Filters + New Service + Import/Export */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UnifiedServiceFilters
                  type="services"
                  categories={categoriesWithServices}
                  professionals={professionals.map(p => ({ id: p.id, name: p.name }))}
                  rooms={rooms.map(r => ({ id: r.id, name: r.name }))}
                  clients={serviceClients}
                  selectedCategory={serviceCategory}
                  selectedProfessional={serviceProfessional}
                  selectedRoom={serviceRoom}
                  selectedClient={serviceClient}
                  selectedStatus={serviceStatus}
                  searchTerm=""
                  sortBy={serviceSort}
                  onCategoryChange={setServiceCategory}
                  onProfessionalChange={setServiceProfessional}
                  onRoomChange={setServiceRoom}
                  onClientChange={setServiceClient}
                  onStatusChange={setServiceStatus}
                  onSearchChange={() => {}}
                  onSortChange={setServiceSort}
                  onClearFilters={clearServiceFilters}
                  hideSearch
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                      Importar/Exportar
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem asChild>
                      <BulkImportDialog type="services" onImportComplete={refetch} />
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportServicesCSV}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Exportar Serviços
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <NewCategoryDialog existingCategories={allCategories} onCategoryCreated={handleCategoryCreated}>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <FolderPlus className="h-3.5 w-3.5" />
                    Categoria
                  </Button>
                </NewCategoryDialog>
              </div>

              <NewServiceDialog onServiceCreated={refetch}>
                <Button size="sm" className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Plus className="h-3.5 w-3.5" />
                  <span className="text-xs">Novo Serviço</span>
                </Button>
              </NewServiceDialog>
            </div>

          {/* Stats Summary */}
          <div className="flex items-center gap-4 text-xs bg-muted/30 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold">{filteredServices.filter(s => s.is_active).length}</span>
              <span className="text-muted-foreground">ativos</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="font-semibold">{categoriesWithServices.length}</span>
              <span className="text-muted-foreground">categorias</span>
            </div>
            {filteredServices.length > 0 && (
              <>
                <div className="h-3 w-px bg-border" />
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">
                    R$ {Math.round(filteredServices.reduce((acc, s) => acc + Number(s.price), 0) / filteredServices.length)}
                  </span>
                  <span className="text-muted-foreground">ticket médio</span>
                </div>
              </>
            )}
          </div>

          {/* Services Grid */}
          <div>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredServices.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredServices.map((service, index) => (
                  <div
                    key={service.id}
                    style={{ animationDelay: `${index * 30}ms` }}
                    className="animate-fade-in cursor-pointer"
                    onClick={() => setSelectedService(service)}
                  >
                    <ServiceCard service={service} onEdit={setSelectedService} onDelete={refetch} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {searchTerm || serviceCategory || serviceProfessional ? 'Nenhum serviço encontrado' : 'Nenhum serviço cadastrado'}
                </p>
                {!searchTerm && !serviceCategory && (
                  <NewServiceDialog onServiceCreated={refetch}>
                    <Button size="sm" variant="secondary" className="mt-3">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Cadastrar Serviço
                    </Button>
                  </NewServiceDialog>
                )}
              </div>
            )}
          </div>
          </TabsContent>

          {/* Packages Tab */}
          <TabsContent value="packages" className="mt-3 space-y-3">
            {/* Line 3: Filters + New Package + Import/Export */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UnifiedServiceFilters
                  type="packages"
                  categories={categoriesWithPackages as string[]}
                  professionals={professionals.map(p => ({ id: p.id, name: p.name }))}
                  rooms={rooms.map(r => ({ id: r.id, name: r.name }))}
                  clients={packageClients}
                  selectedCategory={packageCategory}
                  selectedProfessional={packageProfessional}
                  selectedRoom={packageRoom}
                  selectedClient={packageClient}
                  selectedStatus={packageStatus}
                  selectedSessions={packageSessions}
                  searchTerm=""
                  sortBy={packageSort}
                  onCategoryChange={setPackageCategory}
                  onProfessionalChange={setPackageProfessional}
                  onRoomChange={setPackageRoom}
                  onClientChange={setPackageClient}
                  onStatusChange={setPackageStatus}
                  onSessionsChange={setPackageSessions}
                  onSearchChange={() => {}}
                  onSortChange={setPackageSort}
                  onClearFilters={clearPackageFilters}
                  hideSearch
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                      Importar/Exportar
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem asChild>
                      <BulkImportDialog type="services" onImportComplete={refetchPackages} />
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportPackagesCSV}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Exportar Pacotes
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <NewPackageDialog onPackageCreated={refetchPackages} categories={allCategories}>
                <Button size="sm" className="h-8 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white">
                  <Package className="h-3.5 w-3.5" />
                  <span className="text-xs">Novo Pacote</span>
                </Button>
              </NewPackageDialog>
            </div>

          {/* Stats Summary */}
          <div className="flex items-center gap-4 text-xs bg-muted/30 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold">{filteredPackages.filter(p => p.is_active).length}</span>
              <span className="text-muted-foreground">ativos</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="font-semibold">{packages.filter(p => p.client_id).length}</span>
              <span className="text-muted-foreground">vendidos</span>
            </div>
          </div>

          {/* Packages Grid */}
          <div>
            {packagesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredPackages.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredPackages.map((pkg, index) => (
                  <Card
                    key={pkg.id}
                    style={{ animationDelay: `${index * 30}ms` }}
                    className="animate-fade-in cursor-pointer p-4 hover:border-primary/30 hover:shadow-md transition-all"
                    onClick={() => setSelectedPackage(pkg)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="rounded-md bg-primary/10 p-1.5 shrink-0">
                          <Package className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium text-sm truncate">{pkg.name}</h4>
                          {pkg.category && (
                            <Badge variant="outline" className="text-[10px] mt-0.5 h-4">{pkg.category}</Badge>
                          )}
                        </div>
                      </div>
                      <Badge variant={pkg.is_active ? 'default' : 'secondary'} className="text-[10px] h-5 shrink-0">
                        {pkg.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        <span>{pkg.total_sessions} sessões</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{pkg.duration || 60}min</span>
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t flex items-center justify-between">
                      <div className="flex items-center gap-1 text-sm font-semibold">
                        <DollarSign className="h-3.5 w-3.5 text-green-600" />
                        <span>R$ {Number(pkg.total_price).toFixed(0)}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        R$ {(Number(pkg.total_price) / pkg.total_sessions).toFixed(0)}/sessão
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
                <Package className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {searchTerm || packageCategory ? 'Nenhum pacote encontrado' : 'Nenhum pacote cadastrado'}
                </p>
                {!searchTerm && !packageCategory && (
                  <NewPackageDialog onPackageCreated={refetchPackages} categories={allCategories}>
                    <Button size="sm" variant="secondary" className="mt-3">
                      <Package className="h-3.5 w-3.5 mr-1" />
                      Criar Pacote
                    </Button>
                  </NewPackageDialog>
                )}
              </div>
            )}
          </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Dialogs */}
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

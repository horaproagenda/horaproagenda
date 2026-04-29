import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Sparkles, Loader2, Package, Download, FolderPlus, MoreHorizontal } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ServiceCard } from '@/components/services/ServiceCard';
import { NewServiceDialog } from '@/components/services/NewServiceDialog';
import { NewPackageDialog } from '@/components/services/NewPackageDialog';
import { ServiceDetailDialog } from '@/components/services/ServiceDetailDialog';
import { PackageTemplateDetailDialog } from '@/components/services/PackageTemplateDetailDialog';
import { NewCategoryDialog } from '@/components/services/NewCategoryDialog';
import { UnifiedServiceFilters } from '@/components/services/UnifiedServiceFilters';
import { BulkImportDialog } from '@/components/services/BulkImportDialog';
import { ManagePackageTemplatesDialog } from '@/components/services/ManagePackageTemplatesDialog';
import { PackageAvailabilityReportDialog } from '@/components/services/PackageAvailabilityReportDialog';
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
import { usePackageTemplates } from '@/hooks/usePackageTemplates';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { useClients } from '@/hooks/useClients';
import { useAppointments } from '@/hooks/useAppointments';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { exportToCSV } from '@/lib/exportUtils';
import { Service, PackageTemplate } from '@/types';
import { Clock, DollarSign, Layers, Search } from 'lucide-react';

const defaultCategories = [
  'Cabelo', 'Unhas', 'Estética', 'Massagem', 'Maquiagem', 'Depilação', 'Tratamentos', 'Outros',
];

interface ServicesFilters {
  category: string | null;
  professional: string | null;
  room: string | null;
  client: string | null;
  status: string | null;
  sort: string;
}

interface PackagesFilters {
  category: string | null;
  professional: string | null;
  room: string | null;
  sessions: string | null;
  status: string | null;
  sort: string;
}

const Servicos: React.FC = () => {
  const [activeTab, setActiveTab] = useLocalStorage<string>('servicos-tab', 'services');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PackageTemplate | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Persist filters in localStorage
  const [serviceFilters, setServiceFilters] = useLocalStorage<ServicesFilters>('servicos-service-filters', {
    category: null, professional: null, room: null, client: null, status: null, sort: 'name-asc'
  });
  const [packageFilters, setPackageFilters] = useLocalStorage<PackagesFilters>('servicos-package-filters', {
    category: null, professional: null, room: null, sessions: null, status: null, sort: 'name-asc'
  });
  const [packageStatus, setPackageStatus] = useState<string | null>(null);
  const [packageSort, setPackageSort] = useState('name-asc');

  const { services, isLoading, refetch } = useServices();
  const { templates: packages, isLoading: packagesLoading, refetch: refetchPackages } = usePackageTemplates();
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
  ])].sort();

  const categoriesWithServices = [...new Set(services.map(s => s.category))];
  const categoriesWithPackages = [...new Set(packages.map(p => p.category).filter(Boolean))] as string[];

  const serviceClients = useMemo(() => {
    const clientIds = [...new Set(appointments.map(a => a.client_id))];
    return clientIds
      .map(id => clients.find(c => c.id === id))
      .filter(Boolean)
      .map(c => ({ id: c!.id, name: c!.name }));
  }, [appointments, clients]);

  // Package templates don't have clients - they are catalog items
  const packageClients: { id: string; name: string }[] = [];

  const filteredServices = useMemo(() => {
    let result = services.filter(service => {
      if (serviceFilters.category && service.category !== serviceFilters.category) return false;
      if (serviceFilters.professional && service.professional_id !== serviceFilters.professional) return false;
      if (serviceFilters.room && service.room_id !== serviceFilters.room) return false;
      if (serviceFilters.status === 'active' && !service.is_active) return false;
      if (serviceFilters.status === 'inactive' && service.is_active) return false;
      if (serviceFilters.client) {
        const serviceAppointments = appointments.filter(a => a.service_id === service.id);
        if (!serviceAppointments.some(a => a.client_id === serviceFilters.client)) return false;
      }
      if (searchTerm && !service.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });

    result.sort((a, b) => {
      switch (serviceFilters.sort) {
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
  }, [services, serviceFilters, searchTerm, appointments]);

  const filteredPackages = useMemo(() => {
    let result = packages.filter(pkg => {
      if (packageFilters.category && pkg.category !== packageFilters.category) return false;
      if (packageFilters.professional && pkg.professional_id !== packageFilters.professional) return false;
      if (packageFilters.room && pkg.room_id !== packageFilters.room) return false;
      if (packageFilters.status === 'active' && !pkg.is_active) return false;
      if (packageFilters.status === 'inactive' && pkg.is_active) return false;
      if (searchTerm && !pkg.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (packageFilters.sessions) {
        if (packageFilters.sessions === '10+') {
          if (pkg.total_sessions <= 10) return false;
        } else {
          const num = parseInt(packageFilters.sessions);
          if (!isNaN(num) && pkg.total_sessions !== num) return false;
        }
      }
      return true;
    });

    result.sort((a, b) => {
      switch (packageFilters.sort) {
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'price-asc': return Number(a.price) - Number(b.price);
        case 'price-desc': return Number(b.price) - Number(a.price);
        case 'sessions-asc': return a.total_sessions - b.total_sessions;
        case 'sessions-desc': return b.total_sessions - a.total_sessions;
        case 'date-asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'date-desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default: return 0;
      }
    });

    return result;
  }, [packages, packageFilters, searchTerm]);

  const handleCategoryCreated = (category: string) => {
    const updatedCategories = [...customCategories, category];
    setCustomCategories(updatedCategories);
    localStorage.setItem('customCategories', JSON.stringify(updatedCategories));
  };

  const clearServiceFilters = () => {
    setServiceFilters({ category: null, professional: null, room: null, client: null, status: null, sort: 'name-asc' });
  };

  const clearPackageFilters = () => {
    setPackageFilters({ category: null, professional: null, room: null, sessions: null, status: null, sort: 'name-asc' });
  };

  const exportServicesCSV = () => {
    exportToCSV({
      filename: 'servicos',
      headers: ['Nome', 'Categoria', 'Preço', 'Duração (min)', 'Retorno (dias)', 'Status'],
      rows: filteredServices.map(s => [
        s.name, s.category, Number(s.price).toFixed(2), s.duration, s.return_days || '-', s.is_active ? 'Ativo' : 'Inativo'
      ]),
      successMessage: 'Serviços exportados com sucesso!',
    });
  };

  const exportPackagesCSV = () => {
    exportToCSV({
      filename: 'pacotes',
      headers: ['Nome', 'Categoria', 'Preço', 'Aplicações', 'Duração (min)', 'Intervalo (dias)', 'Tipo', 'Status'],
      rows: filteredPackages.map(p => [
        p.name, p.category || '-', Number(p.price).toFixed(2), p.total_sessions, p.duration || 60, p.interval_days || 7, p.package_type === 'sequential' ? 'Sequencial' : 'Não sequencial', p.is_active ? 'Ativo' : 'Inativo'
      ]),
      successMessage: 'Pacotes exportados com sucesso!',
    });
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
          <TabsContent value="services" className="mt-3 space-y-3 page-enter">
            {/* Line 3: Filters + New Service + Import/Export */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <UnifiedServiceFilters
                  type="services"
                  categories={categoriesWithServices}
                  professionals={professionals.map(p => ({ id: p.id, name: p.name }))}
                  rooms={rooms.map(r => ({ id: r.id, name: r.name }))}
                  clients={serviceClients}
                  selectedCategory={serviceFilters.category}
                  selectedProfessional={serviceFilters.professional}
                  selectedRoom={serviceFilters.room}
                  selectedClient={serviceFilters.client}
                  selectedStatus={serviceFilters.status}
                  searchTerm=""
                  sortBy={serviceFilters.sort}
                  onCategoryChange={(v) => setServiceFilters(prev => ({ ...prev, category: v }))}
                  onProfessionalChange={(v) => setServiceFilters(prev => ({ ...prev, professional: v }))}
                  onRoomChange={(v) => setServiceFilters(prev => ({ ...prev, room: v }))}
                  onClientChange={(v) => setServiceFilters(prev => ({ ...prev, client: v }))}
                  onStatusChange={(v) => setServiceFilters(prev => ({ ...prev, status: v }))}
                  onSearchChange={() => {}}
                  onSortChange={(v) => setServiceFilters(prev => ({ ...prev, sort: v }))}
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
                <Button size="sm" className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white btn-vibrant">
                  <Plus className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium tracking-wide">Novo Serviço</span>
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
                <p className="mt-2 text-sm text-muted-foreground tracking-wide">
                  {searchTerm || serviceFilters.category || serviceFilters.professional ? 'Nenhum serviço encontrado' : 'Nenhum serviço cadastrado'}
                </p>
                {!searchTerm && !serviceFilters.category && (
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
          <TabsContent value="packages" className="mt-3 space-y-3 page-enter">
            {/* Line 3: Filters + New Package + Import/Export */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <UnifiedServiceFilters
                  type="packages"
                  categories={categoriesWithPackages}
                  professionals={professionals.map(p => ({ id: p.id, name: p.name }))}
                  rooms={rooms.map(r => ({ id: r.id, name: r.name }))}
                  clients={[]}
                  selectedCategory={packageFilters.category}
                  selectedProfessional={packageFilters.professional}
                  selectedRoom={packageFilters.room}
                  selectedClient={null}
                  selectedStatus={packageFilters.status}
                  selectedSessions={packageFilters.sessions}
                  searchTerm=""
                  sortBy={packageFilters.sort}
                  onCategoryChange={(v) => setPackageFilters(prev => ({ ...prev, category: v }))}
                  onProfessionalChange={(v) => setPackageFilters(prev => ({ ...prev, professional: v }))}
                  onRoomChange={(v) => setPackageFilters(prev => ({ ...prev, room: v }))}
                  onClientChange={() => {}}
                  onStatusChange={(v) => setPackageFilters(prev => ({ ...prev, status: v }))}
                  onSessionsChange={(v) => setPackageFilters(prev => ({ ...prev, sessions: v }))}
                  onSearchChange={() => {}}
                  onSortChange={(v) => setPackageFilters(prev => ({ ...prev, sort: v }))}
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
                      <BulkImportDialog type="package_templates" onImportComplete={refetchPackages} />
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportPackagesCSV}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Exportar Pacotes
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <PackageAvailabilityReportDialog />
              </div>

              <NewPackageDialog onPackageCreated={refetchPackages}>
                <Button size="sm" className="h-8 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white btn-vibrant">
                  <Package className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium tracking-wide">Novo Pacote</span>
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
              <span className="font-semibold">{packages.length}</span>
              <span className="text-muted-foreground">total</span>
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
                        <span>R$ {Number(pkg.price).toFixed(0)}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        R$ {(Number(pkg.price) / pkg.total_sessions).toFixed(0)}/sessão
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
                <Package className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground tracking-wide">
                  {searchTerm ? 'Nenhum pacote encontrado' : 'Nenhum pacote cadastrado'}
                </p>
                {!searchTerm && (
                  <NewPackageDialog onPackageCreated={refetchPackages}>
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
        <PackageTemplateDetailDialog
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

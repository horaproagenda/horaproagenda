import React, { useState, useEffect, useMemo } from 'react';
import { useLogAccessOnMount } from '@/hooks/useLogAccess';
import { Plus, Sparkles, Loader2, Package, Download, Upload, FolderPlus, MoreHorizontal, Repeat, Info } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useListPosition } from '@/hooks/useListPosition';
import { ResumePositionBanner } from '@/components/shared/ResumePositionBanner';
import { ServiceCard } from '@/components/services/ServiceCard';
import { NewServiceDialog } from '@/components/services/NewServiceDialog';
import { NewPackageDialog } from '@/components/services/NewPackageDialog';
import { ServiceDetailDialog } from '@/components/services/ServiceDetailDialog';
import { PackageTemplateDetailDialog } from '@/components/services/PackageTemplateDetailDialog';
import { NewCategoryDialog } from '@/components/services/NewCategoryDialog';
import { UnifiedServiceFilters } from '@/components/services/UnifiedServiceFilters';
import { BulkImportDialog } from '@/components/services/BulkImportDialog';
import { ManagePackageTemplatesDialog } from '@/components/services/ManagePackageTemplatesDialog';

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
import { useEquipment } from '@/hooks/useEquipment';
import { useClients } from '@/hooks/useClients';
import { useAppointments } from '@/hooks/useAppointments';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useInfiniteList } from '@/hooks/useInfiniteList';
import { exportToCSV } from '@/lib/exportUtils';
import { exportTableToPdf } from '@/lib/pdfExport';
import { Service, PackageTemplate } from '@/types';
import { Clock, DollarSign, Layers, Search } from 'lucide-react';
import { getCategoryColor } from '@/lib/categoryColors';
import { cn } from '@/lib/utils';

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

interface ServicesGridProps {
  items: Service[];
  onSelect: (s: Service) => void;
  onEdit: (s: Service) => void;
  onDelete: () => void;
}

const ServicesGrid: React.FC<ServicesGridProps> = ({ items, onSelect, onEdit, onDelete }) => {
  const { visibleItems, hasMore, sentinelRef } = useInfiniteList(items);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleItems.map((service, index) => (
          <div
            key={service.id}
            style={{ animationDelay: `${index * 30}ms` }}
            className="animate-fade-in cursor-pointer h-full"
            onClick={() => onSelect(service)}
          >
            <ServiceCard service={service} onEdit={onEdit} onDelete={onDelete} />
          </div>
        ))}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-xs text-muted-foreground">Carregando mais serviços...</span>
        </div>
      )}
    </>
  );
};

interface PackageCardsSectionProps {
  items: PackageTemplate[];
  onSelect: (p: PackageTemplate) => void;
}

const PackageCardsSection: React.FC<PackageCardsSectionProps> = ({ items, onSelect }) => {
  const { visibleItems, hasMore, sentinelRef } = useInfiniteList(items);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleItems.map((pkg, index) => {
          const color = getCategoryColor(pkg.category || 'Outros');
          return (
            <Card
              key={pkg.id}
              style={{ animationDelay: `${index * 30}ms`, borderLeftColor: color.hex, borderLeftWidth: '3px' }}
              className="animate-fade-in cursor-pointer p-4 hover:border-primary/30 hover:shadow-md transition-all flex flex-col"
              onClick={() => onSelect(pkg)}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="rounded-md p-1.5 shrink-0" style={{ backgroundColor: `${color.hex}20` }}>
                    <Package className="h-3.5 w-3.5" style={{ color: color.hex }} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-medium text-sm truncate">{pkg.name}</h4>
                    {pkg.category && <p className="text-[10px] text-muted-foreground truncate">{pkg.category}</p>}
                  </div>
                </div>
                <Badge variant={pkg.is_active ? 'default' : 'secondary'} className="text-[10px] h-5 shrink-0">
                  {pkg.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  <span>{pkg.total_sessions} aplicações</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{pkg.duration || 60}min</span>
                </div>
              </div>

              <div className="mt-auto pt-2 border-t flex items-center justify-between">
                <div className="flex items-center gap-1 text-sm font-semibold">
                  <DollarSign className="h-3.5 w-3.5 text-success" />
                  <span>R$ {Number(pkg.price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{ color: color.hex, backgroundColor: `${color.hex}15` }}
                >
                  R$ {(Number(pkg.price) / pkg.total_sessions).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/aplic.
                </span>
              </div>
            </Card>
          );
        })}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-xs text-muted-foreground">Carregando mais pacotes...</span>
        </div>
      )}
    </>
  );
};

const Servicos: React.FC = () => {
  useLogAccessOnMount({ module: 'servicos', action: 'view', fieldsViewed: ['name', 'category', 'duration', 'price', 'professionals', 'is_active'] });
  const [activeTab, setActiveTab] = useState<string>('services');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PackageTemplate | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Resume position
  const { savedState: resumeState, savePosition: savePos, restore: restorePos, dismiss: dismissPos } = useListPosition({ key: 'servicos' });
  const handleResumePos = () => {
    if (resumeState?.search) setSearchTerm(resumeState.search);
    if (resumeState?.lastItemId) setActiveTab(resumeState.lastItemId);
    restorePos();
  };
  useEffect(() => { savePos({ search: searchTerm, lastItemId: activeTab }); }, [searchTerm, activeTab, savePos]);

  // Persist filters in localStorage
  const [serviceFilters, setServiceFilters] = useLocalStorage<ServicesFilters>('servicos-service-filters', {
    category: null, professional: null, room: null, client: null, status: null, sort: 'name-asc'
  });
  const [packageFilters, setPackageFilters] = useLocalStorage<PackagesFilters>('servicos-package-filters', {
    category: null, professional: null, room: null, sessions: null, status: null, sort: 'name-asc'
  });
  const [packageStatus, setPackageStatus] = useState<string | null>(null);
  const [packageSort, setPackageSort] = useState('name-asc');
  const [packageTypeFilter, setPackageTypeFilter] = useLocalStorage<'all' | 'standard' | 'sequential'>('servicos-package-type-filter', 'all');
  const [serviceTypeFilter, setServiceTypeFilter] = useLocalStorage<'all' | 'service' | 'kit'>('servicos-service-type-filter', 'all');

  const { services, isLoading, refetch } = useServices();
  const { templates: packages, isLoading: packagesLoading, refetch: refetchPackages } = usePackageTemplates();
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();
  const { equipment: equipmentList } = useEquipment();
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

  const isKitServiceItem = (s: Service) => Array.isArray((s as any).component_service_ids) && (s as any).component_service_ids.length > 0;
  const standardServicesCount = filteredServices.filter(s => !isKitServiceItem(s)).length;
  const kitServicesCount = filteredServices.filter(isKitServiceItem).length;
  const visibleServices = filteredServices.filter(s => {
    if (serviceTypeFilter === 'kit') return isKitServiceItem(s);
    if (serviceTypeFilter === 'service') return !isKitServiceItem(s);
    return true;
  });
  const standardServices = visibleServices.filter(s => !isKitServiceItem(s));
  const kitServices = visibleServices.filter(isKitServiceItem);

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

  const visiblePackages = filteredPackages.filter(pkg => {
    if (packageTypeFilter === 'sequential') return pkg.package_type === 'sequential';
    if (packageTypeFilter === 'standard') return pkg.package_type !== 'sequential';
    return true;
  });
  const standardPackagesCount = filteredPackages.filter(pkg => pkg.package_type !== 'sequential').length;
  const sequentialPackagesCount = filteredPackages.filter(pkg => pkg.package_type === 'sequential').length;
  const nonSequentialPackages = visiblePackages.filter(pkg => pkg.package_type !== 'sequential');
  const sequentialPackages = visiblePackages.filter(pkg => pkg.package_type === 'sequential');

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

  const equipmentNameById = useMemo(
    () => new Map((equipmentList || []).map((e: any) => [e.id, e.name] as const)),
    [equipmentList],
  );
  const resolveEquipmentNames = (ids: unknown): string =>
    Array.isArray(ids) && ids.length
      ? (ids as string[]).map((id) => equipmentNameById.get(id) || id).join(', ')
      : '-';

  const buildServicesRows = () => {
    const onlyServices = filteredServices.filter(s => !isKitServiceItem(s));
    const profById = new Map(professionals.map(p => [p.id, p] as const));
    return {
      headers: ['Nome', 'Categoria', 'Profissional', 'Sala', 'Equipamentos', 'Preço (R$)', 'Duração (min)', 'Retorno (dias)', 'Status'],
      rows: onlyServices.map(s => [
        s.name,
        s.category,
        s.professional_id ? (profById.get(s.professional_id)?.name || '-') : '-',
        s.room?.name || '-',
        resolveEquipmentNames(s.equipment),
        Number(s.price).toFixed(2),
        s.duration,
        s.return_days || '-',
        s.is_active ? 'Ativo' : 'Inativo',
      ] as (string | number)[]),
    };
  };
  const exportServicesCSV = () => {
    const p = buildServicesRows();
    exportToCSV({ filename: 'servicos', ...p, successMessage: 'Serviços exportados!' });
  };
  const exportServicesPDF = () => {
    const p = buildServicesRows();
    exportTableToPdf({ filename: 'servicos', title: 'Serviços', subtitle: `${p.rows.length} serviço(s)`, orientation: 'landscape', ...p });
  };


  const buildKitsRows = () => {
    const onlyKits = filteredServices.filter(isKitServiceItem);
    const serviceById = new Map(services.map(s => [s.id, s] as const));
    const profById = new Map(professionals.map(p => [p.id, p] as const));
    return {
      headers: ['Nome', 'Categoria', 'Profissional', 'Preço total (R$)', 'Duração total (min)', 'Nº de etapas', 'Etapas (detalhe)', 'Retorno (dias)', 'Status'],
      rows: onlyKits.map(s => {
        const comps: { service_id: string; interval_days: number; price: number }[] =
          Array.isArray((s as any).service_components)
            ? ((s as any).service_components as any[])
            : ((s as any).component_service_ids || []).map((id: string) => ({ service_id: id, interval_days: 0, price: 0 }));
        const detail = comps.map((c, i) => {
          const sv = serviceById.get(c.service_id);
          const name = sv?.name || 'Serviço removido';
          const dur = Number(sv?.duration) || 0;
          const when = i === 0 ? 'dia 0' : `+${c.interval_days}d após etapa ${i}`;
          return `${i + 1}. ${name} (${when}; ${dur}min; R$ ${Number(c.price || 0).toFixed(2)})`;
        }).join(' | ');
        return [
          s.name,
          s.category,
          s.professional_id ? (profById.get(s.professional_id)?.name || '-') : '-',
          Number(s.price).toFixed(2),
          s.duration,
          comps.length,
          detail,
          s.return_days || '-',
          s.is_active ? 'Ativo' : 'Inativo',
        ] as (string | number)[];
      }),
    };
  };
  const exportKitServicesCSV = () => {
    const p = buildKitsRows();
    exportToCSV({ filename: 'kits-de-servicos', ...p, successMessage: 'Kits exportados!' });
  };
  const exportKitServicesPDF = () => {
    const p = buildKitsRows();
    exportTableToPdf({ filename: 'kits-de-servicos', title: 'Kits de serviços', subtitle: `${p.rows.length} kit(s)`, orientation: 'landscape', ...p });
  };


  const buildStandardPackagesRows = () => {
    const onlyStandard = filteredPackages.filter(p => p.package_type !== 'sequential');
    const profById = new Map(professionals.map(p => [p.id, p] as const));
    return {
      headers: ['Nome', 'Categoria', 'Profissional', 'Sala', 'Equipamentos', 'Preço (R$)', 'Aplicações', 'Duração (min)', 'Intervalo (dias)', 'Status'],
      rows: onlyStandard.map(p => [
        p.name,
        p.category || '-',
        p.professional_id ? (profById.get(p.professional_id)?.name || '-') : '-',
        p.room?.name || '-',
        resolveEquipmentNames(p.equipment),
        Number(p.price).toFixed(2),
        p.total_sessions,
        p.duration || 60,
        p.interval_days || 7,
        p.is_active ? 'Ativo' : 'Inativo',
      ] as (string | number)[]),
    };
  };
  const exportStandardPackagesCSV = () => {
    const p = buildStandardPackagesRows();
    exportToCSV({ filename: 'pacotes-comuns', ...p, successMessage: 'Pacotes comuns exportados!' });
  };
  const exportStandardPackagesPDF = () => {
    const p = buildStandardPackagesRows();
    exportTableToPdf({ filename: 'pacotes-comuns', title: 'Pacotes comuns', subtitle: `${p.rows.length} pacote(s)`, orientation: 'landscape', ...p });
  };

  const buildSequentialPackagesRows = () => {
    const onlySeq = filteredPackages.filter(p => p.package_type === 'sequential');
    const profById = new Map(professionals.map(p => [p.id, p] as const));
    return {
      headers: ['Nome', 'Categoria', 'Profissional', 'Sala', 'Equipamentos', 'Preço (R$)', 'Nº de etapas', 'Duração (min)', 'Intervalo (dias)', 'Status'],
      rows: onlySeq.map(p => [
        p.name,
        p.category || '-',
        p.professional_id ? (profById.get(p.professional_id)?.name || '-') : '-',
        p.room?.name || '-',
        resolveEquipmentNames(p.equipment),
        Number(p.price).toFixed(2),
        p.total_sessions,
        p.duration || 60,
        p.interval_days || 7,
        p.is_active ? 'Ativo' : 'Inativo',
      ] as (string | number)[]),
    };
  };
  const exportSequentialPackagesCSV = () => {
    const p = buildSequentialPackagesRows();
    exportToCSV({ filename: 'pacotes-sequenciais', ...p, successMessage: 'Pacotes sequenciais exportados!' });
  };
  const exportSequentialPackagesPDF = () => {
    const p = buildSequentialPackagesRows();
    exportTableToPdf({ filename: 'pacotes-sequenciais', title: 'Pacotes sequenciais', subtitle: `${p.rows.length} pacote(s)`, orientation: 'landscape', ...p });
  };



  const renderPackageCards = (items: PackageTemplate[]) => (
    <PackageCardsSection items={items} onSelect={setSelectedPackage} />
  );

  return (
    <AppLayout title="Serviços" subtitle="Catálogo de procedimentos e pacotes">
      <div className="space-y-3">
        <ResumePositionBanner state={resumeState} onResume={handleResumePos} onDismiss={dismissPos} />
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
          <TabsList className="h-8 bg-muted/50 p-1 gap-1">
            <TabsTrigger value="services" className="text-xs h-7 px-3 border border-transparent data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-700 data-[state=active]:border-sky-500/40">Serviços</TabsTrigger>
            <TabsTrigger value="packages" className="text-xs h-7 px-3 border border-transparent data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:border-primary/40">Pacotes</TabsTrigger>
          </TabsList>


          {/* Services Tab */}
          <TabsContent value="services" className="mt-3 space-y-3 page-enter">
            {/* Type chips (Serviços / Kits) — mesmo esquema de Pacotes */}
            <div className="flex justify-center">
              <div className="inline-flex w-full max-w-md items-center justify-center rounded-lg border bg-muted/30 p-1 shadow-sm sm:w-auto">
                <Button
                  type="button"
                  variant={serviceTypeFilter === 'service' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 flex-1 gap-1.5 px-3 text-xs font-semibold sm:flex-none"
                  onClick={() => setServiceTypeFilter(serviceTypeFilter === 'service' ? 'all' : 'service')}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Serviços
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{standardServicesCount}</Badge>
                </Button>
                <Button
                  type="button"
                  variant={serviceTypeFilter === 'kit' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 flex-1 gap-1.5 px-3 text-xs font-semibold sm:flex-none"
                  onClick={() => setServiceTypeFilter(serviceTypeFilter === 'kit' ? 'all' : 'kit')}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Kits de Serviços
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{kitServicesCount}</Badge>
                </Button>
              </div>
            </div>

            {/* Info banner: differentiate Serviços × Kits */}
            <div className={cn(
              'flex items-start gap-2 rounded-md border p-2.5 text-xs',
              serviceTypeFilter === 'kit'
                ? 'border-primary/30 bg-primary/10 text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary-foreground'
                : 'border-sky-200 bg-sky-50/60 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100'
            )}>
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p className="leading-relaxed">
                {serviceTypeFilter === 'kit'
                  ? <><strong>Kits de Serviços</strong> são combinações de vários serviços diferentes vendidos juntos em um único atendimento — ideal para combos como "lavar + cortar + escovar".</>
                  : <><strong>Serviços</strong> são procedimentos individuais (ex.: corte, manicure, massagem) com duração e preço próprios e agendados de forma avulsa. Já os <strong>Kits</strong> reúnem vários serviços em um só.</>}
              </p>
            </div>


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

                <BulkImportDialog
                  type="services"
                  onImportComplete={refetch}
                  trigger={
                    <Button variant="outline" size="icon" className="h-8 w-8" title="Importar serviços">
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                  }
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8" title="Exportar">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={exportServicesCSV}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Serviços avulsos — CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportServicesPDF}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Serviços avulsos — PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportKitServicesCSV}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Kits de serviços — CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportKitServicesPDF}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Kits de serviços — PDF
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

              <NewServiceDialog
                key={`new-${serviceTypeFilter === 'kit' ? 'kit' : 'service'}`}
                lockType={serviceTypeFilter === 'kit' ? 'kit' : 'service'}
                onServiceCreated={refetch}
              >
                <Button size="sm" className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white btn-vibrant">
                  <Plus className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium tracking-wide">{serviceTypeFilter === 'kit' ? 'Novo Kit de Serviços' : 'Novo Serviço'}</span>
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
            ) : visibleServices.length > 0 ? (
              <div className="space-y-5">
                {standardServices.length > 0 && (
                  <section className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                      <h3 className="text-sm font-semibold">Serviços</h3>
                      <Badge variant="secondary" className="text-[10px] h-5">{standardServices.length}</Badge>
                    </div>
                    <ServicesGrid
                      items={standardServices}
                      onSelect={setSelectedService}
                      onEdit={setSelectedService}
                      onDelete={refetch}
                    />
                  </section>
                )}
                {kitServices.length > 0 && (
                  <section className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 text-teal-600" />
                      <h3 className="text-sm font-semibold">Kits de Serviços</h3>
                      <Badge variant="secondary" className="text-[10px] h-5">{kitServices.length}</Badge>
                    </div>
                    <ServicesGrid
                      items={kitServices}
                      onSelect={setSelectedService}
                      onEdit={setSelectedService}
                      onDelete={refetch}
                    />
                  </section>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm font-medium">
                  {searchTerm || serviceFilters.category || serviceFilters.professional ? 'Nenhum serviço encontrado' : 'Cadastre seu primeiro serviço'}
                </p>
                {!searchTerm && !serviceFilters.category && !serviceFilters.professional && (
                  <>
                    <ol className="mx-auto mt-3 max-w-sm space-y-1 text-left text-[11px] text-muted-foreground">
                      <li><span className="font-semibold text-foreground">1.</span> Dê um nome e escolha uma categoria.</li>
                      <li><span className="font-semibold text-foreground">2.</span> Informe a duração, o valor e (opcional) o retorno em dias.</li>
                      <li><span className="font-semibold text-foreground">3.</span> Vincule o profissional, a sala e os equipamentos.</li>
                    </ol>
                    <NewServiceDialog
                      key={`empty-${serviceTypeFilter === 'kit' ? 'kit' : 'service'}`}
                      lockType={serviceTypeFilter === 'kit' ? 'kit' : 'service'}
                      onServiceCreated={refetch}
                    >
                      <Button size="sm" className="btn-vibrant mt-3">
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {serviceTypeFilter === 'kit' ? 'Cadastrar primeiro kit' : 'Cadastrar primeiro serviço'}
                      </Button>
                    </NewServiceDialog>
                  </>
                )}
              </div>
            )}
          </div>
          </TabsContent>

          {/* Packages Tab */}
          <TabsContent value="packages" className="mt-3 space-y-3 page-enter">
            <div className="flex justify-center">
              <div className="inline-flex w-full max-w-md items-center justify-center rounded-lg border bg-muted/30 p-1 shadow-sm sm:w-auto">
                <Button
                  type="button"
                  variant={packageTypeFilter === 'standard' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 flex-1 gap-1.5 px-3 text-xs font-semibold sm:flex-none"
                  onClick={() => setPackageTypeFilter(packageTypeFilter === 'standard' ? 'all' : 'standard')}
                >
                  <Package className="h-3.5 w-3.5" />
                  Pacote comum
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {standardPackagesCount}
                  </Badge>
                </Button>
                <Button
                  type="button"
                  variant={packageTypeFilter === 'sequential' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 flex-1 gap-1.5 px-3 text-xs font-semibold sm:flex-none"
                  onClick={() => setPackageTypeFilter(packageTypeFilter === 'sequential' ? 'all' : 'sequential')}
                >
                  <Repeat className="h-3.5 w-3.5" />
                  Pacote sequencial
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {sequentialPackagesCount}
                  </Badge>
                </Button>
              </div>
            </div>

            {/* Info banner: Pacote comum × Pacote sequencial */}
            <div className={cn(
              'flex items-start gap-2 rounded-md border p-2.5 text-xs',
              packageTypeFilter === 'sequential'
                ? 'border-primary/30 bg-primary/10 text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary-foreground'
                : 'border-violet-200 bg-violet-50/60 text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-100'
            )}>
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p className="leading-relaxed">
                {packageTypeFilter === 'sequential'
                  ? <><strong>Pacote sequencial</strong>: serviços diferentes em ordem definida, com intervalo entre etapas (ex.: avaliação → tratamento 1 → tratamento 2). A próxima sessão só libera após a anterior.</>
                  : <><strong>Pacote comum</strong>: várias sessões do mesmo serviço (ex.: 10 sessões de massagem). O cliente usa livremente até esgotar o saldo, respeitando o intervalo entre sessões.</>}
              </p>
            </div>

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

                <BulkImportDialog
                  type="package_templates"
                  onImportComplete={refetchPackages}
                  trigger={
                    <Button variant="outline" size="icon" className="h-8 w-8" title="Importar pacotes">
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                  }
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8" title="Exportar">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={exportStandardPackagesCSV}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Pacotes comuns — CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportStandardPackagesPDF}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Pacotes comuns — PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportSequentialPackagesCSV}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Pacotes sequenciais — CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportSequentialPackagesPDF}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Pacotes sequenciais — PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>


              <div className="flex items-center gap-2">
                <NewPackageDialog onPackageCreated={refetchPackages}>
                  <Button size="sm" className="h-8 gap-1.5 btn-vibrant">
                    <Plus className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium tracking-wide">Novo Pacote</span>
                  </Button>
                </NewPackageDialog>
              </div>
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
            ) : visiblePackages.length > 0 ? (
              <div className="space-y-5">
                {nonSequentialPackages.length > 0 && (
                  <section className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 text-violet-600" />
                      <h3 className="text-sm font-semibold">Pacotes comuns</h3>
                      <Badge variant="secondary" className="text-[10px] h-5">{nonSequentialPackages.length}</Badge>
                    </div>
                    {renderPackageCards(nonSequentialPackages)}
                  </section>
                )}
                {sequentialPackages.length > 0 && (
                  <section className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Repeat className="h-3.5 w-3.5 text-primary" />
                      <h3 className="text-sm font-semibold">Pacotes sequenciais</h3>
                      <Badge variant="secondary" className="text-[10px] h-5">{sequentialPackages.length}</Badge>
                    </div>
                    {renderPackageCards(sequentialPackages)}
                  </section>
                )}
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
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Novo Pacote
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

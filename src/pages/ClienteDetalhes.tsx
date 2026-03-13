import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useClientProfile } from '@/hooks/useClientProfile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, FileText, Image, Receipt, Info, BarChart3, CreditCard, RefreshCw } from 'lucide-react';
import { ClientHeader } from '@/components/client-profile/ClientHeader';
import { ClientStatsSection } from '@/components/client-profile/ClientStatsSection';
import { ClientAppointmentsTab } from '@/components/client-profile/ClientAppointmentsTab';
import { ClientDocumentsTab } from '@/components/client-profile/ClientDocumentsTab';
import { ClientPhotosTab } from '@/components/client-profile/ClientPhotosTab';
import { ClientQuotesTab } from '@/components/client-profile/ClientQuotesTab';
import { ClientInfoTab } from '@/components/client-profile/ClientInfoTab';
import { ClientReportTab } from '@/components/client-profile/ClientReportTab';
import { ClientCreditsTab } from '@/components/client-profile/ClientCreditsTab';
import { EditRecurringAppointmentDialog } from '@/components/appointments/EditRecurringAppointmentDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Appointment } from '@/types';
import { toast } from 'sonner';

export default function ClienteDetalhes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('report');
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { client, appointments, documents, photos, quotes, paymentHistory, isLoading, updateClient, addDocument, addPhoto, addQuote, updateQuote, refetchAll, stats } = useClientProfile(id || '');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    refetchAll();
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success('Dados atualizados!');
    }, 1000);
  };

  if (isLoading) {
    return (
      <AppLayout title="Carregando...">
        <div className="space-y-3 animate-fade-in">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout title="Cliente não encontrado">
        <div className="text-center py-8">
          <h2 className="text-lg font-medium">Cliente não encontrado</h2>
          <Button onClick={() => navigate('/clientes')} className="mt-3" size="sm">Voltar</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={client.name}>
      <div className="space-y-4 animate-fade-in">
        {/* Compact Header Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/clientes')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-semibold">Perfil do Cliente</h1>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {/* Compact Client Header */}
        <ClientHeader client={client} onEdit={() => setActiveTab('info')} />

        {/* Compact Stats Section */}
        <ClientStatsSection stats={stats} />

        {/* Compact Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-7 h-9">
            <TabsTrigger value="report" className="flex items-center gap-1 text-xs px-1">
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Relatório</span>
            </TabsTrigger>
            <TabsTrigger value="credits" className="flex items-center gap-1 text-xs px-1">
              <CreditCard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Créditos</span>
            </TabsTrigger>
            <TabsTrigger value="appointments" className="flex items-center gap-1 text-xs px-1">
              <Calendar className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Agenda</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-1 text-xs px-1">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Docs</span>
            </TabsTrigger>
            <TabsTrigger value="quotes" className="flex items-center gap-1 text-xs px-1">
              <Receipt className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Orçamentos</span>
            </TabsTrigger>
            <TabsTrigger value="photos" className="flex items-center gap-1 text-xs px-1">
              <Image className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fotos</span>
            </TabsTrigger>
            <TabsTrigger value="info" className="flex items-center gap-1 text-xs px-1">
              <Info className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Info</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="report" className="mt-3">
            <ClientReportTab 
              appointments={appointments} 
              clientName={client.name} 
              paymentHistory={paymentHistory}
              onEditAppointment={setEditingAppointment}
            />
          </TabsContent>
          <TabsContent value="credits" className="mt-3">
            <ClientCreditsTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="appointments" className="mt-3">
            <ClientAppointmentsTab 
              appointments={appointments} 
              clientName={client.name}
              clientCpf={client.cpf || ''}
            />
          </TabsContent>
          <TabsContent value="documents" className="mt-3">
            <ClientDocumentsTab documents={documents} clientId={client.id} client={client} onAddDocument={addDocument.mutateAsync} onRefresh={refetchAll} />
          </TabsContent>
          <TabsContent value="quotes" className="mt-3">
            <ClientQuotesTab quotes={quotes} clientId={client.id} clientPhone={client.phone} onAddQuote={addQuote.mutateAsync} onUpdateQuote={updateQuote.mutateAsync} />
          </TabsContent>
          <TabsContent value="photos" className="mt-3">
            <ClientPhotosTab photos={photos} clientId={client.id} onAddPhoto={addPhoto.mutateAsync} />
          </TabsContent>
          <TabsContent value="info" className="mt-3">
            <ClientInfoTab client={client} onUpdate={updateClient.mutateAsync} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Appointment Dialog */}
      <EditRecurringAppointmentDialog
        appointment={editingAppointment}
        open={!!editingAppointment}
        onOpenChange={(open) => !open && setEditingAppointment(null)}
      />
    </AppLayout>
  );
}

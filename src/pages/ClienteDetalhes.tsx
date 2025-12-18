import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useClientProfile } from '@/hooks/useClientProfile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, FileText, Image, Receipt, Info, BarChart3, CreditCard } from 'lucide-react';
import { ClientHeader } from '@/components/client-profile/ClientHeader';
import { ClientStatsSection } from '@/components/client-profile/ClientStatsSection';
import { ClientAppointmentsTab } from '@/components/client-profile/ClientAppointmentsTab';
import { ClientDocumentsTab } from '@/components/client-profile/ClientDocumentsTab';
import { ClientPhotosTab } from '@/components/client-profile/ClientPhotosTab';
import { ClientQuotesTab } from '@/components/client-profile/ClientQuotesTab';
import { ClientInfoTab } from '@/components/client-profile/ClientInfoTab';
import { ClientReportTab } from '@/components/client-profile/ClientReportTab';
import { ClientCreditsTab } from '@/components/client-profile/ClientCreditsTab';
import { Skeleton } from '@/components/ui/skeleton';

export default function ClienteDetalhes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('report');

  const { client, appointments, documents, photos, quotes, isLoading, updateClient, addDocument, addPhoto, addQuote, updateQuote, stats } = useClientProfile(id || '');

  if (isLoading) {
    return (
      <AppLayout title="Carregando...">
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout title="Cliente não encontrado">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Cliente não encontrado</h2>
          <Button onClick={() => navigate('/clientes')} className="mt-4">Voltar</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={client.name}>
      <div className="space-y-6">
        {/* Back button */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Perfil do Cliente</h1>
        </div>

        {/* Client Header with full info */}
        <ClientHeader client={client} onEdit={() => setActiveTab('info')} />

        {/* Stats Section */}
        <ClientStatsSection stats={stats} />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="report" className="flex items-center gap-1">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Relatório</span>
            </TabsTrigger>
            <TabsTrigger value="credits" className="flex items-center gap-1">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Créditos</span>
            </TabsTrigger>
            <TabsTrigger value="appointments" className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Agendamentos</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Documentos</span>
            </TabsTrigger>
            <TabsTrigger value="quotes" className="flex items-center gap-1">
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Orçamentos</span>
            </TabsTrigger>
            <TabsTrigger value="photos" className="flex items-center gap-1">
              <Image className="h-4 w-4" />
              <span className="hidden sm:inline">Fotos</span>
            </TabsTrigger>
            <TabsTrigger value="info" className="flex items-center gap-1">
              <Info className="h-4 w-4" />
              <span className="hidden sm:inline">Informações</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="report">
            <ClientReportTab appointments={appointments} clientName={client.name} />
          </TabsContent>
          <TabsContent value="credits">
            <ClientCreditsTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="appointments">
            <ClientAppointmentsTab appointments={appointments} />
          </TabsContent>
          <TabsContent value="documents">
            <ClientDocumentsTab documents={documents} clientId={client.id} onAddDocument={addDocument.mutateAsync} />
          </TabsContent>
          <TabsContent value="quotes">
            <ClientQuotesTab quotes={quotes} clientId={client.id} clientPhone={client.phone} onAddQuote={addQuote.mutateAsync} onUpdateQuote={updateQuote.mutateAsync} />
          </TabsContent>
          <TabsContent value="photos">
            <ClientPhotosTab photos={photos} clientId={client.id} onAddPhoto={addPhoto.mutateAsync} />
          </TabsContent>
          <TabsContent value="info">
            <ClientInfoTab client={client} onUpdate={updateClient.mutateAsync} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

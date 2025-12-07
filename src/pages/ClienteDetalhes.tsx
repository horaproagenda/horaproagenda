import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useClientProfile } from '@/hooks/useClientProfile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, FileText, Image, Receipt, Info, Phone, Mail, Cake } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ClientAppointmentsTab } from '@/components/client-profile/ClientAppointmentsTab';
import { ClientDocumentsTab } from '@/components/client-profile/ClientDocumentsTab';
import { ClientPhotosTab } from '@/components/client-profile/ClientPhotosTab';
import { ClientQuotesTab } from '@/components/client-profile/ClientQuotesTab';
import { ClientInfoTab } from '@/components/client-profile/ClientInfoTab';
import { Skeleton } from '@/components/ui/skeleton';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

export default function ClienteDetalhes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('appointments');

  const { client, appointments, documents, photos, quotes, isLoading, updateClient, addDocument, addPhoto, addQuote, updateQuote, stats } = useClientProfile(id || '');

  if (isLoading) {
    return (
      <AppLayout title="Carregando...">
        <Skeleton className="h-40 w-full" />
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
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Perfil do Cliente</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-6">
              <Avatar className="h-20 w-20 border-2 border-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-2xl">{getInitials(client.name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-3">
                <h2 className="text-2xl font-bold">{client.name}</h2>
                <p className="text-sm text-muted-foreground">Cliente desde {format(new Date(client.created_at), "MMMM 'de' yyyy", { locale: ptBR })}</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" />{client.phone}</span>
                  {client.email && <span className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" />{client.email}</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg"><p className="text-2xl font-bold text-primary">{stats.totalAppointments}</p><p className="text-xs text-muted-foreground">Agendamentos</p></div>
                <div className="text-center p-3 bg-muted/50 rounded-lg"><p className="text-2xl font-bold text-green-600">{stats.completedAppointments}</p><p className="text-xs text-muted-foreground">Realizados</p></div>
                <div className="text-center p-3 bg-muted/50 rounded-lg"><p className="text-2xl font-bold text-red-500">{stats.cancelledAppointments}</p><p className="text-xs text-muted-foreground">Cancelados</p></div>
                <div className="text-center p-3 bg-muted/50 rounded-lg"><p className="text-2xl font-bold">R$ {stats.totalRevenue.toFixed(0)}</p><p className="text-xs text-muted-foreground">Total Gasto</p></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="appointments"><Calendar className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Agendamentos</span></TabsTrigger>
            <TabsTrigger value="documents"><FileText className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Documentos</span></TabsTrigger>
            <TabsTrigger value="quotes"><Receipt className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Orçamentos</span></TabsTrigger>
            <TabsTrigger value="photos"><Image className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Fotos</span></TabsTrigger>
            <TabsTrigger value="info"><Info className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Informações</span></TabsTrigger>
          </TabsList>
          <TabsContent value="appointments"><ClientAppointmentsTab appointments={appointments} /></TabsContent>
          <TabsContent value="documents"><ClientDocumentsTab documents={documents} clientId={client.id} onAddDocument={addDocument.mutateAsync} /></TabsContent>
          <TabsContent value="quotes"><ClientQuotesTab quotes={quotes} clientId={client.id} clientPhone={client.phone} onAddQuote={addQuote.mutateAsync} onUpdateQuote={updateQuote.mutateAsync} /></TabsContent>
          <TabsContent value="photos"><ClientPhotosTab photos={photos} clientId={client.id} onAddPhoto={addPhoto.mutateAsync} /></TabsContent>
          <TabsContent value="info"><ClientInfoTab client={client} onUpdate={updateClient.mutateAsync} /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
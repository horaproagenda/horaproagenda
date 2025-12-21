import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Package, Briefcase, CheckCircle, Clock, XCircle, Eye, Calendar, Hash, Target } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useClientPackages } from '@/hooks/useClientPackages';
import { useClientServices } from '@/hooks/useClientServices';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface ClientCreditsTabProps {
  clientId: string;
}

interface PackageAppointmentDetail {
  id: string;
  session_number: number;
  status: string;
  scheduled_date: string | null;
  appointment_id: string | null;
  appointment?: {
    start_time: string;
    end_time: string;
    status: string;
  } | null;
}

export function ClientCreditsTab({ clientId }: ClientCreditsTabProps) {
  const queryClient = useQueryClient();
  const { clientPackages, isLoading: loadingPackages } = useClientPackages(clientId);
  const { clientServices, isLoading: loadingServices } = useClientServices(clientId);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  // Subscribe to realtime changes for package_appointments
  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`package-appointments-credits-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'package_appointments',
        },
        () => {
          // Refresh package details and packages
          queryClient.invalidateQueries({ queryKey: ['package_details'] });
          queryClient.invalidateQueries({ queryKey: ['client_packages', clientId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
        },
        () => {
          // Refresh when appointment status changes
          queryClient.invalidateQueries({ queryKey: ['package_details'] });
          queryClient.invalidateQueries({ queryKey: ['client_packages', clientId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, queryClient]);

  const { data: packageDetails, refetch: refetchPackageDetails } = useQuery({
    queryKey: ['package_details', selectedPackageId],
    queryFn: async () => {
      if (!selectedPackageId) return null;
      
      const { data, error } = await supabase
        .from('package_appointments')
        .select(`
          *,
          appointment:appointments!package_appointments_appointment_id_fkey(start_time, end_time, status)
        `)
        .eq('package_id', selectedPackageId)
        .order('session_number', { ascending: true });

      if (error) {
        console.error('Error fetching package details:', error);
        throw error;
      }
      console.log('Package details fetched:', data?.length, 'sessions');
      return data as PackageAppointmentDetail[];
    },
    enabled: !!selectedPackageId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const isLoading = loadingPackages || loadingServices;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const totalPackageSessions = clientPackages.reduce((sum, pkg) => sum + (pkg.total_sessions - pkg.sessions_scheduled), 0);
  const availableServicesCount = clientServices.filter(s => s.status === 'available').length;
  const awaitingScheduleCount = clientServices.filter(s => s.status === 'available' && !s.appointment_id).length;
  const selectedPackage = clientPackages.find(p => p.id === selectedPackageId);

  // Calculate sessions based on actual appointment status for accuracy
  const completedSessions = packageDetails?.filter(s => 
    s.appointment?.status === 'completed'
  ).length || 0;
  
  const scheduledSessions = packageDetails?.filter(s => 
    s.appointment_id && s.appointment?.status !== 'completed' && s.appointment?.status !== 'cancelled' && s.appointment?.status !== 'missed'
  ).length || 0;
  
  const pendingSessions = packageDetails?.filter(s => 
    !s.appointment_id || s.status === 'pending'
  ).length || 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-primary/10">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{totalPackageSessions}</p>
                <p className="text-sm text-muted-foreground">Sessões de pacotes disponíveis</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-green-500/10">
                <Briefcase className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{availableServicesCount}</p>
                <p className="text-sm text-muted-foreground">Serviços pagos disponíveis</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Packages Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Pacotes do Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {clientPackages.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Nenhum pacote adquirido
            </p>
          ) : (
            <div className="space-y-3">
              {clientPackages.map(pkg => {
                const remaining = pkg.total_sessions - pkg.sessions_scheduled;
                const isComplete = remaining === 0;
                // Check if there are other packages with same name
                const sameNameCount = clientPackages.filter(p => p.name === pkg.name).length;
                const packageDate = pkg.created_at ? format(new Date(pkg.created_at), 'dd/MM/yyyy', { locale: ptBR }) : '';
                
                return (
                  <div
                    key={pkg.id}
                    className={`p-4 rounded-lg border ${
                      isComplete 
                        ? 'bg-muted/50 border-muted' 
                        : 'bg-primary/5 border-primary/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-medium">{pkg.name}</h4>
                        {sameNameCount > 1 && (
                          <span className="text-xs text-muted-foreground">Adquirido em {packageDate}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isComplete ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Completo
                          </Badge>
                        ) : (
                          <Badge className="bg-green-500 text-white gap-1">
                            <Clock className="h-3 w-3" />
                            {remaining} sessão(ões) disponível(eis)
                          </Badge>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setSelectedPackageId(pkg.id)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Detalhes
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span>{pkg.sessions_scheduled} de {pkg.total_sessions} sessões utilizadas</span>
                      <span className="mx-2">•</span>
                      <span>R$ {Number(pkg.total_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${isComplete ? 'bg-muted-foreground' : 'bg-primary'}`}
                        style={{ width: `${(pkg.sessions_scheduled / pkg.total_sessions) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Services Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Serviços Pagos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {clientServices.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Nenhum serviço pago antecipadamente
            </p>
          ) : (
            <div className="space-y-3">
              {clientServices.map(service => {
                const isAvailable = service.status === 'available';
                const isUsed = service.status === 'used';
                const isAwaitingSchedule = service.status === 'available' && !service.appointment_id;
                
                return (
                  <div
                    key={service.id}
                    className={`p-4 rounded-lg border ${
                      isUsed 
                        ? 'bg-muted/50 border-muted' 
                        : isAwaitingSchedule
                          ? 'bg-orange-500/5 border-orange-500/20'
                          : 'bg-green-500/5 border-green-500/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium">{service.service?.name || 'Serviço'}</h4>
                      {isAwaitingSchedule ? (
                        <Badge className="bg-orange-500 text-white gap-1">
                          <Clock className="h-3 w-3" />
                          Aguardando Agendamento
                        </Badge>
                      ) : isAvailable ? (
                        <Badge className="bg-green-500 text-white gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Disponível
                        </Badge>
                      ) : isUsed ? (
                        <Badge variant="secondary" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Utilizado
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          Expirado
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span>R$ {Number(service.amount_paid).toFixed(2)}</span>
                      <span className="mx-2">•</span>
                      <span>Comprado em {format(new Date(service.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                      {service.used_at && (
                        <>
                          <span className="mx-2">•</span>
                          <span>Usado em {format(new Date(service.used_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Package Details Dialog */}
      <Dialog open={!!selectedPackageId} onOpenChange={(open) => !open && setSelectedPackageId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Detalhes do Pacote: {selectedPackage?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold text-green-600">{completedSessions}</p>
                      <p className="text-xs text-muted-foreground">Realizadas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-2xl font-bold text-blue-600">{scheduledSessions}</p>
                      <p className="text-xs text-muted-foreground">Agendadas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Hash className="h-5 w-5 text-orange-500" />
                    <div>
                      <p className="text-2xl font-bold text-orange-600">{pendingSessions}</p>
                      <p className="text-xs text-muted-foreground">Restantes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sessions List */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Sessões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {packageDetails?.map((session) => {
                    const isCompleted = session.appointment?.status === 'completed';
                    const isCancelled = session.appointment?.status === 'cancelled';
                    const isMissed = session.appointment?.status === 'missed';
                    const isScheduled = session.appointment_id && !isCompleted && !isCancelled && !isMissed;
                    const isPending = !session.appointment_id;
                    
                    const getStatusLabel = () => {
                      if (isCompleted) return 'Realizada';
                      if (isCancelled) return 'Cancelada';
                      if (isMissed) return 'Faltou';
                      if (isScheduled) return 'Agendada';
                      return 'Aguardando Agendamento';
                    };
                    
                    const getStatusColor = () => {
                      if (isCompleted) return 'bg-green-500/5 border-green-500/20';
                      if (isCancelled || isMissed) return 'bg-red-500/5 border-red-500/20';
                      if (isScheduled) return 'bg-blue-500/5 border-blue-500/20';
                      return 'bg-orange-500/5 border-orange-500/20';
                    };
                    
                    return (
                      <div 
                        key={session.id} 
                        className={`p-3 rounded-lg border flex items-center justify-between ${getStatusColor()}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-sm">Sessão {session.session_number}</span>
                          {session.appointment && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(session.appointment.start_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          )}
                        </div>
                        <Badge 
                          variant={isCompleted ? "default" : isScheduled ? "secondary" : "outline"}
                          className={
                            isCompleted ? "bg-green-500" : 
                            isCancelled || isMissed ? "bg-red-500 text-white" : 
                            isPending ? "bg-orange-500 text-white" : ""
                          }
                        >
                          {getStatusLabel()}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

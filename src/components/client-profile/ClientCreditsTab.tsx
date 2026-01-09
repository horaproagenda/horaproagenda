import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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

  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`package-appointments-credits-${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_appointments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['package_details'] });
        queryClient.invalidateQueries({ queryKey: ['client_packages', clientId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['package_details'] });
        queryClient.invalidateQueries({ queryKey: ['client_packages', clientId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, queryClient]);

  const { data: packageDetails } = useQuery({
    queryKey: ['package_details', selectedPackageId],
    queryFn: async () => {
      if (!selectedPackageId) return null;
      
      const { data, error } = await supabase
        .from('package_appointments')
        .select(`*, appointment:appointments!package_appointments_appointment_id_fkey(start_time, end_time, status)`)
        .eq('package_id', selectedPackageId)
        .order('session_number', { ascending: true });

      if (error) throw error;
      return data as PackageAppointmentDetail[];
    },
    enabled: !!selectedPackageId,
    staleTime: 0,
  });

  const isLoading = loadingPackages || loadingServices;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const totalPackageSessions = clientPackages.reduce((sum, pkg) => sum + (pkg.total_sessions - pkg.sessions_scheduled), 0);
  const availableServicesCount = clientServices.filter(s => s.status === 'available').length;
  const selectedPackage = clientPackages.find(p => p.id === selectedPackageId);

  const completedSessions = packageDetails?.filter(s => s.appointment?.status === 'completed').length || 0;
  const scheduledSessions = packageDetails?.filter(s => 
    s.appointment_id && s.appointment?.status !== 'completed' && s.appointment?.status !== 'cancelled'
  ).length || 0;
  const pendingSessions = packageDetails?.filter(s => !s.appointment_id || s.status === 'pending').length || 0;

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Summary Cards - Compact */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xl font-bold text-primary">{totalPackageSessions}</p>
                <p className="text-[10px] text-muted-foreground">Sessões Pacotes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-xl font-bold text-green-600">{availableServicesCount}</p>
                <p className="text-[10px] text-muted-foreground">Serviços Pagos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Packages Section - Compact */}
      <Card>
        <CardContent className="p-3">
          <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Package className="h-3.5 w-3.5" /> Pacotes
          </h3>
          {clientPackages.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nenhum pacote</p>
          ) : (
            <div className="space-y-2">
              {clientPackages.map(pkg => {
                const remaining = pkg.total_sessions - pkg.sessions_scheduled;
                const isComplete = remaining === 0;
                const progress = (pkg.sessions_scheduled / pkg.total_sessions) * 100;
                
                return (
                  <div
                    key={pkg.id}
                    className={`p-2.5 rounded-lg border ${isComplete ? 'bg-muted/30' : 'bg-primary/5 border-primary/20'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-sm truncate">{pkg.name}</h4>
                        <p className="text-[10px] text-muted-foreground">
                          {pkg.sessions_scheduled}/{pkg.total_sessions} • R$ {Number(pkg.total_price).toFixed(0)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isComplete ? (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                            <CheckCircle className="h-2.5 w-2.5" /> Completo
                          </Badge>
                        ) : (
                          <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0">
                            {remaining} disp.
                          </Badge>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedPackageId(pkg.id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${isComplete ? 'bg-muted-foreground' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Services Section - Compact */}
      <Card>
        <CardContent className="p-3">
          <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Briefcase className="h-3.5 w-3.5" /> Serviços Pagos
          </h3>
          {clientServices.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nenhum serviço pago</p>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {clientServices.map(service => {
                const isAvailable = service.status === 'available';
                const isUsed = service.status === 'used';
                const isCancelled = service.status === 'expired' && service.notes?.includes('CANCELADO');
                const isAwaitingSchedule = service.status === 'available' && !service.appointment_id;
                
                return (
                  <div
                    key={service.id}
                    className={`p-2 rounded-lg border text-xs ${
                      isCancelled ? 'bg-destructive/5 border-destructive/20' :
                      isUsed ? 'bg-muted/30' :
                      isAwaitingSchedule ? 'bg-orange-500/5 border-orange-500/20' :
                      'bg-green-500/5 border-green-500/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{service.service?.name || 'Serviço'}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-muted-foreground">R$ {Number(service.amount_paid).toFixed(0)}</span>
                        {isCancelled ? (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0">Canc.</Badge>
                        ) : isAwaitingSchedule ? (
                          <Badge className="bg-orange-500 text-white text-[10px] px-1 py-0">Aguard.</Badge>
                        ) : isAvailable ? (
                          <Badge className="bg-green-500 text-white text-[10px] px-1 py-0">Disp.</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">Usado</Badge>
                        )}
                      </div>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" /> {selectedPackage?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3">
            {/* Mini Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 bg-green-500/5 rounded-lg text-center">
                <p className="text-lg font-bold text-green-600">{completedSessions}</p>
                <p className="text-[10px] text-muted-foreground">Realizadas</p>
              </div>
              <div className="p-2 bg-blue-500/5 rounded-lg text-center">
                <p className="text-lg font-bold text-blue-600">{scheduledSessions}</p>
                <p className="text-[10px] text-muted-foreground">Agendadas</p>
              </div>
              <div className="p-2 bg-orange-500/5 rounded-lg text-center">
                <p className="text-lg font-bold text-orange-600">{pendingSessions}</p>
                <p className="text-[10px] text-muted-foreground">Restantes</p>
              </div>
            </div>

            {/* Sessions List */}
            <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
              {packageDetails?.map((session) => {
                const isCompleted = session.appointment?.status === 'completed';
                const isCancelled = session.appointment?.status === 'cancelled';
                const isScheduled = session.appointment_id && !isCompleted && !isCancelled;
                
                const getStatusColor = () => {
                  if (isCompleted) return 'bg-green-500/5 border-green-500/20';
                  if (isCancelled) return 'bg-red-500/5 border-red-500/20';
                  if (isScheduled) return 'bg-blue-500/5 border-blue-500/20';
                  return 'bg-orange-500/5 border-orange-500/20';
                };
                
                return (
                  <div key={session.id} className={`p-2 rounded-lg border flex items-center justify-between ${getStatusColor()}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Sessão {session.session_number}</span>
                      {session.appointment && (
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(session.appointment.start_time), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      )}
                    </div>
                    <Badge 
                      variant={isCompleted ? 'default' : isCancelled ? 'destructive' : isScheduled ? 'secondary' : 'outline'}
                      className={`text-[10px] px-1.5 py-0 ${isCompleted ? 'bg-green-500' : ''}`}
                    >
                      {isCompleted ? 'Realizada' : isCancelled ? 'Cancelada' : isScheduled ? 'Agendada' : 'Pendente'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Briefcase, CheckCircle, Clock, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useClientPackages } from '@/hooks/useClientPackages';
import { useClientServices } from '@/hooks/useClientServices';
import { Skeleton } from '@/components/ui/skeleton';

interface ClientCreditsTabProps {
  clientId: string;
}

export function ClientCreditsTab({ clientId }: ClientCreditsTabProps) {
  const { clientPackages, isLoading: loadingPackages } = useClientPackages(clientId);
  const { clientServices, isLoading: loadingServices } = useClientServices(clientId);

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
                      <h4 className="font-medium">{pkg.name}</h4>
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
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span>{pkg.sessions_scheduled} de {pkg.total_sessions} sessões utilizadas</span>
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
                
                return (
                  <div
                    key={service.id}
                    className={`p-4 rounded-lg border ${
                      isUsed 
                        ? 'bg-muted/50 border-muted' 
                        : 'bg-green-500/5 border-green-500/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium">{service.service?.name || 'Serviço'}</h4>
                      {isAvailable ? (
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
    </div>
  );
}

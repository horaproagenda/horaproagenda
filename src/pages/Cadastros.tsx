import { Building2, Users, Wrench } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ManageRoomsDialog } from '@/components/services/ManageRoomsDialog';
import { ManageProfessionalsDialog } from '@/components/services/ManageProfessionalsDialog';
import { ManageEquipmentDialog } from '@/components/cadastros/ManageEquipmentDialog';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/layout/PageTransition';
import { useRooms } from '@/hooks/useRooms';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useEquipment } from '@/hooks/useEquipment';
import { Badge } from '@/components/ui/badge';

export default function Cadastros() {
  const { rooms } = useRooms();
  const { professionals } = useProfessionals();
  const { equipment } = useEquipment();

  const activeRooms = rooms.filter(r => r.is_active).length;
  const activeProfessionals = professionals.filter(p => p.is_active).length;
  const activeEquipment = equipment.filter(e => e.is_active).length;

  return (
    <AppLayout title="Cadastros" subtitle="Gerencie salas, profissionais e equipamentos">
      <PageTransition>
        <div className="grid gap-6 md:grid-cols-3">
          {/* Salas */}
          <Card className="card-hover border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-medium">Salas</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Espaços de atendimento
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-3xl font-bold tracking-tight">{rooms.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total cadastradas</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {activeRooms} ativas
                </Badge>
              </div>
              <ManageRoomsDialog>
                <button className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 text-sm font-medium tracking-wide">
                  Gerenciar Salas
                </button>
              </ManageRoomsDialog>
            </CardContent>
          </Card>

          {/* Profissionais */}
          <Card className="card-hover border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-violet-500/10">
                    <Users className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-medium">Profissionais</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Equipe de atendimento
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-3xl font-bold tracking-tight">{professionals.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total cadastrados</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {activeProfessionals} ativos
                </Badge>
              </div>
              <ManageProfessionalsDialog>
                <button className="w-full py-2.5 px-4 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-all duration-300 text-sm font-medium tracking-wide">
                  Gerenciar Profissionais
                </button>
              </ManageProfessionalsDialog>
            </CardContent>
          </Card>

          {/* Equipamentos */}
          <Card className="card-hover border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10">
                    <Wrench className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-medium">Equipamentos</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Recursos disponíveis
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-3xl font-bold tracking-tight">{equipment.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total cadastrados</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {activeEquipment} ativos
                </Badge>
              </div>
              <ManageEquipmentDialog>
                <button className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all duration-300 text-sm font-medium tracking-wide">
                  Gerenciar Equipamentos
                </button>
              </ManageEquipmentDialog>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    </AppLayout>
  );
}

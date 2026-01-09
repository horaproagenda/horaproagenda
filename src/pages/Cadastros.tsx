import { Building2, Users, Wrench } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ManageRoomsDialog } from '@/components/services/ManageRoomsDialog';
import { ManageProfessionalsDialog } from '@/components/services/ManageProfessionalsDialog';
import { ManageEquipmentDialog } from '@/components/cadastros/ManageEquipmentDialog';
import { AppLayout } from '@/components/layout/AppLayout';
import { useRooms } from '@/hooks/useRooms';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useEquipment } from '@/hooks/useEquipment';

export default function Cadastros() {
  const { rooms } = useRooms();
  const { professionals } = useProfessionals();
  const { equipment } = useEquipment();

  const activeRooms = rooms.filter(r => r.is_active).length;
  const activeProfessionals = professionals.filter(p => p.is_active).length;
  const activeEquipment = equipment.filter(e => e.is_active).length;

  return (
    <AppLayout title="Cadastros" subtitle="Gerencie salas, profissionais e equipamentos">
      <div className="grid gap-4 md:grid-cols-3 page-enter">
        {/* Salas */}
        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-medium tracking-wide">Salas</CardTitle>
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rooms.length}</div>
            <CardDescription className="mt-1 text-xs">
              {activeRooms} ativas
            </CardDescription>
            <div className="mt-4">
              <ManageRoomsDialog>
                <button className="w-full py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 text-sm font-medium tracking-wide btn-vibrant">
                  Gerenciar Salas
                </button>
              </ManageRoomsDialog>
            </div>
          </CardContent>
        </Card>

        {/* Profissionais */}
        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-medium tracking-wide">Profissionais</CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{professionals.length}</div>
            <CardDescription className="mt-1 text-xs">
              {activeProfessionals} ativos
            </CardDescription>
            <div className="mt-4">
              <ManageProfessionalsDialog>
                <button className="w-full py-2 px-4 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-all duration-300 text-sm font-medium tracking-wide btn-vibrant">
                  Gerenciar Profissionais
                </button>
              </ManageProfessionalsDialog>
            </div>
          </CardContent>
        </Card>

        {/* Equipamentos */}
        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-medium tracking-wide">Equipamentos</CardTitle>
            <Wrench className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{equipment.length}</div>
            <CardDescription className="mt-1 text-xs">
              {activeEquipment} ativos
            </CardDescription>
            <div className="mt-4">
              <ManageEquipmentDialog>
                <button className="w-full py-2 px-4 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all duration-300 text-sm font-medium tracking-wide btn-vibrant">
                  Gerenciar Equipamentos
                </button>
              </ManageEquipmentDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

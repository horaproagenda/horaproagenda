import { Building2, Users, Wrench } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ManageRoomsDialog } from '@/components/services/ManageRoomsDialog';
import { ManageProfessionalsDialog } from '@/components/services/ManageProfessionalsDialog';
import { ManageEquipmentDialog } from '@/components/cadastros/ManageEquipmentDialog';
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">
          Cadastros
        </h1>
        <p className="text-muted-foreground mt-1">
          Gerencie salas, profissionais e equipamentos
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Salas */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Salas</CardTitle>
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{rooms.length}</div>
            <CardDescription className="mt-1">
              {activeRooms} ativas
            </CardDescription>
            <div className="mt-4">
              <ManageRoomsDialog>
                <button className="w-full py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium">
                  Gerenciar Salas
                </button>
              </ManageRoomsDialog>
            </div>
          </CardContent>
        </Card>

        {/* Profissionais */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Profissionais</CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{professionals.length}</div>
            <CardDescription className="mt-1">
              {activeProfessionals} ativos
            </CardDescription>
            <div className="mt-4">
              <ManageProfessionalsDialog>
                <button className="w-full py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium">
                  Gerenciar Profissionais
                </button>
              </ManageProfessionalsDialog>
            </div>
          </CardContent>
        </Card>

        {/* Equipamentos */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Equipamentos</CardTitle>
            <Wrench className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{equipment.length}</div>
            <CardDescription className="mt-1">
              {activeEquipment} ativos
            </CardDescription>
            <div className="mt-4">
              <ManageEquipmentDialog>
                <button className="w-full py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium">
                  Gerenciar Equipamentos
                </button>
              </ManageEquipmentDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

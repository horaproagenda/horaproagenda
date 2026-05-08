import { useState } from 'react';
import { Users, Shield, Plus, Trash2, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { AppRole } from '@/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const roleLabels: Record<AppRole, { label: string; description: string; variant: 'default' | 'secondary' | 'outline' }> = {
  admin: { label: 'Administrador', description: 'Acesso total ao sistema', variant: 'default' },
  receptionist: { label: 'Recepcionista', description: 'Gerencia agendamentos e clientes', variant: 'secondary' },
  professional: { label: 'Profissional', description: 'Vê apenas seus próprios dados', variant: 'outline' },
};

export default function UserManagement() {
  const { users, isLoading, assignRole, removeRole } = useUserRoles();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole | ''>('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleAssignRole = () => {
    if (selectedUser && selectedRole) {
      assignRole.mutate({ userId: selectedUser, role: selectedRole as AppRole });
      setSelectedUser(null);
      setSelectedRole('');
      setDialogOpen(false);
    }
  };

  const handleRemoveRole = (userId: string, role: AppRole) => {
    removeRole.mutate({ userId, role });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Gerenciamento de Usuários
        </CardTitle>
        <CardDescription>
          Gerencie os usuários e suas permissões de acesso ao sistema
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(roleLabels).map(([role, info]) => (
              <Card key={role} className="border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <Badge variant={info.variant}>{info.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{info.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando usuários...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum usuário encontrado
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Permissões</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length === 0 ? (
                          <span className="text-muted-foreground text-sm">Sem permissões</span>
                        ) : (
                          user.roles.map((role) => (
                            <div key={role} className="flex items-center gap-1">
                              <Badge variant={roleLabels[role]?.variant || 'default'}>
                                {roleLabels[role]?.label || role}
                              </Badge>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remover permissão?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Deseja remover a permissão de {roleLabels[role]?.label} de {user.full_name}?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleRemoveRole(user.id, role)}>
                                      Remover
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(user.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Dialog open={dialogOpen && selectedUser === user.id} onOpenChange={(open) => {
                        setDialogOpen(open);
                        if (!open) {
                          setSelectedUser(null);
                          setSelectedRole('');
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedUser(user.id)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Adicionar
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Adicionar Permissão</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <p className="text-sm text-muted-foreground">
                              Selecione a permissão para {user.full_name}
                            </p>
                            <Select
                              value={selectedRole}
                              onValueChange={(value) => setSelectedRole(value as AppRole)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione uma permissão" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(roleLabels)
                                  .filter(([role]) => !user.roles.includes(role as AppRole))
                                  .map(([role, info]) => (
                                    <SelectItem key={role} value={role}>
                                      {info.label}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <DialogFooter>
                            <Button
                              onClick={handleAssignRole}
                              disabled={!selectedRole || assignRole.isPending}
                            >
                              {assignRole.isPending ? 'Adicionando...' : 'Adicionar'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

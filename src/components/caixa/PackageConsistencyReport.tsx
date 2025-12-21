import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, Package, RefreshCw, Wrench, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface InconsistentSale {
  id: string;
  client_id: string;
  client_name: string;
  package_id: string;
  package_name: string;
  final_amount: number;
  sale_date: string;
  has_client_package: boolean;
}

export function PackageConsistencyReport() {
  const queryClient = useQueryClient();
  const [isFixing, setIsFixing] = useState(false);
  const [showFixDialog, setShowFixDialog] = useState(false);

  const { data: report, isLoading, refetch } = useQuery({
    queryKey: ['package_consistency_report'],
    queryFn: async () => {
      // Get all package sales
      const { data: packageSales, error: salesError } = await supabase
        .from('single_sales')
        .select(`
          id,
          client_id,
          package_id,
          final_amount,
          sale_date,
          client:clients(name),
          package:service_packages!single_sales_package_id_fkey(name, total_sessions, client_id)
        `)
        .eq('item_type', 'package')
        .not('client_id', 'is', null)
        .order('sale_date', { ascending: false });

      if (salesError) throw salesError;

      // Get all client packages
      const { data: clientPackages, error: pkgError } = await supabase
        .from('service_packages')
        .select('id, client_id, template_id, name')
        .not('client_id', 'is', null);

      if (pkgError) throw pkgError;

      // Find inconsistencies
      const inconsistencies: InconsistentSale[] = [];
      const consistent: InconsistentSale[] = [];

      for (const sale of packageSales || []) {
        // Check if there's a client package for this sale
        // A client package should exist with client_id matching the sale and template_id matching the package_id
        const hasClientPackage = clientPackages?.some(
          cp => cp.client_id === sale.client_id && 
                (cp.template_id === sale.package_id || cp.name === sale.package?.name)
        );

        const item: InconsistentSale = {
          id: sale.id,
          client_id: sale.client_id!,
          client_name: sale.client?.name || 'Cliente desconhecido',
          package_id: sale.package_id!,
          package_name: sale.package?.name || 'Pacote desconhecido',
          final_amount: sale.final_amount,
          sale_date: sale.sale_date,
          has_client_package: !!hasClientPackage,
        };

        if (hasClientPackage) {
          consistent.push(item);
        } else {
          inconsistencies.push(item);
        }
      }

      return {
        totalSales: packageSales?.length || 0,
        consistent,
        inconsistencies,
      };
    },
  });

  const handleFixInconsistencies = async () => {
    if (!report?.inconsistencies.length) return;

    setIsFixing(true);
    try {
      let fixed = 0;

      for (const sale of report.inconsistencies) {
        // Get the template package data
        const { data: templatePackage } = await supabase
          .from('service_packages')
          .select('*')
          .eq('id', sale.package_id)
          .maybeSingle();

        if (!templatePackage) continue;

        // Create client package
        const { data: clientPackage, error: pkgError } = await supabase
          .from('service_packages')
          .insert({
            client_id: sale.client_id,
            template_id: sale.package_id,
            name: templatePackage.name,
            description: templatePackage.description,
            total_price: sale.final_amount,
            total_sessions: templatePackage.total_sessions,
            duration: templatePackage.duration || 60,
            interval_days: templatePackage.interval_days || 7,
            professional_id: templatePackage.professional_id,
            room_id: templatePackage.room_id,
            equipment: templatePackage.equipment || [],
            sessions_scheduled: 0,
            is_active: true,
            category: 'Corrigido automaticamente',
          })
          .select()
          .single();

        if (pkgError) {
          console.error('Error creating client package:', pkgError);
          continue;
        }

        // Create package appointments (sessions)
        const sessions = Array.from({ length: templatePackage.total_sessions }, (_, idx) => ({
          package_id: clientPackage.id,
          session_number: idx + 1,
          status: 'pending',
        }));

        await supabase.from('package_appointments').insert(sessions);
        fixed++;
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['package_consistency_report'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });

      toast.success(`${fixed} pacote(s) corrigido(s) com sucesso!`);
      setShowFixDialog(false);
      refetch();
    } catch (error: any) {
      toast.error('Erro ao corrigir pacotes: ' + error.message);
    } finally {
      setIsFixing(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hasInconsistencies = (report?.inconsistencies.length || 0) > 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Relatório de Consistência de Pacotes
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold text-blue-600">{report?.totalSales || 0}</p>
                <p className="text-sm text-muted-foreground">Total de vendas de pacotes</p>
              </CardContent>
            </Card>
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold text-green-600">{report?.consistent.length || 0}</p>
                    <p className="text-sm text-muted-foreground">Consistentes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <div>
                    <p className="text-2xl font-bold text-destructive">{report?.inconsistencies.length || 0}</p>
                    <p className="text-sm text-muted-foreground">Inconsistências</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Inconsistencies Alert */}
          {hasInconsistencies && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Inconsistências detectadas</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>
                  {report?.inconsistencies.length} venda(s) de pacote não geraram pacotes para os clientes.
                </span>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setShowFixDialog(true)}
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  Corrigir Agora
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!hasInconsistencies && report && (
            <Alert className="border-green-500/50 bg-green-500/10">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-600">Tudo certo!</AlertTitle>
              <AlertDescription>
                Todas as vendas de pacotes estão consistentes com os pacotes dos clientes.
              </AlertDescription>
            </Alert>
          )}

          {/* Inconsistencies Table */}
          {hasInconsistencies && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Pacote</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report?.inconsistencies.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>
                        {format(new Date(sale.sale_date), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-medium">{sale.client_name}</TableCell>
                      <TableCell>{sale.package_name}</TableCell>
                      <TableCell className="text-right">
                        R$ {Number(sale.final_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Pacote não criado
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fix Confirmation Dialog */}
      <Dialog open={showFixDialog} onOpenChange={setShowFixDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Corrigir Inconsistências
            </DialogTitle>
            <DialogDescription>
              Esta ação irá criar os pacotes faltantes para {report?.inconsistencies.length} cliente(s).
              Cada pacote terá suas sessões criadas automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Os pacotes serão marcados com a categoria "Corrigido automaticamente" para fácil identificação.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFixDialog(false)} disabled={isFixing}>
              Cancelar
            </Button>
            <Button onClick={handleFixInconsistencies} disabled={isFixing}>
              {isFixing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Corrigindo...
                </>
              ) : (
                <>
                  <Wrench className="h-4 w-4 mr-2" />
                  Confirmar Correção
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

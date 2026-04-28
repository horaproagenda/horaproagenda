import { useMemo, useState } from 'react';
import { BarChart3, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useServicePackages } from '@/hooks/useServicePackages';
import { getPackageAvailabilitySummary } from '@/lib/packageAvailability';

export function PackageAvailabilityReportDialog() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { packages, isLoading } = useServicePackages();

  const rows = useMemo(() => {
    return packages
      .filter(pkg => pkg.client_id)
      .map(pkg => ({ pkg, summary: getPackageAvailabilitySummary(pkg) }))
      .filter(({ pkg }) => {
        const term = search.toLowerCase().trim();
        if (!term) return true;
        return pkg.name.toLowerCase().includes(term) || pkg.client?.name?.toLowerCase().includes(term);
      });
  }, [packages, search]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <BarChart3 className="h-3.5 w-3.5" />
          Diagnóstico
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Diagnóstico de disponibilidade dos pacotes</DialogTitle>
          <DialogDescription>
            Pacotes vendidos com total, agendadas, consumidas, passos e motivo de indisponibilidade.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por pacote ou cliente..."
            className="pl-9 h-9"
          />
        </div>

        <div className="overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pacote</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Existem</TableHead>
                <TableHead>Agendadas</TableHead>
                <TableHead>Consumidas</TableHead>
                <TableHead>Dá para agendar</TableHead>
                <TableHead>Passos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Nenhum pacote vendido encontrado</TableCell></TableRow>
              ) : rows.map(({ pkg, summary }) => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-medium">{pkg.name}</TableCell>
                  <TableCell>{pkg.client?.name || '-'}</TableCell>
                  <TableCell>{summary.totalSessions}</TableCell>
                  <TableCell>{summary.existingSessionRecords}</TableCell>
                  <TableCell>{summary.scheduledAppointments}</TableCell>
                  <TableCell>{summary.consumedSessions}</TableCell>
                  <TableCell>{summary.schedulableSessions}</TableCell>
                  <TableCell>{summary.stepsCount || (pkg.package_type === 'sequential' ? summary.existingSessionRecords : '-')}</TableCell>
                  <TableCell>
                    <Badge variant={pkg.is_active ? 'default' : 'secondary'}>{pkg.is_active ? 'Ativo' : 'Inativo'}</Badge>
                    {summary.hasInconsistentCounter && <Badge variant="outline" className="ml-1">contador</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{summary.unavailableReason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
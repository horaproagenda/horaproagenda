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
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col text-xs sm:text-sm">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">Diagnóstico de disponibilidade dos pacotes</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Pacotes vendidos com total, agendadas, consumidas, passos e motivo de indisponibilidade.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por pacote ou cliente..."
            className="pl-9 h-8 text-xs sm:text-sm"
          />
        </div>

        <div className="overflow-auto rounded-md border">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 px-2">Pacote</TableHead>
                <TableHead className="h-8 px-2">Cliente</TableHead>
                <TableHead className="h-8 px-2">Total</TableHead>
                <TableHead className="h-8 px-2">Existem</TableHead>
                <TableHead className="h-8 px-2">Agendadas</TableHead>
                <TableHead className="h-8 px-2">Consumidas</TableHead>
                <TableHead className="h-8 px-2">Dá para agendar</TableHead>
                <TableHead className="h-8 px-2">Passos</TableHead>
                <TableHead className="h-8 px-2">Status</TableHead>
                <TableHead className="h-8 px-2">Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Nenhum pacote vendido encontrado</TableCell></TableRow>
              ) : rows.map(({ pkg, summary }) => (
                <TableRow key={pkg.id}>
                  <TableCell className="px-2 py-1.5 font-medium">{pkg.name}</TableCell>
                  <TableCell className="px-2 py-1.5">{pkg.client?.name || '-'}</TableCell>
                  <TableCell className="px-2 py-1.5">{summary.totalSessions}</TableCell>
                  <TableCell className="px-2 py-1.5">{summary.existingSessionRecords}</TableCell>
                  <TableCell className="px-2 py-1.5">{summary.scheduledAppointments}</TableCell>
                  <TableCell className="px-2 py-1.5">{summary.consumedSessions}</TableCell>
                  <TableCell className="px-2 py-1.5">{summary.schedulableSessions}</TableCell>
                  <TableCell className="px-2 py-1.5">{summary.stepsCount || (pkg.package_type === 'sequential' ? summary.existingSessionRecords : '-')}</TableCell>
                  <TableCell className="px-2 py-1.5">
                    <Badge variant={summary.unavailableReason === 'Pacote completamente usado' ? 'secondary' : pkg.is_active ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                      {summary.unavailableReason === 'Pacote completamente usado' ? 'Usado' : pkg.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    {summary.hasInconsistentCounter && <Badge variant="outline" className="ml-1">contador</Badge>}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{summary.unavailableReason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
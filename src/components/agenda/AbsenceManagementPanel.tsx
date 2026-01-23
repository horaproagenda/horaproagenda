import { useState, useMemo } from 'react';
import { format, isSameDay, startOfDay, endOfDay, isAfter, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  UserX,
  Calendar,
  Clock,
  Edit,
  Trash2,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useProfessionalAbsences, ProfessionalAbsence } from '@/hooks/useProfessionalAbsences';
import { Professional } from '@/types';

interface AbsenceManagementPanelProps {
  professionals: Professional[];
  onEditAbsence: (absence: ProfessionalAbsence) => void;
  onNewAbsence: () => void;
}

export function AbsenceManagementPanel({
  professionals,
  onEditAbsence,
  onNewAbsence,
}: AbsenceManagementPanelProps) {
  const { absences, deleteAbsence, isLoading } = useProfessionalAbsences();
  const [searchTerm, setSearchTerm] = useState('');
  const [professionalFilter, setProfessionalFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('upcoming');
  const [isOpen, setIsOpen] = useState(false); // Recolhido por padrão
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const activeProfessionals = professionals.filter(p => p.is_active);

  const filteredAbsences = useMemo(() => {
    const now = new Date();
    
    return absences.filter(absence => {
      // Professional filter
      if (professionalFilter !== 'all' && absence.professional_id !== professionalFilter) {
        return false;
      }

      // Period filter
      const absenceStart = new Date(absence.start_time);
      const absenceEnd = new Date(absence.end_time);
      
      if (periodFilter === 'upcoming') {
        if (isBefore(absenceEnd, now)) return false;
      } else if (periodFilter === 'past') {
        if (isAfter(absenceStart, now)) return false;
      } else if (periodFilter === 'today') {
        if (!isSameDay(absenceStart, now) && !isSameDay(absenceEnd, now)) return false;
      }

      // Search filter
      if (searchTerm) {
        const professional = professionals.find(p => p.id === absence.professional_id);
        const searchLower = searchTerm.toLowerCase();
        const matchesProfessional = professional?.name.toLowerCase().includes(searchLower);
        const matchesReason = absence.reason?.toLowerCase().includes(searchLower);
        const matchesNotes = absence.notes?.toLowerCase().includes(searchLower);
        
        if (!matchesProfessional && !matchesReason && !matchesNotes) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [absences, professionalFilter, periodFilter, searchTerm, professionals]);

  const handleDelete = async (id: string) => {
    await deleteAbsence.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  const isFullDay = (absence: ProfessionalAbsence) => {
    const start = new Date(absence.start_time);
    const end = new Date(absence.end_time);
    // Consider full day if 8+ hours
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return hours >= 8;
  };

  const getProfessionalColor = (professionalId: string) => {
    const professional = professionals.find(p => p.id === professionalId);
    return professional?.agenda_color || '#3B82F6';
  };

  const getStatusFromNotes = (notes: string | null) => {
    const statusMatch = notes?.match(/\[STATUS:(.*?)\]/);
    return statusMatch ? statusMatch[1] : 'pending';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="text-[9px] bg-success">Concluído</Badge>;
      case 'missed':
        return <Badge variant="destructive" className="text-[9px]">Faltou</Badge>;
      case 'rescheduled':
        return <Badge variant="secondary" className="text-[9px]">Reagendado</Badge>;
      default:
        return <Badge variant="outline" className="text-[9px]">Pendente</Badge>;
    }
  };

  const clearNotes = (notes: string | null) => {
    return notes?.replace(/\[STATUS:.*?\]/g, '').trim() || '';
  };

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <UserX className="h-4 w-4" />
            Ausências
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 rounded-full border-2 border-muted animate-spin border-t-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer group">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserX className="h-4 w-4 text-amber-600" />
                Ausências
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {filteredAbsences.length}
                </Badge>
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="space-y-3">
            {/* Filters */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-7 pl-7 text-xs"
                />
              </div>
              
              <div className="flex gap-2">
                <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
                  <SelectTrigger className="h-7 text-[10px] flex-1">
                    <SelectValue placeholder="Profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {activeProfessionals.map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="h-2 w-2 rounded-full" 
                            style={{ backgroundColor: prof.agenda_color || '#3B82F6' }}
                          />
                          <span className="text-xs truncate">{prof.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={periodFilter} onValueChange={setPeriodFilter}>
                  <SelectTrigger className="h-7 text-[10px] flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">Próximas</SelectItem>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="past">Passadas</SelectItem>
                    <SelectItem value="all">Todas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Add Button */}
            <Button 
              onClick={onNewAbsence} 
              size="sm" 
              className="w-full h-7 text-xs"
              variant="outline"
            >
              <UserX className="h-3 w-3 mr-1" />
              Nova Ausência
            </Button>

            {/* Absences List */}
            <ScrollArea className="h-[300px]">
              {filteredAbsences.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <UserX className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-xs">Nenhuma ausência encontrada</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAbsences.map((absence) => {
                    const professional = professionals.find(p => p.id === absence.professional_id);
                    const status = getStatusFromNotes(absence.notes);
                    const notes = clearNotes(absence.notes);
                    const fullDay = isFullDay(absence);

                    return (
                      <div
                        key={absence.id}
                        className={cn(
                          'rounded-lg border p-2 space-y-1.5 transition-colors hover:bg-muted/50',
                          fullDay && 'border-amber-300 bg-amber-50/50 dark:bg-amber-900/10'
                        )}
                        style={{ borderLeftWidth: 3, borderLeftColor: getProfessionalColor(absence.professional_id) }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium truncate">
                                {professional?.name || 'Profissional'}
                              </span>
                              {fullDay && (
                                <Badge variant="secondary" className="text-[8px] h-4 px-1 bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                                  Dia todo
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                              <Calendar className="h-2.5 w-2.5" />
                              <span>{format(new Date(absence.start_time), "dd/MM/yyyy", { locale: ptBR })}</span>
                              <Clock className="h-2.5 w-2.5 ml-1" />
                              <span>
                                {format(new Date(absence.start_time), 'HH:mm')} - {format(new Date(absence.end_time), 'HH:mm')}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => onEditAbsence(absence)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => setDeleteConfirmId(absence.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {absence.reason && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1">
                              {absence.reason}
                            </Badge>
                          )}
                          {getStatusBadge(status)}
                        </div>

                        {notes && (
                          <p className="text-[10px] text-muted-foreground line-clamp-2">
                            {notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Ausência</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta ausência? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

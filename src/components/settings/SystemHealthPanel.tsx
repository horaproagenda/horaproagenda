import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, CheckCircle2, AlertTriangle, XCircle, MinusCircle, RefreshCw, Wrench, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  runSystemHealthCheck,
  autoRepair,
  type HealthReport,
  type CheckStatus,
} from '@/lib/systemHealthCheck';
import { exportSyncAuditLog } from '@/lib/syncAudit';

const STATUS_ICONS: Record<CheckStatus, React.ComponentType<{ className?: string }>> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
  skipped: MinusCircle,
};

const STATUS_COLORS: Record<CheckStatus, string> = {
  ok: 'text-emerald-600',
  warn: 'text-amber-600',
  fail: 'text-destructive',
  skipped: 'text-muted-foreground',
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: 'OK',
  warn: 'Atenção',
  fail: 'Falha',
  skipped: 'N/A',
};

export function SystemHealthPanel() {
  const queryClient = useQueryClient();
  const [report, setReport] = useState<HealthReport | null>(null);
  const [running, setRunning] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const run = async () => {
    setRunning(true);
    const id = toast.loading('Verificando saúde do sistema...');
    try {
      const r = await runSystemHealthCheck(queryClient);
      setReport(r);
      toast.dismiss(id);
      if (r.overall === 'ok') toast.success('Todos os fluxos OK');
      else if (r.overall === 'warn') toast.warning('Alguns avisos detectados');
      else toast.error('Falhas detectadas — clique em "Reparar automaticamente"');
    } catch (e) {
      toast.dismiss(id);
      toast.error('Erro ao executar verificação: ' + String(e));
    } finally {
      setRunning(false);
    }
  };

  const repair = async () => {
    if (!report) return;
    setRepairing(true);
    const id = toast.loading('Aplicando correções...');
    try {
      const actions = await autoRepair(report, queryClient);
      toast.dismiss(id);
      if (actions.length === 0) toast.message('Nada a reparar');
      else {
        toast.success(`${actions.length} correção(ões) aplicada(s)`, {
          description: actions.join(' • '),
          duration: 6000,
        });
      }
      // Re-roda verificação para mostrar novo estado
      await run();
    } catch (e) {
      toast.dismiss(id);
      toast.error('Falha ao reparar: ' + String(e));
    } finally {
      setRepairing(false);
    }
  };

  const exportLog = () => {
    try {
      const json = exportSyncAuditLog();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sync-audit-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Erro ao exportar: ' + String(e));
    }
  };

  const hasFixable = report?.items.some((i) => i.fixable && i.status !== 'ok');

  return (
    <Card className="card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">Diagnóstico do Sistema</CardTitle>
              <CardDescription className="text-xs">
                Verifica e repara automaticamente os fluxos críticos do aplicativo
              </CardDescription>
            </div>
          </div>
          {report && (
            <Badge
              variant={report.overall === 'ok' ? 'default' : report.overall === 'warn' ? 'secondary' : 'destructive'}
              className="shrink-0"
            >
              {STATUS_LABEL[report.overall]}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={run} disabled={running}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Verificando...' : 'Executar verificação'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={repair}
            disabled={!hasFixable || repairing || running}
          >
            <Wrench className={`h-3.5 w-3.5 mr-1.5 ${repairing ? 'animate-pulse' : ''}`} />
            Reparar automaticamente
          </Button>
          <Button size="sm" variant="ghost" onClick={exportLog}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar log de sincronização
          </Button>
        </div>

        {report && (
          <div className="rounded-lg border divide-y">
            {report.items.map((item) => {
              const Icon = STATUS_ICONS[item.status];
              return (
                <div key={item.id} className="flex items-start justify-between gap-3 p-2.5">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${STATUS_COLORS[item.status]}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium">{item.label}</div>
                      {item.detail && (
                        <div className="text-[11px] text-muted-foreground truncate">{item.detail}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                    {item.durationMs}ms
                  </div>
                </div>
              );
            })}
            <div className="p-2 text-[10px] text-muted-foreground bg-muted/30">
              Verificação concluída em {report.totalMs}ms · {new Date(report.finishedAt).toLocaleTimeString('pt-BR')}
            </div>
          </div>
        )}

        {!report && (
          <p className="text-xs text-muted-foreground">
            Clique em "Executar verificação" para checar autenticação, banco, realtime, edge functions,
            cache, fila offline e service worker. Falhas conhecidas podem ser corrigidas com 1 clique.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

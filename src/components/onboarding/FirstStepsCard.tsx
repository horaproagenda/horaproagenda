import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, MessageCircle, X, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { openWhatsappWithMessage } from '@/lib/whatsappLink';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const SUPPORT_PHONE = '5537991355495';
const SUPPORT_MSG = 'Olá! Sou novo no Hora Pro e gostaria de solicitar o cadastro gratuito dos meus clientes e serviços.';

async function count(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: c } = await (supabase as any).from(table).select('id', { count: 'exact', head: true });
  return c ?? 0;
}

interface Step { key: string; title: string; desc: string; path: string; action: string }

const STEPS: Step[] = [
  { key: 'hours', title: 'Horários de atendimento', desc: 'Defina o horário de início e término dos atendimentos.', path: '/configuracoes', action: 'Configurar' },
  { key: 'services', title: 'Serviços, kits e pacotes', desc: 'Cadastre serviços, kits, pacotes comuns ou sequenciais.', path: '/cadastros', action: 'Cadastrar' },
  { key: 'clients', title: 'Clientes', desc: 'Adicione seus clientes para começar a agendar.', path: '/clientes', action: 'Adicionar' },
  { key: 'payments', title: 'Formas de pagamento', desc: 'Defina como você recebe no Financeiro.', path: '/financeiro', action: 'Definir' },
  { key: 'documents', title: 'Documentos e anamnese', desc: 'Crie fichas de anamnese e documentos.', path: '/documentos', action: 'Criar' },
];

export function FirstStepsCard() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const uid = user?.id ?? 'anon';
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(`first-steps-collapsed-${uid}`, false);
  const [dismissed, setDismissed] = useLocalStorage<boolean>(`first-steps-dismissed-${uid}`, false);
  const [manual, setManual] = useLocalStorage<string[]>(`first-steps-manual-${uid}`, []);
  const isAdmin = hasRole('admin');

  const { data } = useQuery({
    queryKey: ['first-steps-progress', user?.id],
    enabled: !!user && isAdmin && !dismissed,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchInterval: 20_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: owner } = await sb.rpc('current_account_owner_id');
      const own = (q: any) => (owner ? q.eq('account_owner_id', owner) : q);
      const cnt = async (table: string) => {
        const { count: c } = await own(sb.from(table).select('id', { count: 'exact', head: true }));
        return c ?? 0;
      };
      const rows = async (table: string) => {
        const { data: r } = await own(sb.from(table).select('created_at, updated_at').limit(200));
        return r ?? [];
      };
      const [services, packages, clients, payments, docs, settingsRes, prefsRes] = await Promise.all([
        cnt('services'), cnt('package_templates'), cnt('clients'), rows('payment_methods'), rows('document_templates'),
        own(sb.from('business_settings').select('opening_time, closing_time, created_at, updated_at')).limit(1).maybeSingle(),
        sb.from('professional_preferences').select('opening_time, closing_time').eq('user_id', user!.id),
      ]);
      const settings = settingsRes?.data ?? null;
      return computeFirstSteps({
        accountCreatedAt: settings?.created_at ?? user?.created_at,
        settings,
        prefs: prefsRes?.data ?? [],
        services: services + packages,
        clients,
        paymentMethods: payments,
        documents: docs,
      });
    },
  });

  if (!isAdmin || dismissed || !data) return null;
  const done = (k: string) => data[k] || manual.includes(k);
  const total = STEPS.filter(s => done(s.key)).length;
  if (total === STEPS.length) return null;
  const pct = Math.round((total / STEPS.length) * 100);
  const toggleManual = (k: string) => setManual(m => (m.includes(k) ? m.filter(x => x !== k) : [...m, k]));

  return (
    <section aria-label="Primeiros passos" className="mb-3 rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 px-3 py-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <button type="button" onClick={() => setCollapsed(!collapsed)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="truncate text-sm font-semibold text-foreground">Primeiros passos no Hora Pro</span>
          <span className="shrink-0 text-xs text-muted-foreground">{total} de {STEPS.length}</span>
          <Progress value={pct} className="hidden h-1.5 flex-1 sm:block" />
          {collapsed ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronUp className="h-4 w-4 shrink-0" />}
        </button>
        <button type="button" aria-label="Dispensar guia" onClick={() => setDismissed(true)} className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      {!collapsed && (
        <div className="space-y-3 border-t border-border px-3 pb-3 pt-3">
          <Progress value={pct} className="h-1.5 sm:hidden" />
          <div className="flex flex-col gap-2 rounded-lg bg-primary/10 p-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-foreground">
              <strong>Cadastro gratuito:</strong> nossa equipe de suporte cadastra todos os seus clientes e serviços para você, sem custo.
            </p>
            <Button size="sm" onClick={() => openWhatsappWithMessage(SUPPORT_PHONE, SUPPORT_MSG)} className="shrink-0">
              <MessageCircle className="mr-1.5 h-4 w-4" /> Chamar suporte no WhatsApp
            </Button>
          </div>
          <ol className="space-y-1.5">
            {STEPS.map((s, i) => {
              const ok = done(s.key);
              return (
                <li key={s.key} className={cn('flex items-center gap-3 rounded-lg px-2 py-1.5', ok && 'opacity-60')}>
                  <button type="button" aria-label={ok ? 'Marcar como pendente' : 'Marcar como feito'} onClick={() => !data[s.key] && toggleManual(s.key)} className="shrink-0">
                    {ok ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-medium text-foreground', ok && 'line-through')}>{i + 1}. {s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                  {!ok && (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate(s.path)}>{s.action}</Button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

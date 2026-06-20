import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  CalendarDays,
  Users,
  MessageCircle,
  Wallet,
  Package,
  ShieldCheck,
  Smartphone,
  Clock,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Sparkles,
  FileSignature,
  Receipt,
  BellRing,
  BarChart3,
  UserPlus,
} from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import horaProIcon from '@/assets/horapro-icon.png';
import { BRAND, PRIMARY_TAGLINE, TAGLINES, DIFFERENTIALS } from '@/content/brand';

const differentialIcons = [MessageCircle, Receipt, Wallet, FileSignature, UserPlus, BellRing, BarChart3];

const features = [
  {
    icon: CalendarDays,
    title: 'Agenda em tempo real',
    desc: 'Bloqueio automático de horários, prevenção de conflitos e sincronização instantânea entre profissionais e dispositivos.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp integrado',
    desc: 'Lembretes 24h e 1h antes, confirmações, cobranças e comunicação direta — tudo automatizado.',
  },
  {
    icon: Wallet,
    title: 'Financeiro completo',
    desc: 'Caixa, recebíveis, comissões automáticas, extrato com saldo corrente e relatórios reais do seu negócio.',
  },
  {
    icon: Package,
    title: 'Pacotes e sessões',
    desc: 'Controle automático de saldo, intervalo mínimo entre aplicações e cascata em reagendamentos.',
  },
  {
    icon: Users,
    title: 'Clientes e equipe',
    desc: 'Cadastro completo com histórico, fotos, documentos. Multiusuário com permissões por perfil.',
  },
  {
    icon: ShieldCheck,
    title: 'Seguro e em conformidade',
    desc: 'RBAC, auditoria completa de ações e proteção de dados conforme LGPD. Sua agenda blindada.',
  },
];

const audiences = [
  'Clínicas de estética',
  'Salões de beleza',
  'Barbearias',
  'Esteticistas',
  'Podólogos',
  'Fisioterapeutas',
  'Terapeutas',
  'Profissionais autônomos',
];

const faq = [
  {
    q: 'O que é o Hora Pro?',
    a: 'É um aplicativo de agendamento profissional para qualquer profissional que atende com hora marcada, com agenda em tempo real, controle financeiro, pacotes, comissões e WhatsApp integrado.',
  },
  {
    q: 'Funciona no celular?',
    a: 'Sim. O Hora Pro é instalável (PWA) em iPhone e Android direto pelo navegador, sem precisar baixar de loja de aplicativos.',
  },
  {
    q: 'Tem integração com WhatsApp?',
    a: 'Sim. O sistema envia lembretes, confirmações e cobranças automáticas pelo WhatsApp.',
  },
  {
    q: 'Posso testar grátis?',
    a: 'Sim. Há período de teste gratuito disponível no cadastro inicial — sem cartão de crédito.',
  },
  {
    q: 'Posso usar em mais de um dispositivo?',
    a: 'Sim. Tudo é sincronizado em tempo real entre celular, tablet e desktop. Cada usuário tem suas próprias permissões.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Form de interesse
// ─────────────────────────────────────────────────────────────────────────────

const leadSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome').max(120),
  email: z.string().trim().email('E-mail inválido').max(200),
  whatsapp: z
    .string()
    .trim()
    .min(8, 'Informe seu WhatsApp')
    .max(40, 'WhatsApp muito longo'),
  business_area: z.string().trim().max(100).optional().or(z.literal('')),
  message: z.string().trim().max(1000).optional().or(z.literal('')),
});

function InterestForm() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    whatsapp: '',
    business_area: '',
    message: '',
    // honeypot
    website: '',
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.website) return; // bot
    setLoading(true);
    try {
      const parsed = leadSchema.parse(form);
      const { error } = await supabase.from('interest_leads').insert({
        name: parsed.name,
        email: parsed.email,
        whatsapp: parsed.whatsapp || null,
        business_area: parsed.business_area || null,
        message: parsed.message || null,
        source: 'landing',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
      });
      if (error) throw error;
      setSubmitted(true);
      toast.success('Recebemos seu interesse! Entraremos em contato em breve.');
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0]?.message ?? 'Verifique os campos do formulário.');
      } else {
        toast.error('Não foi possível enviar agora. Tente novamente em instantes.');
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="font-display text-xl font-semibold">Interesse registrado!</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Recebemos seus dados. Em breve entraremos em contato no WhatsApp ou e-mail informado.
        </p>
        <div className="mt-6">
          <Link to="/auth">
            <Button>Criar minha conta agora</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-border/60 bg-card p-6 md:p-8"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="lead-name">Nome *</Label>
          <Input
            id="lead-name"
            required
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Seu nome"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-email">E-mail *</Label>
          <Input
            id="lead-email"
            type="email"
            required
            maxLength={200}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="voce@email.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-whatsapp">WhatsApp *</Label>
          <Input
            id="lead-whatsapp"
            required
            inputMode="tel"
            maxLength={40}
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            placeholder="(11) 98888-7777"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-area">Área de atuação</Label>
          <Input
            id="lead-area"
            maxLength={100}
            value={form.business_area}
            onChange={(e) => setForm({ ...form, business_area: e.target.value })}
            placeholder="Ex.: estética, barbearia, fisio…"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lead-msg">Mensagem (opcional)</Label>
        <Textarea
          id="lead-msg"
          maxLength={1000}
          rows={3}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Conte um pouco sobre seu negócio…"
        />
      </div>
      {/* honeypot */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={form.website}
        onChange={(e) => setForm({ ...form, website: e.target.value })}
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
        aria-hidden="true"
      />
      <Button type="submit" size="lg" className="w-full gap-2" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {loading ? 'Enviando…' : 'Quero conhecer o Hora Pro'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Seus dados são tratados conforme nossa{' '}
        <Link to="/politica-de-privacidade" className="underline">
          Política de Privacidade
        </Link>
        .
      </p>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Landing
// ─────────────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <>
      <Helmet>
        <title>Hora Pro — {PRIMARY_TAGLINE}</title>
        <meta
          name="description"
          content="Hora Pro: agenda profissional com WhatsApp, financeiro, pacotes e comissões — em tempo real, no celular ou desktop. Teste grátis."
        />
        <link rel="canonical" href={`${BRAND.url}/`} />
        <meta property="og:title" content={`Hora Pro — ${PRIMARY_TAGLINE}`} />
        <meta
          property="og:description"
          content="Agenda profissional com WhatsApp, financeiro, pacotes e comissões. Teste grátis, sem cartão."
        />
        <meta property="og:url" content={`${BRAND.url}/`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="min-h-screen bg-background text-foreground" data-fonts-gate>
        {/* HEADER */}
        <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
            <Link to="/" className="flex items-center gap-2.5">
              <img
                src={horaProIcon}
                alt="Hora Pro"
                width={32}
                height={32}
                className="h-8 w-8 rounded-lg"
              />
              <span className="font-display text-lg font-semibold tracking-tight">Hora Pro</span>
            </Link>
            <nav className="flex items-center gap-2">
              <a href="#interesse" className="hidden sm:inline-flex">
                <Button variant="ghost" size="sm">
                  Interesse
                </Button>
              </a>
              <Link to="/auth">
                <Button variant="ghost" size="sm">Entrar</Button>
              </Link>
              <Link to="/auth">
                <Button size="sm">Criar conta grátis</Button>
              </Link>
            </nav>
          </div>
        </header>

        <main>
          {/* HERO */}
          <section className="relative overflow-hidden">
            <div
              className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-background to-background"
              aria-hidden
            />
            <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    Teste grátis · sem cartão
                  </span>
                  <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
                    {PRIMARY_TAGLINE}
                  </h1>
                  <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
                    Hora Pro é a agenda profissional para quem atende com hora marcada. WhatsApp,
                    financeiro, pacotes e comissões — em tempo real, no celular ou desktop.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Link to="/auth">
                      <Button size="lg" className="gap-2">
                        Começar grátis
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                    <a href="#interesse">
                      <Button size="lg" variant="outline">
                        Tenho interesse
                      </Button>
                    </a>
                  </div>
                  <ul className="mt-8 grid grid-cols-2 gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    {['Sem instalação', 'Tempo real', 'Funciona offline'].map((t) => (
                      <li key={t} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="relative">
                  <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl shadow-primary/10">
                    <div className="flex h-full flex-col p-5">
                      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                        <div className="h-2 w-2 rounded-full bg-red-400" />
                        <div className="h-2 w-2 rounded-full bg-yellow-400" />
                        <div className="h-2 w-2 rounded-full bg-green-400" />
                        <span className="ml-3 text-xs text-muted-foreground">
                          horapro.app/agenda
                        </span>
                      </div>
                      <div className="mt-4 flex-1">
                        <div className="grid grid-cols-7 gap-1 text-[10px] text-muted-foreground">
                          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
                            <div key={d} className="text-center">
                              {d}
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 grid grid-cols-7 gap-1">
                          {Array.from({ length: 21 }).map((_, i) => {
                            const filled = [2, 5, 8, 9, 13, 17, 19].includes(i);
                            return (
                              <div
                                key={i}
                                className={`h-10 rounded ${
                                  filled ? 'bg-primary/80' : 'bg-muted/40'
                                }`}
                              />
                            );
                          })}
                        </div>
                        <div className="mt-4 space-y-2">
                          {[
                            { h: '09:00', n: 'Maria Silva', s: 'Corte e escova' },
                            { h: '10:30', n: 'João Costa', s: 'Massagem terapêutica' },
                            { h: '14:00', n: 'Ana Souza', s: 'Pacote · 3/10' },
                          ].map((a) => (
                            <div
                              key={a.h}
                              className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs"
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-medium tabular-nums text-primary">
                                  {a.h}
                                </span>
                                <span className="font-medium">{a.n}</span>
                              </div>
                              <span className="text-muted-foreground">{a.s}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* BENEFÍCIOS */}
          <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Tudo o que você precisa, em um só lugar
              </h2>
              <p className="mt-4 text-muted-foreground">
                O Hora Pro foi desenhado para ser rápido, claro e sem ruído — pronto para o dia
                a dia de quem atende com hora marcada.
              </p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <article
                  key={f.title}
                  className="group rounded-xl border border-border/60 bg-card p-6 transition-colors hover:border-primary/40"
                >
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </article>
              ))}
            </div>
          </section>

          {/* PARA QUEM */}
          <section className="border-y border-border/50 bg-muted/20">
            <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
              <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
                <div>
                  <h2 className="font-display text-3xl font-semibold tracking-tight">
                    Para qualquer profissional de hora marcada
                  </h2>
                  <p className="mt-4 text-muted-foreground">
                    Se você atende com agendamento, o Hora Pro foi feito para você. Use sozinho
                    ou com sua equipe inteira.
                  </p>
                </div>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {audiences.map((a) => (
                    <li
                      key={a}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-3 text-sm"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* MOBILE */}
          <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Smartphone className="h-3.5 w-3.5 text-primary" />
                  No celular ou no desktop
                </span>
                <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
                  Instale como aplicativo no seu celular
                </h2>
                <p className="mt-4 text-muted-foreground">
                  O Hora Pro é um Progressive Web App (PWA): você instala direto pelo navegador
                  no iPhone ou Android, sem passar por loja de aplicativos. Tudo sincronizado em
                  tempo real entre dispositivos.
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  {[
                    'iPhone, Android, tablet e computador',
                    'Atualização automática — sem reinstalar',
                    'Notificações de lembretes e confirmações',
                    'Funciona com conexão instável',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/15 via-card to-card p-8">
                <div className="grid grid-cols-3 gap-4">
                  {features.slice(0, 6).map((f) => (
                    <div
                      key={f.title}
                      className="flex flex-col items-center gap-2 rounded-lg border border-border/60 bg-background/60 p-4 text-center"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <f.icon className="h-5 w-5" />
                      </div>
                      <span className="text-[11px] font-medium leading-tight">{f.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* INTERESSE */}
          <section id="interesse" className="border-y border-border/50 bg-muted/20 scroll-mt-20">
            <div className="mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-24">
              <div className="text-center">
                <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                  Quer conhecer o Hora Pro?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                  Deixe seus dados e nós entramos em contato com mais informações, demonstração
                  e condições especiais para os primeiros usuários.
                </p>
              </div>
              <div className="mt-10">
                <InterestForm />
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-24">
            <h2 className="text-center font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Perguntas frequentes
            </h2>
            <div className="mt-10 space-y-3">
              {faq.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-xl border border-border/60 bg-card p-5 transition-colors open:border-primary/40"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-medium">
                    {item.q}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* CTA FINAL */}
          <section className="mx-auto max-w-4xl px-4 py-16 md:px-6 md:py-24">
            <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/20 via-card to-card p-10 text-center md:p-16">
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Comece a usar hoje, em 2 minutos
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                Crie sua conta, cadastre seus serviços e comece a receber agendamentos. Sem
                instalar nada, sem cartão de crédito.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/auth">
                  <Button size="lg" className="gap-2">
                    Criar conta grátis
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="#interesse">
                  <Button size="lg" variant="outline">
                    Tenho interesse
                  </Button>
                </a>
              </div>
              <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                {TAGLINES.map((t) => (
                  <span key={t}>• {t}</span>
                ))}
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-border/50">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:px-6">
            <div className="flex items-center gap-2">
              <img
                src={horaProIcon}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 rounded"
                loading="lazy"
              />
              <span>© {new Date().getFullYear()} Hora Pro. Todos os direitos reservados.</span>
            </div>
            <nav className="flex items-center gap-5">
              <Link to="/termos-de-servico" className="hover:text-foreground">
                Termos
              </Link>
              <Link to="/politica-de-privacidade" className="hover:text-foreground">
                Privacidade
              </Link>
              <Link to="/auth" className="hover:text-foreground">
                Entrar
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}

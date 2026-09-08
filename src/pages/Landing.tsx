import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  CalendarDays,
  CalendarClock,
  Users,
  MessageCircle,
  Wallet,
  Package,
  ShieldCheck,
  Smartphone,
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

const resultStats = [
  { value: '+8h', label: 'economizadas por semana', desc: 'Menos tempo confirmando manualmente' },
  { value: '+37%', label: 'mais agendamentos', desc: 'Lembretes e auto-cadastro aumentam o volume' },
  { value: '−68%', label: 'faltas (no-show)', desc: 'Confirmação automática antes de cada atendimento' },
  { value: '100%', label: 'em tempo real', desc: 'Agenda sincronizada em todos os dispositivos' },
];

const testimonials = [
  {
    name: 'Camila R.',
    role: 'Clínica de Estética · SP',
    quote:
      'Reduzi quase todas as faltas com a confirmação automática. Meu WhatsApp parou de virar central de atendimento.',
  },
  {
    name: 'Rafael M.',
    role: 'Barbearia · BH',
    quote:
      'Em 2 semanas a agenda lotou. O cliente se cadastra sozinho pelo link e já cai marcado certinho.',
  },
  {
    name: 'Juliana T.',
    role: 'Fisioterapeuta · POA',
    quote:
      'O financeiro com comissão automática me devolveu horas todo mês. Saiu planilha, entrou Hora Pro.',
  },
];

const differentialIcons: Record<string, typeof MessageCircle> = {
  'WhatsApp 100% automático': MessageCircle,
  'Taxa da maquininha calculada': Receipt,
  'Boleto parcelado com aviso de atraso': Wallet,
  'Documentos com assinatura Gov.br': FileSignature,
  'Autocadastro do cliente': UserPlus,
  'Agendamento automático': CalendarClock,
  'Lembretes pessoais e profissionais': BellRing,
  'Relatórios completos': BarChart3,
};

const features = [
  {
    icon: CalendarDays,
    title: 'Agenda em tempo real',
    desc: 'Bloqueio automático de horários, prevenção de conflitos e sincronização instantânea entre profissionais e dispositivos.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp integrado',
    desc: 'Lembretes antes do atendimento, confirmações, cobranças e comunicação direta — tudo automatizado.',
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
    desc: 'Controle de acesso por perfil, auditoria completa de ações e proteção de dados conforme a LGPD.',
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
    q: 'Como funciona a assinatura?',
    a: 'A assinatura é paga por usuário, com planos mensal, semestral ou anual, com período de teste grátis no cartão.',
  },
  {
    q: 'Posso usar em mais de um dispositivo?',
    a: 'Sim. Tudo é sincronizado em tempo real entre celular, tablet e desktop. Cada usuário tem suas próprias permissões.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Reveal suave ao rolar
// ─────────────────────────────────────────────────────────────────────────────

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`landing-reveal ${className}`}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form de interesse
// ─────────────────────────────────────────────────────────────────────────────

const leadSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome').max(120),
  email: z.string().trim().email('E-mail inválido').max(200),
  whatsapp: z.string().trim().min(8, 'Informe seu WhatsApp').max(40, 'WhatsApp muito longo'),
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

      // Notifica a equipe por e-mail (suporte@horaproagenda.tech). Uma falha aqui
      // não deve impedir o registro do lead.
      try {
        await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'interest-lead-notification',
            templateData: {
              name: parsed.name,
              email: parsed.email,
              whatsapp: parsed.whatsapp || '',
              businessArea: parsed.business_area || '',
              message: parsed.message || '',
              receivedAt: new Date().toLocaleString('pt-BR'),
            },
          },
        });
      } catch (mailErr) {
        console.error('Falha ao notificar novo lead por e-mail', mailErr);
      }

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
      <div className="rounded-2xl border border-landing-text/10 bg-landing-bg p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-landing-accent/15 text-landing-accent">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="font-landing-display text-xl font-semibold text-landing-text">
          Interesse registrado!
        </h3>
        <p className="mt-2 text-sm text-landing-text-muted">
          Recebemos seus dados. Em breve entraremos em contato no WhatsApp ou e-mail informado.
        </p>
        <div className="mt-6">
          <Link to="/auth">
            <Button className="bg-landing-accent font-semibold text-white hover:bg-landing-accent-hover">
              Criar minha conta agora
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-landing-text/10 bg-landing-bg p-6 md:p-8"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="lead-name" className="text-landing-text">
            Nome *
          </Label>
          <Input
            id="lead-name"
            required
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Seu nome"
            className="border-landing-text/15 bg-landing-surface/50 text-landing-text placeholder:text-landing-text-muted/70"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-email" className="text-landing-text">
            E-mail *
          </Label>
          <Input
            id="lead-email"
            type="email"
            required
            maxLength={200}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="voce@email.com"
            className="border-landing-text/15 bg-landing-surface/50 text-landing-text placeholder:text-landing-text-muted/70"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-whatsapp" className="text-landing-text">
            WhatsApp *
          </Label>
          <Input
            id="lead-whatsapp"
            required
            inputMode="tel"
            maxLength={40}
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            placeholder="(11) 98888-7777"
            className="border-landing-text/15 bg-landing-surface/50 text-landing-text placeholder:text-landing-text-muted/70"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-area" className="text-landing-text">
            Área de atuação
          </Label>
          <Input
            id="lead-area"
            maxLength={100}
            value={form.business_area}
            onChange={(e) => setForm({ ...form, business_area: e.target.value })}
            placeholder="Ex.: estética, barbearia, fisio…"
            className="border-landing-text/15 bg-landing-surface/50 text-landing-text placeholder:text-landing-text-muted/70"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lead-msg" className="text-landing-text">
          Mensagem (opcional)
        </Label>
        <Textarea
          id="lead-msg"
          maxLength={1000}
          rows={3}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Conte um pouco sobre seu negócio…"
          className="border-landing-text/15 bg-landing-surface/50 text-landing-text placeholder:text-landing-text-muted/70"
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
      <Button
        type="submit"
        size="lg"
        className="w-full gap-2 bg-landing-accent font-semibold text-white hover:bg-landing-accent-hover"
        disabled={loading}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {loading ? 'Enviando…' : 'Quero conhecer o Hora Pro'}
      </Button>
      <p className="text-center text-xs text-landing-text-muted">
        Seus dados são tratados conforme nossa{' '}
        <Link to="/politica-de-privacidade" className="underline hover:text-landing-text">
          Política de Privacidade
        </Link>
        .
      </p>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mockup de agenda (hero)
// ─────────────────────────────────────────────────────────────────────────────

function AgendaMockup() {
  return (
    <div className="relative">
      <div
        className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-landing-accent/25 to-transparent blur-3xl"
        aria-hidden
      />
      <div className="relative overflow-hidden rounded-3xl border border-landing-text/10 bg-landing-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-landing-text/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <img src={horaProIcon} alt="" className="h-6 w-6 rounded-md" loading="lazy" />
            <span className="font-landing-display text-sm font-semibold text-landing-text">
              Agenda de hoje
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-landing-accent/15 px-2.5 py-1 text-[11px] font-semibold text-landing-accent">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-landing-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-landing-accent" />
            </span>
            Confirmado pelo WhatsApp
          </span>
        </div>
        <div className="space-y-2.5 p-5">
          {[
            { time: '09:00', name: 'Limpeza de pele — Camila', state: 'solid' },
            { time: '10:30', name: 'Massagem — Rafael', state: 'solid-soft' },
            { time: '13:00', name: 'Horário livre', state: 'empty' },
            { time: '14:00', name: 'Pacote sessão 3/10 — Juliana', state: 'solid' },
            { time: '16:30', name: 'Retorno — Pedro', state: 'solid-soft' },
          ].map((row) => (
            <div
              key={row.time}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                row.state === 'solid'
                  ? 'border-landing-accent/40 bg-landing-accent/15'
                  : row.state === 'solid-soft'
                    ? 'border-landing-text/10 bg-landing-bg/70'
                    : 'border-dashed border-landing-text/15 bg-transparent'
              }`}
            >
              <span className="w-12 shrink-0 font-landing-display text-sm font-semibold text-landing-accent">
                {row.time}
              </span>
              <span
                className={`text-sm ${
                  row.state === 'empty' ? 'italic text-landing-text-muted' : 'text-landing-text'
                }`}
              >
                {row.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
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
          content="Hora Pro: agenda profissional com WhatsApp automático, financeiro, pacotes, documentos com assinatura Gov.br e agendamento automático — em tempo real, no celular ou desktop."
        />
        <link rel="canonical" href={`${BRAND.url}/`} />
        <meta property="og:title" content={`Hora Pro — ${PRIMARY_TAGLINE}`} />
        <meta
          property="og:description"
          content="Agenda profissional com WhatsApp, financeiro, pacotes e documentos com validade jurídica — em tempo real."
        />
        <meta property="og:url" content={`${BRAND.url}/`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="min-h-dvh bg-landing-bg font-landing-body text-landing-text">
        {/* HEADER — apenas a marca, sem botões */}
        <header className="sticky top-0 z-30 border-b border-landing-surface bg-landing-bg/80 backdrop-blur supports-[backdrop-filter]:bg-landing-bg/60">
          <div className="mx-auto flex h-16 max-w-6xl items-center px-4 md:px-6">
            <Link to="/" className="flex items-center gap-2.5">
              <img
                src={horaProIcon}
                alt="Hora Pro"
                width={32}
                height={32}
                className="h-8 w-8 rounded-lg"
              />
              <span className="font-landing-display text-lg font-bold tracking-tight text-landing-text">
                Hora Pro
              </span>
            </Link>
          </div>
        </header>

        <main>
          {/* HERO */}
          <section className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0"
              aria-hidden
            >
              <div className="absolute left-1/2 top-1/4 h-[520px] w-[820px] max-w-none -translate-x-1/2 rounded-full bg-landing-accent/10 blur-[120px]" />
              <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-landing-surface/60 blur-[100px]" />
            </div>
            <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl items-center px-4 py-14 md:px-6 md:py-20">
              <div className="grid w-full items-center gap-12 lg:grid-cols-2 lg:gap-16">
                <div className="text-center lg:text-left">
                  <span className="inline-flex items-center gap-2 rounded-full border border-landing-accent/30 bg-landing-surface px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-landing-accent">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-landing-accent opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-landing-accent" />
                    </span>
                    Agenda inteligente
                  </span>
                  <h1 className="mt-6 font-landing-display text-4xl font-bold leading-[1.08] tracking-tight text-landing-text sm:text-5xl lg:text-6xl">
                    Sua agenda cheia.
                    <br />
                    <span className="text-landing-accent">Seu tempo, seu.</span>
                  </h1>
                  <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-landing-text-muted md:text-lg lg:mx-0">
                    O Hora Pro agenda, confirma, cobra e documenta por você — com WhatsApp
                    automático, documentos com validade jurídica e agendamento em sequência. Você
                    atende; o sistema cuida do resto.
                  </p>
                  <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                    <Link to="/auth" className="w-full sm:w-auto">
                      <Button
                        size="lg"
                        className="h-13 w-full gap-2 bg-landing-accent px-8 text-base font-bold text-white shadow-xl shadow-landing-accent/25 transition-all hover:-translate-y-0.5 hover:bg-landing-accent-hover sm:w-auto"
                      >
                        Criar minha conta
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link to="/auth" className="w-full sm:w-auto">
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-13 w-full border-landing-text/20 bg-transparent px-8 text-base font-semibold text-landing-text hover:bg-landing-surface hover:text-landing-text sm:w-auto"
                      >
                        Entrar
                      </Button>
                    </Link>
                  </div>
                  <a
                    href="#interesse"
                    className="mt-4 inline-block text-sm font-medium text-landing-text-muted underline-offset-4 transition-colors hover:text-landing-accent hover:underline"
                  >
                    Ainda tenho dúvidas — quero conversar antes
                  </a>
                  <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-landing-text-muted lg:justify-start">
                    {['Teste grátis', 'Sem instalação', 'Tempo real em todos os aparelhos'].map(
                      (t) => (
                        <li key={t} className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-landing-accent" />
                          {t}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
                <AgendaMockup />
              </div>
            </div>
          </section>

          {/* DIFERENCIAIS */}
          <section className="border-y border-landing-surface bg-landing-surface/60">
            <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
              <Reveal className="mx-auto max-w-2xl text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-landing-accent/30 bg-landing-accent/10 px-3 py-1 text-xs font-semibold text-landing-accent">
                  <Sparkles className="h-3.5 w-3.5" />
                  Diferenciais exclusivos
                </span>
                <h2 className="mt-4 font-landing-display text-3xl font-bold tracking-tight text-landing-text md:text-4xl">
                  O que nenhuma agenda comum entrega
                </h2>
                <p className="mt-4 text-landing-text-muted">
                  Automação real, financeiro preciso e documentos com validade jurídica — para
                  quem leva o atendimento a sério.
                </p>
              </Reveal>
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {DIFFERENTIALS.map((d) => {
                  const Icon = differentialIcons[d.title] ?? Sparkles;
                  return (
                    <Reveal key={d.title}>
                      <article className="group h-full rounded-2xl border border-landing-text/10 bg-landing-bg p-6 transition-all duration-300 hover:-translate-y-1 hover:border-landing-accent/40 hover:shadow-lg hover:shadow-landing-accent/5">
                        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-landing-accent/10 text-landing-accent transition-transform group-hover:scale-110">
                          <Icon className="h-5 w-5" />
                        </div>
                        <h3 className="font-landing-display text-base font-semibold text-landing-text">
                          {d.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-landing-text-muted">
                          {d.desc}
                        </p>
                      </article>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </section>

          {/* RESULTADOS + DEPOIMENTOS */}
          <section>
            <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
              <Reveal className="mx-auto max-w-2xl text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-landing-accent/30 bg-landing-accent/10 px-3 py-1 text-xs font-semibold text-landing-accent">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Resultados reais
                </span>
                <h2 className="mt-4 font-landing-display text-3xl font-bold tracking-tight text-landing-text md:text-4xl">
                  Profissionais que automatizaram com Hora Pro
                </h2>
                <p className="mt-3 text-sm text-landing-text-muted md:text-base">
                  Dados médios reportados por usuários após 30 dias usando lembretes e confirmação
                  automática.
                </p>
              </Reveal>

              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {resultStats.map((s) => (
                  <Reveal key={s.label}>
                    <div className="h-full rounded-2xl border border-landing-text/10 bg-landing-surface p-5 text-center">
                      <div className="font-landing-display text-3xl font-bold text-landing-accent md:text-4xl">
                        {s.value}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-landing-text">{s.label}</div>
                      <p className="mt-1.5 text-xs text-landing-text-muted">{s.desc}</p>
                    </div>
                  </Reveal>
                ))}
              </div>

              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {testimonials.map((t) => (
                  <Reveal key={t.name}>
                    <figure className="flex h-full flex-col justify-between rounded-2xl border border-landing-text/10 bg-landing-surface p-5">
                      <blockquote className="text-sm leading-relaxed text-landing-text/90">
                        “{t.quote}”
                      </blockquote>
                      <figcaption className="mt-4 flex items-center gap-3 border-t border-landing-text/10 pt-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-landing-accent/15 font-landing-display text-sm font-bold text-landing-accent">
                          {t.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold leading-tight text-landing-text">
                            {t.name}
                          </div>
                          <div className="text-xs text-landing-text-muted">{t.role}</div>
                        </div>
                      </figcaption>
                    </figure>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* BENEFÍCIOS */}
          <section className="border-t border-landing-surface bg-landing-surface/40">
            <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
              <Reveal className="mx-auto max-w-2xl text-center">
                <h2 className="font-landing-display text-3xl font-bold tracking-tight text-landing-text md:text-4xl">
                  Tudo o que você precisa, em um só lugar
                </h2>
                <p className="mt-4 text-landing-text-muted">
                  O Hora Pro foi desenhado para ser rápido, claro e sem ruído — pronto para o dia
                  a dia de quem atende com hora marcada.
                </p>
              </Reveal>
              <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {features.map((f) => (
                  <Reveal key={f.title}>
                    <article className="group h-full rounded-2xl border border-landing-text/10 bg-landing-bg p-6 transition-colors hover:border-landing-accent/40">
                      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-landing-accent/10 text-landing-accent">
                        <f.icon className="h-5 w-5" />
                      </div>
                      <h3 className="font-landing-display text-lg font-semibold text-landing-text">
                        {f.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-landing-text-muted">
                        {f.desc}
                      </p>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* PARA QUEM */}
          <section className="border-y border-landing-surface">
            <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
              <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
                <Reveal>
                  <h2 className="font-landing-display text-3xl font-bold tracking-tight text-landing-text">
                    Para qualquer profissional de hora marcada
                  </h2>
                  <p className="mt-4 text-landing-text-muted">
                    Se você atende com agendamento, o Hora Pro foi feito para você. Use sozinho
                    ou com sua equipe inteira.
                  </p>
                </Reveal>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {audiences.map((a) => (
                    <li
                      key={a}
                      className="flex items-center gap-2 rounded-lg border border-landing-text/10 bg-landing-surface px-4 py-3 text-sm text-landing-text"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-landing-accent" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* MOBILE / PWA */}
          <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-landing-text/15 px-3 py-1 text-xs font-medium text-landing-text-muted">
                  <Smartphone className="h-3.5 w-3.5 text-landing-accent" />
                  No celular ou no desktop
                </span>
                <h2 className="mt-4 font-landing-display text-3xl font-bold tracking-tight text-landing-text md:text-4xl">
                  Instale como aplicativo no seu celular
                </h2>
                <p className="mt-4 text-landing-text-muted">
                  O Hora Pro é um Progressive Web App (PWA): você instala direto pelo navegador
                  no iPhone ou Android, sem passar por loja de aplicativos. Tudo sincronizado em
                  tempo real entre dispositivos.
                </p>
                <ul className="mt-6 space-y-3 text-sm text-landing-text">
                  {[
                    'iPhone, Android, tablet e computador',
                    'Atualização automática — sem reinstalar',
                    'Notificações de lembretes e confirmações',
                    'Funciona com conexão instável',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-landing-accent" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal>
                <div className="rounded-2xl border border-landing-text/10 bg-gradient-to-br from-landing-accent/15 via-landing-surface to-landing-surface p-8">
                  <div className="grid grid-cols-3 gap-4">
                    {features.slice(0, 6).map((f) => (
                      <div
                        key={f.title}
                        className="flex flex-col items-center gap-2 rounded-lg border border-landing-text/10 bg-landing-bg/70 p-4 text-center"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-landing-accent/10 text-landing-accent">
                          <f.icon className="h-5 w-5" />
                        </div>
                        <span className="text-[11px] font-medium leading-tight text-landing-text">
                          {f.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          {/* INTERESSE */}
          <section
            id="interesse"
            className="scroll-mt-20 border-y border-landing-surface bg-landing-surface/60"
          >
            <div className="mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-24">
              <Reveal className="text-center">
                <h2 className="font-landing-display text-3xl font-bold tracking-tight text-landing-text md:text-4xl">
                  Quer conhecer o Hora Pro?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-landing-text-muted">
                  Deixe seus dados e nós entramos em contato com mais informações, demonstração
                  e condições especiais para os primeiros usuários.
                </p>
              </Reveal>
              <div className="mt-10">
                <InterestForm />
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-24">
            <Reveal>
              <h2 className="text-center font-landing-display text-3xl font-bold tracking-tight text-landing-text md:text-4xl">
                Perguntas frequentes
              </h2>
            </Reveal>
            <div className="mt-10 space-y-3">
              {faq.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-xl border border-landing-text/10 bg-landing-surface p-5 transition-colors open:border-landing-accent/40"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-medium text-landing-text">
                    {item.q}
                    <span className="text-landing-text-muted transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-landing-text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* CTA FINAL */}
          <section className="px-4 pb-16 md:px-6 md:pb-24">
            <Reveal>
              <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-landing-accent p-10 text-center md:p-16">
                <div
                  className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10"
                  aria-hidden
                />
                <div
                  className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-landing-bg/15"
                  aria-hidden
                />
                <div className="relative">
                  <h2 className="font-landing-display text-3xl font-bold tracking-tight text-white md:text-5xl">
                    Sua agenda cheia começa hoje
                  </h2>
                  <p className="mx-auto mt-4 max-w-xl text-white/85">
                    Crie sua conta, escolha um plano, cadastre seus serviços e comece a receber
                    agendamentos. Sem instalar nada.
                  </p>
                  <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Link to="/auth" className="w-full sm:w-auto">
                      <Button
                        size="lg"
                        className="h-13 w-full gap-2 bg-landing-bg px-9 text-base font-bold text-landing-text shadow-xl hover:bg-landing-surface sm:w-auto"
                      >
                        Criar minha conta
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link to="/auth" className="w-full sm:w-auto">
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-13 w-full border-2 border-white/80 bg-transparent px-9 text-base font-bold text-white hover:bg-white hover:text-landing-accent sm:w-auto"
                      >
                        Entrar
                      </Button>
                    </Link>
                  </div>
                  <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-white/75">
                    {TAGLINES.map((t) => (
                      <span key={t}>• {t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </section>
        </main>

        <footer className="border-t border-landing-surface">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-landing-text-muted md:flex-row md:px-6">
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
            <p className="text-center">
              E-mail de contato:{' '}
              <a href={`mailto:${BRAND.supportEmail}`} className="hover:text-landing-text">
                {BRAND.supportEmail}
              </a>
            </p>
            <nav className="flex items-center gap-5">
              <Link to="/termos-de-servico" className="hover:text-landing-text">
                Termos
              </Link>
              <Link to="/politica-de-privacidade" className="hover:text-landing-text">
                Privacidade
              </Link>
              <Link to="/contato" className="hover:text-landing-text">
                Contato
              </Link>
              <Link to="/auth" className="hover:text-landing-text">
                Entrar
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}

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
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: CalendarDays,
    title: 'Agenda em tempo real',
    desc: 'Bloqueio automático de horários, prevenção de conflitos e sincronização instantânea entre profissionais e dispositivos.',
  },
  {
    icon: Users,
    title: 'Cadastro completo de clientes',
    desc: 'Histórico, fotos de evolução, anamnese, documentos assinados e busca rápida em todas as listas.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp integrado',
    desc: 'Lembretes 24h e 1h antes, confirmações, cobranças e comunicação direta — tudo automatizado.',
  },
  {
    icon: Wallet,
    title: 'Financeiro e fluxo de caixa',
    desc: 'Pagamentos, recebíveis, comissões automáticas, extrato com saldo corrente e relatórios reais.',
  },
  {
    icon: Package,
    title: 'Pacotes e sessões',
    desc: 'Controle automático de saldo, intervalo mínimo entre aplicações e cascata em reagendamentos.',
  },
  {
    icon: ShieldCheck,
    title: 'Multiusuário com permissões',
    desc: 'Perfis (admin, gestor, recepção, profissional, financeiro) com RBAC e auditoria completa.',
  },
];

const audiences = [
  'Clínicas de estética',
  'Salões de beleza',
  'Esteticistas autônomas',
  'Barbearias',
  'Podólogos',
  'Fisioterapeutas',
  'Terapeutas',
  'Profissionais da área de bem-estar',
];

const faq = [
  {
    q: 'O que é o Lume Agenda?',
    a: 'É um aplicativo de agendamento online para clínicas de estética, salões de beleza e profissionais autônomos, com agenda em tempo real, controle financeiro, pacotes, comissões e WhatsApp integrado.',
  },
  {
    q: 'Funciona no celular?',
    a: 'Sim. O Lume Agenda é instalável (PWA) em iPhone e Android direto pelo navegador, sem precisar baixar de loja de aplicativos.',
  },
  {
    q: 'Tem integração com WhatsApp?',
    a: 'Sim. O sistema envia lembretes, confirmações e cobranças automáticas pelo WhatsApp, com WhatsApp Business e Evolution API.',
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

export default function Landing() {
  return (
    <>
      <Helmet>
        <title>Lume Agenda — App de agendamento para clínica de estética e salão</title>
        <meta
          name="description"
          content="App de agendamento online para clínicas de estética, salões de beleza e esteticistas. Agenda em tempo real, WhatsApp, financeiro, pacotes e comissões. Teste grátis."
        />
        <link rel="canonical" href="https://agendalume.app/" />
        <meta property="og:title" content="Lume Agenda — App de agendamento para clínica de estética" />
        <meta
          property="og:description"
          content="Agenda em tempo real, WhatsApp, financeiro, pacotes e comissões para clínicas de estética e salões. Teste grátis."
        />
        <meta property="og:url" content="https://agendalume.app/" />
        <meta property="og:type" content="website" />
        <meta name="twitter:title" content="Lume Agenda — App de agendamento para clínica de estética" />
        <meta
          name="twitter:description"
          content="Agenda em tempo real, WhatsApp, financeiro, pacotes e comissões para clínicas de estética e salões."
        />
      </Helmet>

      <div className="min-h-screen bg-background text-foreground" data-fonts-gate>
        {/* HEADER */}
        <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="font-display text-lg font-semibold tracking-tight">Lume Agenda</span>
            </Link>
            <nav className="flex items-center gap-2">
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
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background" aria-hidden />
            <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Teste grátis · sem cartão
                  </span>
                  <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
                    O app de agendamento para clínicas de estética e salões.
                  </h1>
                  <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
                    Agenda em tempo real, WhatsApp automático, controle financeiro, pacotes e comissões — tudo em um só lugar, no celular ou no desktop.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Link to="/auth">
                      <Button size="lg" className="gap-2">
                        Começar grátis
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link to="/auth">
                      <Button size="lg" variant="outline">Já tenho conta</Button>
                    </Link>
                  </div>
                  <ul className="mt-8 grid grid-cols-2 gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    {['Sem instalação', 'Sincronização real-time', 'Funciona offline'].map((t) => (
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
                        <span className="ml-3 text-xs text-muted-foreground">agendalume.app/agenda</span>
                      </div>
                      <div className="mt-4 flex-1">
                        <div className="grid grid-cols-7 gap-1 text-[10px] text-muted-foreground">
                          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
                            <div key={d} className="text-center">{d}</div>
                          ))}
                        </div>
                        <div className="mt-2 grid grid-cols-7 gap-1">
                          {Array.from({ length: 21 }).map((_, i) => {
                            const filled = [2, 5, 8, 9, 13, 17, 19].includes(i);
                            return (
                              <div
                                key={i}
                                className={`h-10 rounded ${filled ? 'bg-primary/80' : 'bg-muted/40'}`}
                              />
                            );
                          })}
                        </div>
                        <div className="mt-4 space-y-2">
                          {[
                            { h: '09:00', n: 'Maria Silva', s: 'Limpeza de pele' },
                            { h: '10:30', n: 'João Costa', s: 'Drenagem linfática' },
                            { h: '14:00', n: 'Ana Souza', s: 'Pacote facial · 3/10' },
                          ].map((a) => (
                            <div
                              key={a.h}
                              className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs"
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-medium tabular-nums text-primary">{a.h}</span>
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

          {/* FEATURES */}
          <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Tudo que você precisa para gerenciar agendamentos
              </h2>
              <p className="mt-4 text-muted-foreground">
                Um sistema completo para sua clínica de estética, salão ou consultório — desenhado para ser rápido, claro e sem ruído.
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

          {/* AUDIENCES */}
          <section className="border-y border-border/50 bg-muted/20">
            <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
              <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
                <div>
                  <h2 className="font-display text-3xl font-semibold tracking-tight">
                    Feito para profissionais de beleza e bem-estar
                  </h2>
                  <p className="mt-4 text-muted-foreground">
                    Se você atende com hora marcada, o Lume Agenda foi desenhado para você. Use sozinho ou com sua equipe.
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
                  O Lume Agenda é um Progressive Web App (PWA): você instala direto pelo navegador no iPhone ou Android, sem passar por loja de aplicativos. Tudo sincroniza em tempo real entre dispositivos.
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
              <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-card p-8">
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

          {/* FAQ */}
          <section className="border-t border-border/50 bg-muted/20">
            <div className="mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-24">
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
                      <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          {/* CTA FINAL */}
          <section className="mx-auto max-w-4xl px-4 py-16 md:px-6 md:py-24">
            <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/15 via-card to-card p-10 text-center md:p-16">
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Comece a usar hoje, em 2 minutos
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                Crie sua conta, cadastre seus serviços e comece a receber agendamentos. Sem instalar nada, sem cartão de crédito.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/auth">
                  <Button size="lg" className="gap-2">
                    Criar conta grátis
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-border/50">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:px-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>© {new Date().getFullYear()} Lume Agenda. Todos os direitos reservados.</span>
            </div>
            <nav className="flex items-center gap-5">
              <Link to="/termos-de-servico" className="hover:text-foreground">Termos</Link>
              <Link to="/politica-de-privacidade" className="hover:text-foreground">Privacidade</Link>
              <Link to="/auth" className="hover:text-foreground">Entrar</Link>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}

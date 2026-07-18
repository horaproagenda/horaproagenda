import { useAuth } from "@/contexts/AuthContext";
import { AssinaturaSection } from "@/components/admin/AssinaturaSection";
import { Button } from "@/components/ui/button";
import { Navigate, Link } from "react-router-dom";
import { BrandMark } from "@/components/brand/BrandMark";
import { Calendar, Users, CreditCard, Bell, ShieldCheck, MessageCircle, BarChart3, Sparkles, LogOut, Activity } from "lucide-react";

const HIGHLIGHTS = [
  { icon: Calendar,      title: "Agenda em tempo real",     desc: "Sincronização instantânea entre todos os profissionais e dispositivos." },
  { icon: Users,         title: "Multiusuário com permissões", desc: "Admin, recepção, profissional e financeiro com acessos controlados." },
  { icon: CreditCard,    title: "Financeiro completo",       desc: "Vendas, boletos parcelados, caixa e conciliação automática." },
  { icon: MessageCircle, title: "WhatsApp integrado",        desc: "Confirmações, lembretes e envio de documentos direto pelo Zap." },
  { icon: Bell,          title: "Lembretes automáticos",     desc: "Reduza faltas com avisos programados para cada cliente." },
  { icon: BarChart3,     title: "Relatórios e metas",        desc: "Acompanhe vendas, comissões e desempenho por profissional." },
  { icon: ShieldCheck,   title: "Dados protegidos (LGPD)",   desc: "Criptografia, auditoria e backup contínuo dos seus registros." },
  { icon: Sparkles,      title: "Atualizações contínuas",    desc: "Novas funções lançadas todo mês sem custo adicional." },
];

export default function Assinatura() {
  const { hasRole, signOut } = useAuth();

  // Somente admin pode gerenciar assinatura.
  if (!hasRole('admin')) {
    return <Navigate to="/agenda" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandMark className="h-8 w-8" />
            <span className="font-semibold tracking-tight">Hora Pro</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/assinatura/status">
                <Activity className="h-4 w-4 mr-2" /> Ver status
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10 md:py-14 space-y-12">
        {/* Hero */}
        <section className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Sua clínica, no controle total
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Escolha o plano ideal e{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              libere seu acesso
            </span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Assinatura por usuário, sem fidelidade. Após a confirmação do pagamento, sua agenda é
            liberada automaticamente e em tempo real.
          </p>
        </section>

        {/* Highlights */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-xl border border-border/60 bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Icon className="h-4.5 w-4.5" />
              </div>
              <p className="font-semibold text-sm">{title}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">{desc}</p>
            </div>
          ))}
        </section>

        {/* Planos */}
        <section id="planos" className="scroll-mt-20">
          <AssinaturaSection />
        </section>

        {/* Garantias */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-6 md:p-8 grid md:grid-cols-3 gap-6 text-sm">
          <div className="flex gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Pagamento seguro</p>
              <p className="text-muted-foreground text-xs mt-0.5">Processado pela Stripe, com criptografia bancária.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <CreditCard className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Cancele quando quiser</p>
              <p className="text-muted-foreground text-xs mt-0.5">Sem multa. Gerencie tudo pelo portal do cliente.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Suporte dedicado</p>
              <p className="text-muted-foreground text-xs mt-0.5">Time humano pronto para ajudar sua clínica a crescer.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

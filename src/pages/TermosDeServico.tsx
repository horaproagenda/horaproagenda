import { Link } from "react-router-dom";
import { ArrowLeft, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermosDeServico() {
  const siteUrl = "https://agendalume.app";
  const email = "suporte@agendalume.app";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="mb-6">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para o login
          </Link>
        </div>

        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Documento legal
              </span>
            </div>
            <CardTitle className="text-2xl font-display">
              Termos de Serviço
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Última atualização: {new Date().toLocaleDateString("pt-BR")}
            </p>
          </CardHeader>

          <CardContent className="space-y-8 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                1. Aceitação dos Termos
              </h2>
              <p>
                Ao acessar e utilizar o <strong>Lume Agenda</strong> ({siteUrl}), você concorda em cumprir e estar vinculado aos presentes Termos de Serviço. Se você não concordar com qualquer parte destes termos, não deverá utilizar nossos serviços.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                2. Descrição do Serviço
              </h2>
              <p>
                O Lume Agenda é um sistema de gestão e agendamento voltado para clínicas de estética, spas e profissionais de beleza. Nossos serviços incluem, mas não se limitam a:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Gerenciamento de agenda e horários de atendimento;</li>
                <li>Cadastro e controle de clientes, profissionais e serviços;</li>
                <li>Gestão financeira, comissões e caixa;</li>
                <li>Envio de lembretes e notificações via WhatsApp e SMS;</li>
                <li>Geração de documentos e termos de consentimento;</li>
                <li>Relatórios e indicadores de desempenho.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                3. Cadastro e Conta
              </h2>
              <p>
                Para utilizar o Lume Agenda, você deve criar uma conta fornecendo informações verdadeiras, completas e atualizadas. Você é responsável por manter a confidencialidade de sua senha e por todas as atividades realizadas em sua conta. O compartilhamento de credenciais de acesso é estritamente proibido.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                4. Planos e Pagamentos
              </h2>
              <p>
                O Lume Agenda oferece planos pagos com periodicidade mensal. Os valores e condições estão descritos no momento da contratação. Oferecemos um período de teste gratuito de 7 (sete) dias, durante o qual você pode avaliar o sistema sem custos. Após o término do período de teste, caso não haja cancelamento, será efetuada a cobrança recorrente do plano escolhido.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                5. Uso Adequado
              </h2>
              <p>
                O usuário se compromete a utilizar o sistema de forma ética, legal e em conformidade com a legislação brasileira, incluindo a LGPD (Lei Geral de Proteção de Dados). É expressamente proibido:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Utilizar o sistema para atividades ilícitas ou fraudulentas;</li>
                <li>Tentar acessar dados de outros usuários sem autorização;</li>
                <li>Enviar spam ou mensagens não solicitadas em massa;</li>
                <li>Reproduzir, distribuir ou criar trabalhos derivados do sistema sem autorização;</li>
                <li>Interferir na segurança ou desempenho da plataforma.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                6. Disponibilidade e Suporte
              </h2>
              <p>
                Nos esforçamos para manter o sistema disponível 24 horas por dia, 7 dias por semana, mas não garantimos acessibilidade ininterrupta. Manutenções programadas ou emergenciais poderão ocorrer, sendo comunicadas previamente sempre que possível. O suporte técnico é disponibilizado por e-mail ({email}) e chat interno, em horário comercial.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                7. Propriedade Intelectual
              </h2>
              <p>
                Todo o conteúdo, design, marca, código e funcionalidades do Lume Agenda são de propriedade exclusiva da Lume Agenda ou de seus licenciadores. A contratação do serviço não confere ao usuário qualquer direito sobre a propriedade intelectual do sistema.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                8. Cancelamento
              </h2>
              <p>
                O usuário pode cancelar sua assinatura a qualquer momento através da tela de configurações ou solicitando o cancelamento via e-mail. O cancelamento entrará em vigor ao final do período de faturamento em curso. Não realizamos reembolsos proporcionais para cancelamentos no meio do ciclo de faturamento.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                9. Limitação de Responsabilidade
              </h2>
              <p>
                O Lume Agenda não será responsável por danos indiretos, incidentais, especiais ou consequenciais resultantes do uso ou da impossibilidade de uso do sistema. A responsidade máxima estará limitada ao valor pago pelo usuário nos 12 (doze) meses anteriores ao evento.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                10. Alterações nos Termos
              </h2>
              <p>
                Podemos atualizar estes Termos de Serviço periodicamente. Notificaremos os usuários sobre alterações significativas por e-mail ou por meio de aviso no sistema. O uso continuado do Lume Agenda após as alterações constitui aceitação dos novos termos.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                11. Legislação Aplicável
              </h2>
              <p>
                Estes Termos são regidos pelas leis da República Federativa do Brasil. Quaisquer controvérsias decorrentes destes Termos serão dirimidas no foro da comarca de domicílio do usuário, conforme o Código de Defesa do Consumidor.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                12. Contato
              </h2>
              <p>
                Em caso de dúvidas sobre estes Termos de Serviço, entre em contato conosco pelo e-mail{" "}
                <a href={`mailto:${email}`} className="text-primary hover:underline">
                  {email}
                </a>.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

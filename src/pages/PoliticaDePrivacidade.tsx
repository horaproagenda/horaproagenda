import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Helmet } from "react-helmet-async";

export default function PoliticaDePrivacidade() {
  const siteUrl = "https://agendalume.app";
  const email = "suporte@agendalume.app";

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Política de Privacidade — Lume Agenda</title>
        <meta name="description" content="Como a Lume Agenda coleta, usa e protege dados pessoais de profissionais e clientes (LGPD)." />
        <link rel="canonical" href="https://agendalume.app/politica-de-privacidade" />
        <meta property="og:title" content="Política de Privacidade — Lume Agenda" />
        <meta property="og:description" content="Tratamento de dados pessoais na Lume Agenda em conformidade com a LGPD." />
        <meta property="og:url" content="https://agendalume.app/politica-de-privacidade" />
      </Helmet>
      <main className="max-w-3xl mx-auto px-4 py-12">
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
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Documento legal
              </span>
            </div>
            <CardTitle className="text-2xl font-display">
              Política de Privacidade
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Última atualização: {new Date().toLocaleDateString("pt-BR")}
            </p>
          </CardHeader>

          <CardContent className="space-y-8 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                1. Introdução
              </h2>
              <p>
                O <strong>Lume Agenda</strong> ({siteUrl}) leva a sério a privacidade dos seus dados. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos suas informações pessoais e dos seus clientes, em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                2. Dados que Coletamos
              </h2>
              <p>
                Coletamos os seguintes tipos de dados:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong>Dados de cadastro:</strong> nome, e-mail, telefone, CPF e CNPJ (quando aplicável) do titular da conta;</li>
                <li><strong>Dados de clientes:</strong> nome, telefone, e-mail, histórico de atendimentos e procedimentos realizados, inseridos voluntariamente pelo usuário no sistema;</li>
                <li><strong>Dados de uso:</strong> logs de acesso, interações com a plataforma, endereço IP e informações do dispositivo;</li>
                <li><strong>Dados financeiros:</strong> registros de pagamentos, valores de serviços e comissões, necessários para a gestão financeira do negócio.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                3. Como Usamos os Dados
              </h2>
              <p>
                Utilizamos os dados coletados para:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Fornecer e operar os serviços de gestão e agendamento;</li>
                <li>Enviar lembretes e notificações (WhatsApp, SMS, e-mail) aos clientes finais;</li>
                <li>Processar pagamentos e gerenciar assinaturas;</li>
                <li>Emitir relatórios e indicadores de desempenho do negócio;</li>
                <li>Garantir a segurança da plataforma e prevenir fraudes;</li>
                <li>Cumprir obrigações legais e regulatórias.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                4. Compartilhamento de Dados
              </h2>
              <p>
                Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins de marketing. Podemos compartilhar dados apenas com:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong>Provedores de serviço:</strong> infraestrutura de nuvem (Supabase), gateways de pagamento (Stripe), e serviços de comunicação (Twilio, WhatsApp) — todos contratualmente obrigados à confidencialidade;</li>
                <li><strong>Autoridades legais:</strong> quando exigido por lei, ordem judicial ou requisição de autoridade competente;</li>
                <li><strong>Outros usuários da mesma clínica:</strong> dados de clientes e agendamentos são visíveis dentro da mesma conta/organização, conforme as permissões definidas pelo administrador.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                5. Segurança da Informação
              </h2>
              <p>
                Adotamos medidas técnicas e administrativas para proteger seus dados, incluindo:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Criptografia de dados em trânsito (TLS/SSL) e em repouso;</li>
                <li>Controle de acesso baseado em papéis (RBAC);</li>
                <li>Políticas de segurança de Row-Level Security (RLS) no banco de dados;</li>
                <li>Auditoria de logs de acesso e alterações;</li>
                <li>Backups regulares e redundância de dados.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                6. Retenção e Exclusão
              </h2>
              <p>
                Mantemos seus dados pelo tempo necessário para cumprir as finalidades descritas nesta política e para atender a obrigações legais. Ao cancelar a conta, os dados poderão ser mantidos por até 180 (cento e oitenta) dias para fins de compliance e auditoria, sendo então excluídos de forma definitiva, salvo quando houver obrigação legal de retenção.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                7. Seus Direitos (LGPD)
              </h2>
              <p>
                De acordo com a LGPD, você possui os seguintes direitos:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Acesso aos seus dados pessoais;</li>
                <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
                <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
                <li>Portabilidade dos dados para outro serviço;</li>
                <li>Revogação do consentimento;</li>
                <li>Informação sobre o compartilhamento de dados com terceiros.</li>
              </ul>
              <p className="mt-2">
                Para exercer seus direitos, entre em contato pelo e-mail{" "}
                <a href={`mailto:${email}`} className="text-primary hover:underline">
                  {email}
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                8. Cookies e Tecnologias Semelhantes
              </h2>
              <p>
                Utilizamos cookies e tecnologias semelhantes para melhorar a experiência de navegação, manter a sessão de login autenticada, lembrar preferências do usuário e coletar estatísticas de uso anônimas. Você pode gerenciar as preferências de cookies diretamente no seu navegador.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                9. Transferência Internacional
              </h2>
              <p>
                Nossa infraestrutura de nuvem pode utilizar servidores localizados fora do Brasil. Quando houver transferência internacional de dados, garantimos que seja feita apenas para países ou entidades que ofereçam nível adequado de proteção, conforme exigido pela LGPD.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                10. Alterações nesta Política
              </h2>
              <p>
                Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos os usuários sobre alterações significativas por e-mail ou por meio de aviso no sistema. Recomendamos que revise esta política regularmente.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                11. Contato
              </h2>
              <p>
                Se tiver dúvidas sobre esta Política de Privacidade ou sobre como tratamos seus dados, entre em contato conosco pelo e-mail{" "}
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

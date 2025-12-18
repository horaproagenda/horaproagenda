import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  MessageSquare, Mail, Phone, Clock, HelpCircle, 
  Bug, Lightbulb, AlertTriangle, Send, ExternalLink
} from "lucide-react";

const Suporte = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    type: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.type || !formData.subject || !formData.message) {
      toast.error("Preencha todos os campos");
      return;
    }

    setIsSubmitting(true);
    
    // Simular envio - aqui você pode integrar com um serviço de e-mail
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Abrir WhatsApp com a mensagem
    const whatsappMessage = encodeURIComponent(
      `*Suporte - ${formData.type}*\n\n` +
      `*Nome:* ${formData.name}\n` +
      `*Email:* ${formData.email}\n` +
      `*Assunto:* ${formData.subject}\n\n` +
      `*Mensagem:*\n${formData.message}`
    );
    
    // Substitua pelo seu número de WhatsApp
    const whatsappNumber = "5511999999999";
    window.open(`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`, "_blank");
    
    toast.success("Redirecionando para o WhatsApp...");
    setIsSubmitting(false);
    
    // Limpar formulário
    setFormData({
      name: "",
      email: "",
      type: "",
      subject: "",
      message: "",
    });
  };

  const supportTypes = [
    { value: "duvida", label: "Dúvida", icon: <HelpCircle className="h-4 w-4" /> },
    { value: "bug", label: "Reportar Erro", icon: <Bug className="h-4 w-4" /> },
    { value: "sugestao", label: "Sugestão", icon: <Lightbulb className="h-4 w-4" /> },
    { value: "urgente", label: "Problema Urgente", icon: <AlertTriangle className="h-4 w-4" /> },
  ];

  const contactOptions = [
    {
      icon: <MessageSquare className="h-6 w-6" />,
      title: "WhatsApp",
      description: "Atendimento rápido via WhatsApp",
      action: "Iniciar conversa",
      href: "https://wa.me/5511999999999",
      color: "bg-green-500",
    },
    {
      icon: <Mail className="h-6 w-6" />,
      title: "E-mail",
      description: "suporte@seuapp.com.br",
      action: "Enviar e-mail",
      href: "mailto:suporte@seuapp.com.br",
      color: "bg-blue-500",
    },
    {
      icon: <Phone className="h-6 w-6" />,
      title: "Telefone",
      description: "(11) 99999-9999",
      action: "Ligar agora",
      href: "tel:+5511999999999",
      color: "bg-purple-500",
    },
  ];

  const faqs = [
    {
      question: "Como faço para agendar um cliente?",
      answer: "Vá até a Agenda, clique em um horário disponível ou use o botão 'Novo Agendamento'. Selecione o cliente, serviço, profissional e confirme.",
    },
    {
      question: "Como configuro as mensagens de WhatsApp?",
      answer: "Acesse Configurações → Mensagens WhatsApp. Lá você pode personalizar os templates de lembrete e aniversário usando as variáveis disponíveis.",
    },
    {
      question: "Como adiciono um novo profissional?",
      answer: "Vá em Configurações → Profissionais e clique em 'Novo Profissional'. Preencha os dados e defina o nível de acesso (Admin, Recepção ou Profissional).",
    },
    {
      question: "O caixa não está abrindo, o que fazer?",
      answer: "Verifique se você tem permissão de administrador. Apenas admins podem abrir/fechar o caixa. Se o problema persistir, entre em contato com o suporte.",
    },
    {
      question: "Como vejo o histórico de alterações?",
      answer: "Acesse o menu Auditoria (disponível apenas para administradores). Lá você pode ver todas as alterações realizadas no sistema com data, usuário e dados modificados.",
    },
  ];

  return (
    <AppLayout title="Suporte" subtitle="Entre em contato conosco">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suporte</h1>
          <p className="text-muted-foreground mt-2">
            Entre em contato conosco para dúvidas, sugestões ou problemas
          </p>
        </div>

        {/* Opções de contato rápido */}
        <div className="grid gap-4 md:grid-cols-3">
          {contactOptions.map((option, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className={`${option.color} p-3 rounded-lg text-white`}>
                    {option.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{option.title}</h3>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                    <Button 
                      variant="link" 
                      className="px-0 mt-1"
                      onClick={() => window.open(option.href, "_blank")}
                    >
                      {option.action}
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Formulário de contato */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Enviar Mensagem
              </CardTitle>
              <CardDescription>
                Preencha o formulário e entraremos em contato
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Seu Nome</Label>
                    <Input
                      id="name"
                      placeholder="Digite seu nome"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Tipo de Contato</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {supportTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            {type.icon}
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Assunto</Label>
                  <Input
                    id="subject"
                    placeholder="Resumo do assunto"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Mensagem</Label>
                  <Textarea
                    id="message"
                    placeholder="Descreva sua dúvida, sugestão ou problema em detalhes..."
                    rows={5}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Enviando..." : "Enviar via WhatsApp"}
                  <MessageSquare className="h-4 w-4 ml-2" />
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                Perguntas Frequentes
              </CardTitle>
              <CardDescription>
                Respostas para as dúvidas mais comuns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {faqs.map((faq, index) => (
                  <div key={index} className="border-b pb-4 last:border-0 last:pb-0">
                    <h4 className="font-medium text-sm">{faq.question}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Horário de atendimento */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Clock className="h-8 w-8 text-muted-foreground" />
              <div>
                <h3 className="font-semibold">Horário de Atendimento</h3>
                <p className="text-sm text-muted-foreground">
                  Segunda a Sexta: 09:00 às 18:00 | Sábado: 09:00 às 13:00
                </p>
                <p className="text-sm text-muted-foreground">
                  Tempo médio de resposta: até 24 horas úteis
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Suporte;

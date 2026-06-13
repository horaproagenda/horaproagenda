import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageTransition } from "@/components/layout/PageTransition";
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
import { buildWebWhatsappUrl, openWhatsappWithMessage } from "@/lib/whatsappLink";
import { WhatsappPreviewDialog } from "@/components/shared/WhatsappPreviewDialog";

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
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const whatsappMessage =
      `*Suporte - ${formData.type}*\n\n` +
      `*Nome:* ${formData.name}\n` +
      `*Email:* ${formData.email}\n` +
      `*Assunto:* ${formData.subject}\n\n` +
      `*Mensagem:*\n${formData.message}`;
    
    const whatsappNumber = "5511999999999";
    openWhatsappWithMessage(whatsappNumber, whatsappMessage);
    
    toast.success("Redirecionando para o WhatsApp...");
    setIsSubmitting(false);
    setFormData({ name: "", email: "", type: "", subject: "", message: "" });
  };

  const supportTypes = [
    { value: "duvida", label: "Dúvida", icon: <HelpCircle className="h-3 w-3" /> },
    { value: "bug", label: "Reportar Erro", icon: <Bug className="h-3 w-3" /> },
    { value: "sugestao", label: "Sugestão", icon: <Lightbulb className="h-3 w-3" /> },
    { value: "urgente", label: "Problema Urgente", icon: <AlertTriangle className="h-3 w-3" /> },
  ];

  const contactOptions = [
    {
      icon: <MessageSquare className="h-5 w-5" />,
      title: "WhatsApp",
      description: "Atendimento rápido",
      href: buildWebWhatsappUrl("5511999999999", ""),
      color: "bg-green-500",
    },
    {
      icon: <Mail className="h-5 w-5" />,
      title: "E-mail",
      description: "suporte@seuapp.com.br",
      href: "mailto:suporte@seuapp.com.br",
      color: "bg-blue-500",
    },
    {
      icon: <Phone className="h-5 w-5" />,
      title: "Telefone",
      description: "(11) 99999-9999",
      href: "tel:+5511999999999",
      color: "bg-purple-500",
    },
  ];

  const faqs = [
    { question: "Como faço para agendar um cliente?", answer: "Vá até a Agenda, clique em um horário ou use 'Novo Agendamento'." },
    { question: "Como configuro mensagens de WhatsApp?", answer: "Acesse Configurações → Mensagens WhatsApp." },
    { question: "Como adiciono um novo profissional?", answer: "Vá em Configurações → Profissionais → Novo." },
    { question: "O caixa não está abrindo?", answer: "Verifique se você tem permissão de admin." },
    { question: "Como vejo o histórico de alterações?", answer: "Acesse o menu Auditoria (apenas admins)." },
  ];

  return (
    <AppLayout title="Suporte" subtitle="Entre em contato conosco">
      <PageTransition>
        <div className="space-y-4">
          {/* Opções de contato rápido */}
          <div className="grid gap-3 md:grid-cols-3">
            {contactOptions.map((option, index) => (
              <Card key={index} className="card-hover cursor-pointer" onClick={() => window.open(option.href, "_blank")}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`${option.color} p-2 rounded-lg text-white`}>
                      {option.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{option.title}</h3>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Formulário de contato */}
            <Card className="card-hover">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Send className="h-4 w-4" />
                  Enviar Mensagem
                </CardTitle>
                <CardDescription className="text-xs">
                  Preencha o formulário abaixo
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nome</Label>
                      <Input
                        className="h-8 text-sm"
                        placeholder="Seu nome"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">E-mail</Label>
                      <Input
                        className="h-8 text-sm"
                        type="email"
                        placeholder="seu@email.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {supportTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              {type.icon}
                              <span className="text-sm">{type.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Assunto</Label>
                    <Input
                      className="h-8 text-sm"
                      placeholder="Resumo do assunto"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Mensagem</Label>
                    <Textarea
                      className="text-sm"
                      placeholder="Descreva em detalhes..."
                      rows={4}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    />
                  </div>

                  <Button type="submit" size="sm" className="w-full btn-vibrant" disabled={isSubmitting}>
                    {isSubmitting ? "Enviando..." : "Enviar via WhatsApp"}
                    <MessageSquare className="h-3 w-3 ml-2" />
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* FAQ */}
            <Card className="card-hover">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <HelpCircle className="h-4 w-4" />
                  Perguntas Frequentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {faqs.map((faq, index) => (
                    <div key={index} className="border-b pb-2 last:border-0 last:pb-0">
                      <h4 className="font-medium text-xs">{faq.question}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Horário de atendimento */}
          <Card className="card-hover">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-6 w-6 text-muted-foreground" />
                <div>
                  <h3 className="font-medium text-sm">Horário de Atendimento</h3>
                  <p className="text-xs text-muted-foreground">
                    Seg-Sex: 09:00-18:00 | Sáb: 09:00-13:00 | Resposta: até 24h úteis
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    </AppLayout>
  );
};

export default Suporte;

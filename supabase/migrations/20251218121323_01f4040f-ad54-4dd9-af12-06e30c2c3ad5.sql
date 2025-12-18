-- Create table for WhatsApp message templates
CREATE TABLE public.whatsapp_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'reminder', -- 'reminder', 'birthday', 'confirmation', 'follow_up'
  message TEXT NOT NULL,
  hours_before INTEGER DEFAULT 24, -- For reminders: hours before appointment
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view whatsapp_templates" 
ON public.whatsapp_templates 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can insert whatsapp_templates" 
ON public.whatsapp_templates 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update whatsapp_templates" 
ON public.whatsapp_templates 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete whatsapp_templates" 
ON public.whatsapp_templates 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_whatsapp_templates_updated_at
BEFORE UPDATE ON public.whatsapp_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default templates
INSERT INTO public.whatsapp_templates (name, type, message, hours_before) VALUES
('Lembrete de Agendamento', 'reminder', 'Olá {{cliente}}! 👋

Passando para lembrar do seu agendamento amanhã:

📅 Data: {{data}}
⏰ Horário: {{horario}}
💆 Serviço: {{servico}}

Estamos te esperando! 💕

Caso precise reagendar, entre em contato conosco.', 24),
('Aniversário', 'birthday', 'Feliz Aniversário, {{cliente}}! 🎂🎉

A equipe da clínica deseja a você um dia muito especial, repleto de alegrias e realizações!

Como presente, preparamos uma surpresa especial para você. Entre em contato para saber mais! 🎁

Um grande abraço! 💕', NULL);
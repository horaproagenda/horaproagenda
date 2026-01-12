-- Create table to track trial usage (prevent re-use of 7-day trial)
CREATE TABLE public.trial_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT,
  full_name TEXT NOT NULL,
  company_name TEXT,
  cnpj TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trial_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  trial_ended_at TIMESTAMP WITH TIME ZONE,
  trial_days INTEGER DEFAULT 7,
  has_paid BOOLEAN DEFAULT false,
  subscription_status TEXT DEFAULT 'trial',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(email)
);

-- Create index for faster lookups
CREATE INDEX idx_trial_registrations_email ON public.trial_registrations(email);
CREATE INDEX idx_trial_registrations_phone ON public.trial_registrations(phone);
CREATE INDEX idx_trial_registrations_cnpj ON public.trial_registrations(cnpj);

-- Enable RLS
ALTER TABLE public.trial_registrations ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage all records (for edge functions)
CREATE POLICY "Service role can manage trial registrations"
ON public.trial_registrations
FOR ALL
USING (true)
WITH CHECK (true);

-- Users can view their own trial registration
CREATE POLICY "Users can view their own trial registration"
ON public.trial_registrations
FOR SELECT
USING (auth.uid() = user_id);

-- Create function to check if email/phone/cnpj already used trial
CREATE OR REPLACE FUNCTION public.check_trial_eligibility(
  p_email TEXT,
  p_phone TEXT DEFAULT NULL,
  p_cnpj TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_existing RECORD;
BEGIN
  -- Check by email first
  SELECT * INTO v_existing 
  FROM public.trial_registrations 
  WHERE email = LOWER(p_email);
  
  IF FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'email_exists',
      'message', 'Este e-mail já possui cadastro. Use a opção "Esqueci minha senha" para recuperar o acesso.',
      'trial_started_at', v_existing.trial_started_at,
      'has_paid', v_existing.has_paid
    );
  END IF;
  
  -- Check by phone if provided
  IF p_phone IS NOT NULL AND p_phone != '' THEN
    SELECT * INTO v_existing 
    FROM public.trial_registrations 
    WHERE phone = p_phone;
    
    IF FOUND THEN
      RETURN jsonb_build_object(
        'eligible', false,
        'reason', 'phone_exists',
        'message', 'Este número de telefone já foi usado em outro cadastro.',
        'email', v_existing.email
      );
    END IF;
  END IF;
  
  -- Check by CNPJ if provided
  IF p_cnpj IS NOT NULL AND p_cnpj != '' THEN
    SELECT * INTO v_existing 
    FROM public.trial_registrations 
    WHERE cnpj = p_cnpj;
    
    IF FOUND THEN
      RETURN jsonb_build_object(
        'eligible', false,
        'reason', 'cnpj_exists',
        'message', 'Este CNPJ já foi usado em outro cadastro.',
        'email', v_existing.email
      );
    END IF;
  END IF;
  
  -- User is eligible for trial
  RETURN jsonb_build_object(
    'eligible', true,
    'message', 'Usuário elegível para período de teste'
  );
END;
$$;

-- Create trigger to update updated_at
CREATE TRIGGER update_trial_registrations_updated_at
BEFORE UPDATE ON public.trial_registrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
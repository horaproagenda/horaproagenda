-- Remove leitura/atualização pública (códigos não devem ser visíveis no cliente)
DROP POLICY IF EXISTS "Anyone can read recent verifications" ON public.verificacoes_whatsapp;
DROP POLICY IF EXISTS "Anyone can confirm recent verifications" ON public.verificacoes_whatsapp;

-- Revoga privilégios SELECT/UPDATE de anon e authenticated
REVOKE SELECT, UPDATE ON public.verificacoes_whatsapp FROM anon;
REVOKE SELECT, UPDATE ON public.verificacoes_whatsapp FROM authenticated;

-- Função segura para confirmar código sem expô-lo ao cliente
CREATE OR REPLACE FUNCTION public.confirmar_codigo_whatsapp(
  p_id uuid,
  p_codigo text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.verificacoes_whatsapp%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.verificacoes_whatsapp
  WHERE id = p_id
    AND criado_em > now() - interval '15 minutes';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_row.codigo_verificacao <> p_codigo THEN
    RETURN false;
  END IF;

  UPDATE public.verificacoes_whatsapp
  SET verificado = true
  WHERE id = p_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_codigo_whatsapp(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_codigo_whatsapp(uuid, text) TO anon, authenticated;
DROP FUNCTION IF EXISTS public.get_document_fill_link_by_token(text);

CREATE OR REPLACE FUNCTION public.get_document_fill_link_by_token(p_token text)
 RETURNS TABLE(id uuid, template_id uuid, client_id uuid, professional_id uuid, status text, expires_at timestamp with time zone, filled_at timestamp with time zone, filled_content text, filled_variables jsonb, template_title text, template_content text, template_variables text[], professional_name text, client_name text, client_birthdate date, client_cpf text, client_phone text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    dfl.id,
    dfl.template_id,
    dfl.client_id,
    dfl.professional_id,
    dfl.status::text,
    dfl.expires_at,
    dfl.filled_at,
    dfl.filled_content,
    dfl.filled_variables,
    dt.title,
    dt.content,
    dt.variables,
    p.name,
    c.name,
    c.birthdate,
    c.cpf,
    c.phone
  FROM public.document_fill_links dfl
  JOIN public.document_templates dt ON dt.id = dfl.template_id
  LEFT JOIN public.professionals p ON p.id = dfl.professional_id
  LEFT JOIN public.clients c ON c.id = dfl.client_id
  WHERE dfl.token = p_token
    AND (dfl.expires_at IS NULL OR dfl.expires_at >= now())
  LIMIT 1;
END;
$function$;
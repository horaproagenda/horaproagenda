CREATE OR REPLACE FUNCTION public.seed_default_payment_methods(_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.payment_methods (
    name, description, is_active, max_installments,
    card_fee, debit_fee, installment_fee, account_owner_id
  )
  VALUES
    ('Dinheiro',               'Pagamento em espécie',                                      true, 1,  0, 0, 0, _owner_id),
    ('PIX',                    'Transferência instantânea via PIX',                         true, 1,  0, 0, 0, _owner_id),
    ('Cartão de Crédito',      'Cartão de crédito (bandeira, taxa e parcelas na venda)',    true, 12, 0, 0, 0, _owner_id),
    ('Cartão de Débito',       'Cartão de débito (bandeira e taxa na venda)',               true, 1,  0, 0, 0, _owner_id),
    ('Boleto Bancário',        'Cobrança via boleto (parcelável)',                          true, 12, 0, 0, 0, _owner_id),
    ('Cheque',                 'Pagamento via cheque',                                      true, 1,  0, 0, 0, _owner_id),
    ('Transferência Bancária', 'TED/DOC/Transferência bancária',                            true, 1,  0, 0, 0, _owner_id),
    ('Crédito ao Cliente',     'Uso de saldo de crédito do cliente (sem entrada no caixa)', true, 1,  0, 0, 0, _owner_id),
    ('Outros',                 'Outras formas de pagamento',                                true, 1,  0, 0, 0, _owner_id)
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.issue_verification_code(
  p_email text,
  p_type text,
  p_code text,
  p_expires_at timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_type text := lower(trim(coalesce(p_type, '')));
  v_recent public.verification_codes%ROWTYPE;
  v_created public.verification_codes%ROWTYPE;
  v_retry integer;
BEGIN
  IF v_email = '' OR v_type NOT IN ('signup', 'login') OR length(regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g')) <> 6 THEN
    RETURN jsonb_build_object('created', false, 'code', 'invalid_input');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_email || ':' || v_type));

  SELECT * INTO v_recent
  FROM public.verification_codes
  WHERE email = v_email AND type = v_type
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND AND v_recent.created_at > now() - interval '60 seconds' THEN
    v_retry := greatest(1, ceil(extract(epoch FROM ((v_recent.created_at + interval '60 seconds') - now())))::integer);
    RETURN jsonb_build_object('created', false, 'code', 'cooldown', 'retry_after', v_retry);
  END IF;

  UPDATE public.verification_codes
  SET used_at = coalesce(used_at, now())
  WHERE email = v_email
    AND type = v_type
    AND used_at IS NULL;

  INSERT INTO public.verification_codes (email, code, type, expires_at, attempts)
  VALUES (v_email, regexp_replace(p_code, '[^0-9]', '', 'g'), v_type, p_expires_at, 0)
  RETURNING * INTO v_created;

  RETURN jsonb_build_object('created', true, 'id', v_created.id, 'expires_at', v_created.expires_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_verification_code(text, text, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_verification_code(text, text, text, timestamp with time zone) TO service_role;
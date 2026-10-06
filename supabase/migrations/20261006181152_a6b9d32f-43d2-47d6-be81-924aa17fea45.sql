CREATE OR REPLACE FUNCTION public.tg_audit_visibility_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
      NEW.visibility IS DISTINCT FROM OLD.visibility
      OR NEW.owner_professional_id IS DISTINCT FROM OLD.owner_professional_id) THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id,
            jsonb_build_object('event','visibility_change','visibility', OLD.visibility, 'owner_professional_id', OLD.owner_professional_id),
            jsonb_build_object('event','visibility_change','visibility', NEW.visibility, 'owner_professional_id', NEW.owner_professional_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_personal_product_document_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_professional_id uuid;
  v_employment_type text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_professional_id := public.get_professional_id_for_user(auth.uid());
    IF v_professional_id IS NOT NULL THEN
      SELECT employment_type::text INTO v_employment_type
      FROM public.professionals WHERE id = v_professional_id;

      IF v_employment_type = 'independente'
         OR public.has_role(auth.uid(), 'professional'::public.app_role)
         OR COALESCE((SELECT (permissions->>'can_manage_products')::boolean
                      FROM public.professionals WHERE id = v_professional_id), false) THEN
        IF TG_OP = 'UPDATE' THEN
          -- Editar não transfere a posse nem muda a privacidade.
          NEW.owner_professional_id := OLD.owner_professional_id;
          NEW.visibility := OLD.visibility;
        ELSE
          NEW.owner_professional_id := v_professional_id;
          NEW.visibility := 'private'::public.data_visibility;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
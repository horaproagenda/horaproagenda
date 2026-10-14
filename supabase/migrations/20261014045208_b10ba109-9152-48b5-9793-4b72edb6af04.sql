DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.create_multi_item_sale_atomic(jsonb,uuid)'::regprocedure) INTO d;
 d:=replace(d,'AND s.is_active;', 'AND s.is_active FOR SHARE;');
 d:=replace(d,'AND t.is_active;', 'AND t.is_active FOR SHARE;');
 d:=replace(d,'AND p.is_active AND p.is_for_sale;', 'AND p.is_active AND p.is_for_sale FOR UPDATE;');
 d:=replace(d,$s$IF kind='package' AND prof IS NULL THEN$s$, $s$IF NOT public.can_write_record(CASE WHEN kind='product' THEN prof ELSE (SELECT owner_professional_id FROM public.services WHERE id=source_id AND kind='service' UNION ALL SELECT owner_professional_id FROM public.package_templates WHERE id=source_id AND kind='package' LIMIT 1) END,CASE WHEN kind='product' THEN 'produtos' ELSE 'servicos' END,'edit') THEN RAISE EXCEPTION 'Sem permissão para operar este item.' USING ERRCODE='42501'; END IF;
 IF kind='package' AND prof IS NULL THEN$s$);
 EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION public.guard_sale_batch_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.batch_request_id IS DISTINCT FROM OLD.batch_request_id OR NEW.batch_payload IS DISTINCT FROM OLD.batch_payload OR (OLD.batch_request_id IS NOT NULL AND (NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.account_owner_id IS DISTINCT FROM OLD.account_owner_id)) THEN RAISE EXCEPTION 'A identificação oficial da venda não pode ser alterada.'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER sale_batch_identity BEFORE UPDATE ON public.single_sales FOR EACH ROW EXECUTE FUNCTION public.guard_sale_batch_identity();
REVOKE ALL ON FUNCTION public.guard_sale_batch_identity() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_package_catalog_values() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE val numeric; BEGIN
 val:=CASE WHEN TG_TABLE_NAME='package_templates' THEN (to_jsonb(NEW)->>'price')::numeric ELSE (to_jsonb(NEW)->>'total_price')::numeric END;
 IF TG_OP='INSERT' OR NEW.name IS DISTINCT FROM OLD.name THEN IF nullif(trim(NEW.name),'') IS NULL THEN RAISE EXCEPTION 'Informe o nome do pacote.'; END IF; END IF;
 IF TG_OP='INSERT' OR (CASE WHEN TG_TABLE_NAME='package_templates' THEN to_jsonb(NEW)->'price' IS DISTINCT FROM to_jsonb(OLD)->'price' ELSE to_jsonb(NEW)->'total_price' IS DISTINCT FROM to_jsonb(OLD)->'total_price' END) THEN
 IF val IS NULL OR val<0 OR val::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Informe um valor válido para o pacote.'; END IF; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER package_catalog_values BEFORE INSERT OR UPDATE ON public.package_templates FOR EACH ROW EXECUTE FUNCTION public.guard_package_catalog_values();
CREATE TRIGGER package_instance_values BEFORE INSERT OR UPDATE ON public.service_packages FOR EACH ROW EXECUTE FUNCTION public.guard_package_catalog_values();
REVOKE ALL ON FUNCTION public.guard_package_catalog_values() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_application_quantity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='INSERT' OR NEW.quantity IS DISTINCT FROM OLD.quantity THEN
 IF NEW.quantity IS NOT NULL AND (NEW.quantity<=0 OR NEW.quantity::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Informe uma quantidade positiva para o produto da ficha.'; END IF; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER application_quantity BEFORE INSERT OR UPDATE ON public.application_items FOR EACH ROW EXECUTE FUNCTION public.guard_application_quantity();
REVOKE ALL ON FUNCTION public.guard_application_quantity() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mirror_product_usage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.purchase_id IS NOT NULL THEN
 UPDATE public.product_purchases SET started_using_at=NEW.start_date,finished_at=CASE WHEN NEW.status='completed' THEN NEW.end_date ELSE NULL END,cycle_quantity=NEW.stock_quantity,cycle_unit=NEW.container_unit,cycle_appointments=NEW.appointments_counted,avg_quantity_per_appointment=NEW.avg_quantity_per_appointment,updated_by=auth.uid() WHERE id=NEW.purchase_id;
 END IF;
 IF NEW.status IN ('planned','in_use','completed') OR NOT EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=NEW.product_id AND status IN ('planned','in_use')) THEN
 UPDATE public.products SET started_using_at=CASE WHEN NEW.status='cancelled' THEN NULL ELSE NEW.start_date END, finished_at=CASE WHEN NEW.status='completed' THEN NEW.end_date ELSE NULL END,cycle_quantity=CASE WHEN NEW.status='in_use' THEN NEW.stock_quantity ELSE NULL END,cycle_unit=CASE WHEN NEW.status='in_use' THEN NEW.container_unit ELSE NULL END,updated_by=auth.uid() WHERE id=NEW.product_id;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.keep_purchase_usage_dates_legacy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.product_usage_records;
BEGIN
 SELECT * INTO u FROM public.product_usage_records WHERE purchase_id=NEW.id ORDER BY created_at DESC LIMIT 1;
 IF u.id IS NOT NULL THEN
 NEW.started_using_at:=u.start_date; NEW.finished_at:=CASE WHEN u.status='completed' THEN u.end_date ELSE NULL END; NEW.cycle_quantity:=u.stock_quantity; NEW.cycle_unit:=u.container_unit;
 ELSE
 IF TG_OP='INSERT' THEN NEW.started_using_at:=NULL; NEW.finished_at:=NULL; ELSE NEW.started_using_at:=OLD.started_using_at; NEW.finished_at:=OLD.finished_at; END IF;
 END IF;
 RETURN NEW;
END $$;
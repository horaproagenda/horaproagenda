REVOKE ALL ON FUNCTION public.tg_sync_package_sale_on_payment() FROM anon, public, authenticated;
REVOKE ALL ON FUNCTION public.heal_package_sales_payment() FROM anon, public, authenticated;
REVOKE ALL ON FUNCTION public.sync_package_sale_from_appointments(uuid) FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.heal_package_sales_payment() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_package_sale_from_appointments(uuid) TO service_role;
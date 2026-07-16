-- Remove o papel super_admin da conta de teste para restaurar o isolamento por tenant.
-- O papel super_admin bypassa RLS via is_super_admin(), permitindo ver dados de outros cadastros.
DELETE FROM public.user_roles
WHERE user_id = '60a460b5-a3a1-4c33-b71f-ab4cce32cc68'
  AND role::text = 'super_admin';
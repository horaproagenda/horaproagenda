-- Add individual permissions to professionals table
ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{
  "can_manage_payments": false,
  "can_view_other_agendas": false,
  "can_view_other_clients": false,
  "can_view_daily_revenue": false,
  "can_open_close_register": false,
  "can_modify_agenda": false,
  "can_view_other_registers": false,
  "can_manage_products": false,
  "can_view_other_reports": false,
  "can_access_audit": false,
  "can_access_settings": false
}'::jsonb;

-- Add comment to explain the permissions structure
COMMENT ON COLUMN public.professionals.permissions IS 'JSON object containing granular permissions for each professional';

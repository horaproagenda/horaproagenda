-- Add automation settings columns to business_settings
ALTER TABLE public.business_settings 
ADD COLUMN IF NOT EXISTS automation_whatsapp_reminders boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS automation_waitlist boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS automation_gap_finder boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS automation_occupancy_dashboard boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS automation_smart_recurrence boolean DEFAULT true;
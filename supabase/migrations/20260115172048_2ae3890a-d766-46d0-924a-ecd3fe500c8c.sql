-- Add recurring_group_id to link recurring appointments together
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS recurring_group_id uuid;

-- Add index for faster lookups of recurring groups
CREATE INDEX IF NOT EXISTS idx_appointments_recurring_group_id 
ON public.appointments(recurring_group_id) 
WHERE recurring_group_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.appointments.recurring_group_id IS 'Groups recurring appointments together. All appointments in the same recurring series share this ID.';
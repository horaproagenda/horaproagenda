-- Add payment fields to appointments table
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS payment_methods text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS amount_paid numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms(id);

-- Create index for payment status
CREATE INDEX IF NOT EXISTS idx_appointments_payment_status ON public.appointments(payment_status);
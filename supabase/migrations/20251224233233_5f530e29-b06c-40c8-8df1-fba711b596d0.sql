-- Create reminders table for user reminders and routines
CREATE TABLE public.reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  reminder_date DATE,
  reminder_time TIME,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_frequency TEXT, -- 'daily', 'weekly', 'monthly'
  recurring_days INTEGER[], -- for weekly: 0-6 (Sunday-Saturday), for monthly: 1-31
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  category TEXT,
  priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high'
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

-- Enable Row Level Security
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view reminders"
ON public.reminders
FOR SELECT
USING (true);

CREATE POLICY "Admins and receptionists can insert reminders"
ON public.reminders
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update reminders"
ON public.reminders
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete reminders"
ON public.reminders
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create updated_at trigger
CREATE TRIGGER update_reminders_updated_at
BEFORE UPDATE ON public.reminders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
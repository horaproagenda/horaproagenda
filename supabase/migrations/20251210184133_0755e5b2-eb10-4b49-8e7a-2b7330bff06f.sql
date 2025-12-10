-- Add new columns to professionals table
ALTER TABLE public.professionals
ADD COLUMN cpf text,
ADD COLUMN birthdate date,
ADD COLUMN agenda_color text DEFAULT '#3B82F6',
ADD COLUMN app_role text DEFAULT 'professional',
ADD COLUMN is_commission_based boolean DEFAULT false,
ADD COLUMN commission_percentage numeric DEFAULT 0;
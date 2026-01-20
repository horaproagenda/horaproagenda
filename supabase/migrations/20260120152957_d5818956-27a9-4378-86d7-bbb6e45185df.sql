
-- Fix the appointment on 13/10 for Kelly Samara - link it to the package
-- First, update the appointment to link it to the package_appointment
UPDATE appointments 
SET 
  package_appointment_id = 'cbd6cf76-8839-43a5-84c2-976ee638fcd5',
  notes = 'Buço + axila + virilha + canela - Sessão 4 de 10',
  payment_status = 'paid',
  service_id = NULL
WHERE id = 'b974d44a-ee1e-45ad-a244-a7ed8432bb9b';

-- Update the package_appointment status to completed since the appointment is completed
UPDATE package_appointments 
SET status = 'completed'
WHERE id = 'cbd6cf76-8839-43a5-84c2-976ee638fcd5';

-- Update sessions_scheduled counter
UPDATE service_packages 
SET sessions_scheduled = 4
WHERE id = '1060231c-fdc5-4452-9db6-25f4425e310f';

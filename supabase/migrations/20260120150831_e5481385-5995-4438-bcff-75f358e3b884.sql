-- Fix sessions_scheduled counter to reflect actual scheduled + completed sessions
UPDATE service_packages sp
SET sessions_scheduled = (
  SELECT COUNT(*) 
  FROM package_appointments pa
  WHERE pa.package_id = sp.id
  AND pa.appointment_id IS NOT NULL
);
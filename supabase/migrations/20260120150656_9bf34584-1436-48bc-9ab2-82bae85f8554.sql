-- Fix appointment notes to correctly reflect the actual session number
-- Update notes to use the correct session_number from package_appointments

-- First, let's update appointments that have incorrect session numbering in notes
UPDATE appointments a
SET notes = CASE
  WHEN pa.package_id IS NOT NULL AND sp.name IS NOT NULL THEN
    sp.name || ' - Sessão ' || pa.session_number || ' de ' || sp.total_sessions
  ELSE a.notes
END
FROM package_appointments pa
JOIN service_packages sp ON pa.package_id = sp.id
WHERE a.package_appointment_id = pa.id
AND a.notes IS NOT NULL
AND a.notes LIKE '%Sessão%';
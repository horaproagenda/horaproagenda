-- Fix ALL appointment notes to correctly show session number
-- Including those that don't have the "Sessão" pattern yet

UPDATE appointments a
SET notes = sp.name || ' - Sessão ' || pa.session_number || ' de ' || sp.total_sessions
FROM package_appointments pa
JOIN service_packages sp ON pa.package_id = sp.id
WHERE a.package_appointment_id = pa.id
AND a.package_appointment_id IS NOT NULL;
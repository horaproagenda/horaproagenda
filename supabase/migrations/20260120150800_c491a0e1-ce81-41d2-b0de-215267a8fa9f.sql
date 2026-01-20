-- Sync package_appointments status with the actual appointment status
UPDATE package_appointments pa
SET status = CASE
  WHEN a.status = 'completed' THEN 'completed'
  WHEN a.status IN ('scheduled', 'confirmed') THEN 'scheduled'
  WHEN a.status IN ('cancelled', 'missed', 'rescheduled') THEN 'pending'
  ELSE pa.status
END
FROM appointments a
WHERE pa.appointment_id = a.id;
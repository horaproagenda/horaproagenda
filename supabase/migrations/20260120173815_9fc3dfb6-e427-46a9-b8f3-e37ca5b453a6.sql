
-- Fix Núbia's appointments: add the missing session 6 
-- First, get the service info for the correct service
-- The appointments are in July gap, need to insert session 6 between session 5 (June) and current session 7 (July)

-- Insert the missing appointment for session 6
INSERT INTO appointments (
  id,
  client_id,
  service_id,
  professional_id,
  room_id,
  start_time,
  end_time,
  status,
  payment_status,
  notes,
  recurring_group_id
)
SELECT 
  gen_random_uuid(),
  a.client_id,
  a.service_id,
  a.professional_id,
  a.room_id,
  -- Session 6 should be in July, before session 7 (2026-07-11)
  -- Based on the pattern, around early July
  '2026-07-04 12:00:00+00'::timestamptz,
  '2026-07-04 13:00:00+00'::timestamptz,
  'scheduled',
  'pending',
  'Sessão 6 de 9',
  a.recurring_group_id
FROM appointments a
WHERE a.id = 'd478ca45-994e-44fd-9d71-b9826ed3b2a8' -- session 7
LIMIT 1;

-- Now fix all session numbers to be correct sequence
-- Session 7 should stay at July 11, but now it becomes session 7 since we added 6
-- But wait, we need to renumber: 1,2,3,4,5 are correct, then 6 (new), 7 (was 7), 8 (was 8), 9 (was 9)
-- Actually the issue was session 6 was missing, so now we have 9 sessions total

-- Update session 7 -> stays as 7 (after we add 6)
-- Sessions are now correctly numbered after insert

-- Update the notes to fix any inconsistencies
UPDATE appointments 
SET notes = 'Sessão 7 de 9'
WHERE id = 'd478ca45-994e-44fd-9d71-b9826ed3b2a8';

UPDATE appointments 
SET notes = 'Sessão 8 de 9'
WHERE id = 'bee3292b-94d9-4950-86e4-9af435dc78cb';

UPDATE appointments 
SET notes = 'Sessão 9 de 9'
WHERE id = '64760e24-f79c-4fb3-8c93-6f49e62da86c';

-- Create client packages for existing sales that failed
-- Client 1: Igor Rafael (0b7db46d-456a-46d9-b8a2-6720a9bc268f)
INSERT INTO service_packages (
  client_id, name, total_price, total_sessions, duration, interval_days, 
  professional_id, sessions_scheduled, is_active, category
) VALUES (
  '0b7db46d-456a-46d9-b8a2-6720a9bc268f', 
  'Pacote - axilas', 
  2220, 
  10, 
  60, 
  15,
  'd677cee8-065a-4084-b979-c3406ec2dd35',
  0, 
  true,
  'Pago via Caixa'
);

-- Client 2: Joana Mariana de Castro (3ba051d9-f78b-4b19-ad69-73cd25964f1b)
INSERT INTO service_packages (
  client_id, name, total_price, total_sessions, duration, interval_days,
  professional_id, sessions_scheduled, is_active, category
) VALUES (
  '3ba051d9-f78b-4b19-ad69-73cd25964f1b', 
  'Pacote - axilas', 
  2220, 
  10, 
  60, 
  15,
  'd677cee8-065a-4084-b979-c3406ec2dd35',
  0, 
  true,
  'Pago via Caixa'
);
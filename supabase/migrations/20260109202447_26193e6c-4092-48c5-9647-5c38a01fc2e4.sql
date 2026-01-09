-- Update business closing time to 20:00
UPDATE business_settings 
SET closing_time = '20:00:00', 
    updated_at = now() 
WHERE id = 'b78b38e9-51c6-406b-988e-5c502f7f154e';
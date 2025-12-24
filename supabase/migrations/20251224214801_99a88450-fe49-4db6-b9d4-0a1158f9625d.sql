-- Update references in financial_entries to point to the older payment method
UPDATE financial_entries 
SET payment_method_id = 'fd5f1f2b-03b2-4ee4-be94-69b6e55632ea' 
WHERE payment_method_id = '8b5c1f06-1e1c-453a-bd99-0b0eb4b0e28b';

-- Update references in single_sales to point to the older payment method
UPDATE single_sales 
SET payment_method_id = 'fd5f1f2b-03b2-4ee4-be94-69b6e55632ea' 
WHERE payment_method_id = '8b5c1f06-1e1c-453a-bd99-0b0eb4b0e28b';

-- Now delete the duplicate payment method
DELETE FROM payment_methods WHERE id = '8b5c1f06-1e1c-453a-bd99-0b0eb4b0e28b';
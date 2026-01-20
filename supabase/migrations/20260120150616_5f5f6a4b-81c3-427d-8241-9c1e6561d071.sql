-- Fix package prices (divide by 10 those that were entered incorrectly)
UPDATE service_packages 
SET total_price = total_price / 10 
WHERE total_price >= 10000;

-- Also fix any single_sales records that might have wrong package prices
UPDATE single_sales 
SET original_amount = original_amount / 10, final_amount = final_amount / 10
WHERE package_id IS NOT NULL AND original_amount >= 10000;
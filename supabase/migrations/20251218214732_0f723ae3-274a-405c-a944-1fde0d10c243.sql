-- Add fee_behavior column to card_brands table to configure if fee is charged to client or deducted from provider
ALTER TABLE public.card_brands 
ADD COLUMN IF NOT EXISTS fee_behavior text NOT NULL DEFAULT 'deduct_from_provider';

-- Add comment to explain the column values
COMMENT ON COLUMN public.card_brands.fee_behavior IS 'Defines how the card fee is applied: add_to_client (client pays fee) or deduct_from_provider (fee is deducted from what provider receives)';
-- Add card_fee to payment_methods for credit/debit card fees
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS card_fee numeric DEFAULT 0;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS installment_fee numeric DEFAULT 0;

-- Add recurring fields to financial_entries
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS recurring_count integer;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS recurring_frequency text DEFAULT 'monthly';
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS installments integer DEFAULT 1;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS paid_by uuid;

-- Add package_id to single_sales for tracking package sales
ALTER TABLE single_sales ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES service_packages(id);
ALTER TABLE single_sales ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'service';
ALTER TABLE single_sales ADD COLUMN IF NOT EXISTS paid_by uuid;
ALTER TABLE single_sales ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;
ALTER TABLE single_sales ADD COLUMN IF NOT EXISTS installments integer DEFAULT 1;
ALTER TABLE single_sales ADD COLUMN IF NOT EXISTS card_fee_amount numeric DEFAULT 0;

-- Insert predefined expense categories
INSERT INTO financial_categories (name, type, is_recurring, description) VALUES 
  ('Despesas Financeiras', 'expense', false, 'Taxas bancárias, juros, etc.'),
  ('Despesas Fixas', 'expense', true, 'Aluguel, internet, etc.'),
  ('Pró-labore', 'expense', true, 'Retirada dos sócios'),
  ('Despesas Variáveis', 'expense', false, 'Despesas que variam mensalmente'),
  ('Funcionários', 'expense', true, 'Salários e encargos'),
  ('Comissão', 'expense', false, 'Comissões de vendas'),
  ('Vale', 'expense', false, 'Vales para funcionários'),
  ('Materiais de Atendimento', 'expense', false, 'Produtos usados nos atendimentos'),
  ('Materiais de Limpeza', 'expense', false, 'Produtos de limpeza')
ON CONFLICT DO NOTHING;
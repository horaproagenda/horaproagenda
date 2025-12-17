-- Adicionar campos extras à tabela de fornecedores
ALTER TABLE public.suppliers
ADD COLUMN cnpj TEXT,
ADD COLUMN uf TEXT,
ADD COLUMN company_name TEXT,
ADD COLUMN state_registration TEXT,
ADD COLUMN municipal_registration TEXT;
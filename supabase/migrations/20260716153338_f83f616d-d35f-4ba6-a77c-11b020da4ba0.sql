CREATE OR REPLACE FUNCTION public.auto_purge_sale_on_boletos_cleared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Não apagar venda automaticamente quando parcelas são removidas.
  -- Parcelas podem ser editadas/recriadas durante uma correção manual; apagar
  -- a venda aqui remove também pacote, sessões, financeiro e caixa legítimos.
  -- Para desfazer a venda inteira, use explicitamente purge_single_sale_cascade.
  RETURN OLD;
END;
$$;
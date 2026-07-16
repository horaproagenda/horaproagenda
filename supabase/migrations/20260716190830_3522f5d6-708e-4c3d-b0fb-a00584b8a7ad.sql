-- Limpeza de vínculos órfãos de produto que ficaram apontando para serviços ou
-- templates de pacote já removidos. O FK atual é CASCADE, mas linhas antigas
-- criadas antes do cascade existir precisam ser removidas manualmente.

DELETE FROM public.service_products sp
WHERE NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = sp.service_id);

DELETE FROM public.package_template_products tp
WHERE NOT EXISTS (SELECT 1 FROM public.package_templates t WHERE t.id = tp.template_id);

-- Backfill de estimativa quando o vínculo é "estimado" mas ficou sem número
-- de atendimentos calculado. Usa a razão recipiente/qtd por uso quando possível,
-- senão marca com 1 para evitar divisão por zero. UI mostra "a calcular" quando
-- o valor ainda for nulo, então só preenchemos quando os dois insumos existem.

UPDATE public.service_products
SET estimated_appointments = GREATEST(1, CEIL(container_amount / NULLIF(quantity_per_use, 0))::int)
WHERE tracking_method = 'estimated'
  AND estimated_appointments IS NULL
  AND container_amount IS NOT NULL
  AND container_amount > 0
  AND quantity_per_use IS NOT NULL
  AND quantity_per_use > 0
  AND quantity_per_use < container_amount;

UPDATE public.package_template_products
SET estimated_appointments = GREATEST(1, CEIL(container_amount / NULLIF(quantity_per_use, 0))::int)
WHERE tracking_method = 'estimated'
  AND estimated_appointments IS NULL
  AND container_amount IS NOT NULL
  AND container_amount > 0
  AND quantity_per_use IS NOT NULL
  AND quantity_per_use > 0
  AND quantity_per_use < container_amount;

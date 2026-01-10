
-- Identificar agendamentos duplicados/conflitantes para limpeza
-- Manter apenas um agendamento para cada combinação de profissional + horário
-- e um agendamento para cada combinação de sala + horário

-- Criar tabela temporária com IDs a remover
CREATE TEMP TABLE duplicates_to_remove AS
WITH professional_duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY professional_id, start_time, end_time 
      ORDER BY created_at ASC
    ) as rn
  FROM appointments
  WHERE professional_id IS NOT NULL
    AND status != 'cancelled'
),
room_duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY room_id, start_time, end_time 
      ORDER BY created_at ASC
    ) as rn
  FROM appointments
  WHERE room_id IS NOT NULL
    AND status != 'cancelled'
)
SELECT id FROM professional_duplicates WHERE rn > 1
UNION
SELECT id FROM room_duplicates WHERE rn > 1;

-- 1. Remover registros financeiros vinculados
DELETE FROM financial_entries
WHERE appointment_id IN (SELECT id FROM duplicates_to_remove);

-- 2. Remover transações de caixa vinculadas
DELETE FROM cash_transactions
WHERE reference_id IN (SELECT id FROM duplicates_to_remove)
AND reference_type = 'appointment';

-- 3. Desvincular package_appointments
UPDATE package_appointments
SET appointment_id = NULL, status = 'pending', scheduled_date = NULL
WHERE appointment_id IN (SELECT id FROM duplicates_to_remove);

-- 4. Remover consumo de produtos
DELETE FROM appointment_product_consumption
WHERE appointment_id IN (SELECT id FROM duplicates_to_remove);

-- 5. Finalmente remover os agendamentos duplicados
DELETE FROM appointments
WHERE id IN (SELECT id FROM duplicates_to_remove);

-- Limpar tabela temporária
DROP TABLE duplicates_to_remove;

-- Atualizar sessions_scheduled nos pacotes afetados
UPDATE service_packages sp
SET sessions_scheduled = (
  SELECT COUNT(*) 
  FROM package_appointments pa 
  WHERE pa.package_id = sp.id 
  AND pa.status IN ('scheduled', 'completed')
);

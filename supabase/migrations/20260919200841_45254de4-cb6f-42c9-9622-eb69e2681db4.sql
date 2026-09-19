-- Caixa próprio do profissional: abrir
CREATE POLICY "Professionals can open their own register"
ON public.cash_registers
FOR INSERT
TO authenticated
WITH CHECK (
  professional_id IS NOT NULL
  AND opened_by = auth.uid()
  AND (
    professional_id = public.my_professional_id()
    OR public.is_account_admin(auth.uid())
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
);

-- Caixa próprio do profissional: atualizar/fechar
CREATE POLICY "Professionals can update their own register"
ON public.cash_registers
FOR UPDATE
TO authenticated
USING (
  professional_id IS NOT NULL
  AND (
    professional_id = public.my_professional_id()
    OR public.is_account_admin(auth.uid())
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
)
WITH CHECK (
  professional_id IS NOT NULL
  AND (
    professional_id = public.my_professional_id()
    OR public.is_account_admin(auth.uid())
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
);

-- Movimentações no caixa do profissional: criar
CREATE POLICY "Professionals can insert their own cash transactions"
ON public.cash_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  professional_id IS NOT NULL
  AND created_by = auth.uid()
  AND (
    professional_id = public.my_professional_id()
    OR public.is_account_admin(auth.uid())
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
);

-- Movimentações no caixa do profissional: atualizar
CREATE POLICY "Professionals can update their own cash transactions"
ON public.cash_transactions
FOR UPDATE
TO authenticated
USING (
  professional_id IS NOT NULL
  AND (
    professional_id = public.my_professional_id()
    OR public.is_account_admin(auth.uid())
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
)
WITH CHECK (
  professional_id IS NOT NULL
  AND (
    professional_id = public.my_professional_id()
    OR public.is_account_admin(auth.uid())
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
);
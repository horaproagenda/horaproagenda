ALTER TABLE public.room_members
  ADD COLUMN IF NOT EXISTS account_owner_id uuid;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS account_owner_id uuid;

ALTER TABLE public.phone_contacts
  ADD COLUMN IF NOT EXISTS account_owner_id uuid;

UPDATE public.room_members rm
SET account_owner_id = r.account_owner_id
FROM public.rooms r
WHERE rm.room_id = r.id
  AND rm.account_owner_id IS NULL;

UPDATE public.room_members rm
SET account_owner_id = p.account_owner_id
FROM public.profiles p
WHERE rm.user_id = p.id
  AND rm.account_owner_id IS NULL;

UPDATE public.messages m
SET account_owner_id = r.account_owner_id
FROM public.rooms r
WHERE m.room_id = r.id
  AND m.account_owner_id IS NULL;

UPDATE public.phone_contacts pc
SET account_owner_id = r.account_owner_id
FROM public.rooms r
WHERE pc.room_id = r.id
  AND pc.account_owner_id IS NULL;

ALTER TABLE public.room_members
  ALTER COLUMN account_owner_id SET DEFAULT public.current_account_owner_id();

ALTER TABLE public.messages
  ALTER COLUMN account_owner_id SET DEFAULT public.current_account_owner_id();

ALTER TABLE public.phone_contacts
  ALTER COLUMN account_owner_id SET DEFAULT public.current_account_owner_id();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members WHERE account_owner_id IS NULL LIMIT 1
  ) THEN
    ALTER TABLE public.room_members ALTER COLUMN account_owner_id SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.messages WHERE account_owner_id IS NULL LIMIT 1
  ) THEN
    ALTER TABLE public.messages ALTER COLUMN account_owner_id SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.phone_contacts WHERE account_owner_id IS NULL LIMIT 1
  ) THEN
    ALTER TABLE public.phone_contacts ALTER COLUMN account_owner_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_room_members_account_owner_id
  ON public.room_members(account_owner_id);

CREATE INDEX IF NOT EXISTS idx_messages_account_owner_id
  ON public.messages(account_owner_id);

CREATE INDEX IF NOT EXISTS idx_phone_contacts_account_owner_id
  ON public.phone_contacts(account_owner_id);

DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.room_members;
CREATE POLICY tenant_isolation_restrictive
ON public.room_members
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR account_owner_id = public.current_account_owner_id()
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    account_owner_id = public.current_account_owner_id()
    AND EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.id = room_members.room_id
        AND r.account_owner_id = public.current_account_owner_id()
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = room_members.user_id
        AND p.account_owner_id = public.current_account_owner_id()
    )
  )
);

DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.messages;
CREATE POLICY tenant_isolation_restrictive
ON public.messages
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR account_owner_id = public.current_account_owner_id()
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    account_owner_id = public.current_account_owner_id()
    AND EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.id = messages.room_id
        AND r.account_owner_id = public.current_account_owner_id()
    )
  )
);

DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.phone_contacts;
CREATE POLICY tenant_isolation_restrictive
ON public.phone_contacts
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR account_owner_id = public.current_account_owner_id()
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    account_owner_id = public.current_account_owner_id()
    AND EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.id = phone_contacts.room_id
        AND r.account_owner_id = public.current_account_owner_id()
    )
  )
);

DROP POLICY IF EXISTS "Admins or self can insert room_members" ON public.room_members;
CREATE POLICY "Admins or self can insert room_members"
ON public.room_members
FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR user_id = auth.uid()
  )
  AND account_owner_id = public.current_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = room_members.room_id
      AND r.account_owner_id = public.current_account_owner_id()
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = room_members.user_id
      AND p.account_owner_id = public.current_account_owner_id()
  )
);
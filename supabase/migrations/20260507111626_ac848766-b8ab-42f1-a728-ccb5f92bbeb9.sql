-- Tabela de logs de versão do app (visível apenas para admins)
CREATE TABLE IF NOT EXISTS public.app_version_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  event_type TEXT NOT NULL,
  current_version TEXT,
  detected_version TEXT,
  trigger_source TEXT,
  user_agent TEXT,
  url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_version_events_created_at ON public.app_version_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_version_events_user_id ON public.app_version_events(user_id);
CREATE INDEX IF NOT EXISTS idx_app_version_events_event_type ON public.app_version_events(event_type);

ALTER TABLE public.app_version_events ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado ou anônimo pode INSERIR seu próprio log (necessário para o watcher rodar)
CREATE POLICY "Anyone can insert version events"
ON public.app_version_events
FOR INSERT
TO public
WITH CHECK (true);

-- Apenas admins podem visualizar
CREATE POLICY "Only admins can view version events"
ON public.app_version_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Apenas admins podem deletar (limpeza)
CREATE POLICY "Only admins can delete version events"
ON public.app_version_events
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
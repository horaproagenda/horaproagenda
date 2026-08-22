import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { AccessDenied } from '@/components/AccessDenied';
import type { PermissionModuleKey, PermAction } from '@/lib/permissions';

interface RequirePermissionProps {
  module: PermissionModuleKey;
  action?: PermAction;
  children: ReactNode;
}

/**
 * Guarda de rota por permissão de módulo. Bloqueia o acesso mesmo quando o
 * usuário digita a URL diretamente. As consultas ao banco continuam protegidas
 * por RLS — esta é apenas a barreira visual equivalente.
 */
export function RequirePermission({ module, action = 'view', children }: RequirePermissionProps) {
  const { can, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Carregando" />
      </div>
    );
  }

  if (!can(module, action)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

export default RequirePermission;

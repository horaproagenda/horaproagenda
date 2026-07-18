import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AccessDenied } from '@/components/AccessDenied';
import { isSuperAdminEmail } from '@/lib/superAdminAllowlist';
import type { AppRole } from '@/types';

interface RequireRoleProps {
  role: AppRole;
  children: ReactNode;
  /** Extra guard: super_admin also requires the platform-owner allowlist. */
  requirePlatformOwner?: boolean;
}

/**
 * Guards a route by role. Renders <AccessDenied /> when the authenticated user
 * doesn't have the required role, preventing partial access to admin pages via
 * direct URL navigation.
 */
export function RequireRole({ role, children, requirePlatformOwner }: RequireRoleProps) {
  const { user, hasRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Carregando" />
      </div>
    );
  }

  const allowed =
    !!user &&
    hasRole(role) &&
    (!requirePlatformOwner || isSuperAdminEmail(user.email));

  if (!allowed) {
    return <AccessDenied requiredRole={role} />;
  }

  return <>{children}</>;
}

export default RequireRole;

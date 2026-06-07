import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  Sparkles, 
  Settings,
  Plus,
  BarChart3,
  ShoppingCart,
  ClipboardList,
  Package,
  Landmark,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  MessageSquare,
  Bell,
  FileSignature,
  Crown,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { APP_VERSION, APP_VERSION_LABEL } from '@/lib/version';
import { isSuperAdminEmail } from '@/lib/superAdminAllowlist';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Agenda', href: '/agenda', icon: Calendar },
  { name: 'Clientes', href: '/clientes', icon: Users },
  { name: 'Serviços', href: '/servicos', icon: Sparkles },
  { name: 'Cadastros', href: '/cadastros', icon: ClipboardList },
  { name: 'Caixa', href: '/caixa', icon: ShoppingCart },
  { name: 'Financeiro', href: '/financeiro', icon: Landmark },
  { name: 'Produtos', href: '/produtos', icon: Package },
  { name: 'Lembretes', href: '/lembretes', icon: Bell },
  
  { name: 'Documentos', href: '/documentos', icon: FileSignature },
  { name: 'Relatórios', href: '/relatorios', icon: BarChart3 },
  { name: 'Painel Admin', href: '/admin', icon: ShieldCheck, adminOnly: true },
  { name: 'Super Admin', href: '/super-admin', icon: Crown, superAdminOnly: true },
  { name: 'Configurações', href: '/configuracoes', icon: Settings },
  { name: 'Ajuda', href: '/ajuda', icon: HelpCircle },
  { name: 'Suporte', href: '/suporte', icon: MessageSquare },
] as Array<{ name: string; href: string; icon: typeof Calendar; adminOnly?: boolean; superAdminOnly?: boolean }>;

interface SidebarProps {
  onNewAppointment: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ onNewAppointment, isCollapsed, onToggleCollapse, mobileOpen = false, onMobileClose }: SidebarProps) {
  const { signOut, profile, hasRole, user } = useAuth();
  const isMobile = useIsMobile();
  // No mobile o drawer sempre exibe variante expandida (sem tooltips do Radix),
  // evitando que o primeiro toque abra tooltip em vez de navegar.
  const effectiveCollapsed = isCollapsed && !isMobile;
  const isPlatformOwner = isSuperAdminEmail(user?.email);
  const visibleNavigation = navigation.filter(item => {
    if (item.superAdminOnly && !(hasRole('super_admin') && isPlatformOwner)) return false;
    if (item.adminOnly && !hasRole('admin')) return false;
    return true;
  });
  const location = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const SCROLL_KEY = 'sidebar-nav-scroll';

  // Restore scroll synchronously before paint to avoid any visible jump
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) {
      const target = parseInt(saved, 10) || 0;
      el.scrollTop = target;
      // Re-apply on next frame in case nav children mount with delay
      requestAnimationFrame(() => {
        if (el.scrollTop !== target) el.scrollTop = target;
      });
    }
  }, [location.pathname]);

  const handleNavScroll = () => {
    if (navRef.current) {
      sessionStorage.setItem(SCROLL_KEY, String(navRef.current.scrollTop));
    }
  };

  const handleLogout = async () => {
    await signOut();
  };

  const handleNavClick = () => {
    if (navRef.current) {
      sessionStorage.setItem(SCROLL_KEY, String(navRef.current.scrollTop));
    }
    if (onMobileClose) onMobileClose();
  };

  return (
    <TooltipProvider delayDuration={0}>
      {/* Backdrop mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}
      <aside 
        className={cn(
          // Safe-area: respeita notch/status bar/home indicator (iOS) e display cutout (Android).
          // Sem isto, em PWA o menu mobile cobre o relógio/bateria do sistema.
          "fixed left-0 top-0 z-40 h-[100dvh] border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out pt-safe pb-safe pl-safe",
          isCollapsed ? "w-[72px]" : "w-64",
          // Mobile: oculta por padrão, abre como drawer
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className={cn(
            "flex h-20 items-center border-b border-sidebar-border transition-all duration-300",
            isCollapsed ? "px-3 justify-center" : "px-6"
          )}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-lg">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              {!isCollapsed && (
                <div className="overflow-hidden">
                  <h1 className="font-display text-xl font-semibold text-sidebar-foreground whitespace-nowrap">
                    Lume Agenda
                  </h1>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">Beleza com elegância</p>
                </div>
              )}
            </div>
          </div>

          {/* New Appointment Button */}
          <div className={cn("p-3", isCollapsed && "px-2")}>
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={onNewAppointment}
                    className="w-full h-12 p-0"
                    size="icon"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  Novo Agendamento
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button 
                onClick={onNewAppointment}
                className="w-full gap-2 h-12 shadow-md hover:shadow-lg transition-shadow"
                size="lg"
              >
                <Plus className="h-4 w-4" />
                Novo Agendamento
              </Button>
            )}
          </div>

          {/* Navigation */}
          <nav ref={navRef} onScroll={handleNavScroll} className="flex-1 space-y-1 px-2 py-2 overflow-y-auto overscroll-contain">
            {visibleNavigation.map((item) => (
              isCollapsed ? (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={item.href}
                      end={item.href === '/'}
                      onClick={handleNavClick}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center justify-center rounded-lg p-3 transition-all duration-200',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-primary shadow-sm'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                        )
                      }
                    >
                      <item.icon className="h-5 w-5" />
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {item.name}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <NavLink
                  key={item.name}
                  to={item.href}
                  end={item.href === '/'}
                  onClick={handleNavClick}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary shadow-sm'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                    )
                  }
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="truncate">{item.name}</span>
                </NavLink>
              )
            ))}
          </nav>

          {/* Logout Button */}
          <div className={cn("px-2 py-1", isCollapsed && "px-2")}>
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center justify-center rounded-lg p-3 text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  Sair
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-5 w-5 flex-shrink-0" />
                <span className="truncate">Sair</span>
              </button>
            )}
          </div>

          {/* Toggle Button */}
          <div className="px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className={cn(
                "w-full h-10 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-colors",
                isCollapsed && "p-0"
              )}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4" />
                  <span className="text-xs">Recolher</span>
                </>
              )}
            </Button>
          </div>

          {/* Footer */}
          {!isCollapsed ? (
            <div className="border-t border-sidebar-border p-4">
              <div className="rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 p-4">
                <p className="text-xs font-medium text-foreground">
                  {profile?.full_name || 'Usuário'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {profile?.email || 'Sistema de Agendamento'}
                </p>
              </div>
              <p className="mt-2 text-center text-[10px] text-muted-foreground/70">
                Lume Agenda · {APP_VERSION_LABEL}
              </p>
            </div>
          ) : (
            <div className="border-t border-sidebar-border py-2">
              <p className="text-center text-[10px] text-muted-foreground/70">{APP_VERSION}</p>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

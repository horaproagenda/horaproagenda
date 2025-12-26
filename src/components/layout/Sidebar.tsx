import { useState } from 'react';
import { NavLink } from 'react-router-dom';
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
  Shield,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  MessageSquare,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  { name: 'Relatórios', href: '/relatorios', icon: BarChart3 },
  { name: 'Auditoria', href: '/auditoria', icon: Shield },
  { name: 'Configurações', href: '/configuracoes', icon: Settings },
  { name: 'Ajuda', href: '/ajuda', icon: HelpCircle },
  { name: 'Suporte', href: '/suporte', icon: MessageSquare },
];

interface SidebarProps {
  onNewAppointment: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ onNewAppointment, isCollapsed, onToggleCollapse }: SidebarProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <aside 
        className={cn(
          "fixed left-0 top-0 z-40 h-screen border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out",
          isCollapsed ? "w-[72px]" : "w-64"
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
                    Belezza
                  </h1>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">Estética & Bem-estar</p>
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
          <nav className="flex-1 space-y-1 px-2 py-2 overflow-y-auto">
            {navigation.map((item) => (
              isCollapsed ? (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={item.href}
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
          {!isCollapsed && (
            <div className="border-t border-sidebar-border p-4">
              <div className="rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 p-4">
                <p className="text-xs font-medium text-foreground">
                  Versão 1.0
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sistema de Agendamento
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

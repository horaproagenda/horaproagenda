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
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Agenda', href: '/agenda', icon: Calendar },
  { name: 'Clientes', href: '/clientes', icon: Users },
  { name: 'Serviços', href: '/servicos', icon: Sparkles },
  { name: 'Cadastros', href: '/cadastros', icon: ClipboardList },
  { name: 'Caixa', href: '/caixa', icon: ShoppingCart },
  { name: 'Financeiro', href: '/financeiro', icon: Landmark },
  { name: 'Produtos', href: '/produtos', icon: Package },
  { name: 'Relatórios', href: '/relatorios', icon: BarChart3 },
  { name: 'Auditoria', href: '/auditoria', icon: Shield },
  { name: 'Configurações', href: '/configuracoes', icon: Settings },
];

interface SidebarProps {
  onNewAppointment: () => void;
}

export function Sidebar({ onNewAppointment }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-sidebar-border bg-sidebar transition-transform">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-20 items-center border-b border-sidebar-border px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold text-sidebar-foreground">
                Belezza
              </h1>
              <p className="text-xs text-muted-foreground">Estética & Bem-estar</p>
            </div>
          </div>
        </div>

        {/* New Appointment Button */}
        <div className="p-4">
          <Button 
            onClick={onNewAppointment}
            className="w-full gap-2"
            size="lg"
          >
            <Plus className="h-4 w-4" />
            Novo Agendamento
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-2 overflow-y-auto">
          {navigation.map((item) => (
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
              <item.icon className="h-5 w-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
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
      </div>
    </aside>
  );
}

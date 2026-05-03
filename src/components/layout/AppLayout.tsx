import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { NewAppointmentDialog } from '@/components/appointments/NewAppointmentDialog';
import { cn } from '@/lib/utils';
import { useReminderNotifications } from '@/hooks/useReminderNotifications';
import { useLocation } from 'react-router-dom';

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const location = useLocation();

  // Enable reminder and cash register close notifications
  useReminderNotifications();

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Fecha o drawer mobile ao trocar de rota
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar 
        onNewAppointment={() => {
          setIsNewAppointmentOpen(true);
          setIsMobileSidebarOpen(false);
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        mobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />
      <div className={cn(
        "min-h-screen flex flex-col transition-all duration-300 ease-in-out",
        // Mobile: sem padding (sidebar é drawer). Desktop: respeita largura da sidebar.
        "pl-0 md:pl-[72px]",
        !isSidebarCollapsed && "md:pl-64"
      )}>
        <Header 
          title={title} 
          subtitle={subtitle}
          onMenuClick={() => setIsMobileSidebarOpen(true)}
        />
        <main className="flex-1 p-3 sm:p-4 md:p-6 pb-20 md:pb-24 overflow-auto">
          {children}
        </main>
      </div>
      <NewAppointmentDialog 
        open={isNewAppointmentOpen} 
        onOpenChange={setIsNewAppointmentOpen}
      />
    </div>
  );
}

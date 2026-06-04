import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { NewAppointmentDialog } from '@/components/appointments/NewAppointmentDialog';
import { TrialBanner } from '@/components/TrialBanner';
import { cn } from '@/lib/utils';
import { useReminderNotifications } from '@/hooks/useReminderNotifications';
import { useSubscriptionNotifier } from '@/hooks/useSubscriptionNotifier';
import { useSeatThresholdNotifier } from '@/hooks/useSeatThresholdNotifier';
import { useLocation } from 'react-router-dom';
import { hydrateDismissalsFromDb } from '@/lib/notificationDismissal';

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
  useSubscriptionNotifier();
  useSeatThresholdNotifier();

  // Pull saved notification dismissals from the database on app start
  useEffect(() => {
    void hydrateDismissalsFromDb();
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Fecha o drawer mobile ao trocar de rota
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="h-[100dvh] overflow-hidden bg-background">
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
        "h-[100dvh] flex flex-col transition-all duration-300 ease-in-out",
        // Mobile: sem padding (sidebar é drawer). Desktop: respeita largura da sidebar.
        "pl-0 md:pl-[72px]",
        !isSidebarCollapsed && "md:pl-64"
      )}>
        <div className="pt-safe flex-shrink-0">
          <TrialBanner />
          <Header 
            title={title} 
            subtitle={subtitle}
            onMenuClick={() => setIsMobileSidebarOpen(true)}
          />
        </div>
        <main data-testid="app-main-scroll" className="flex-1 min-h-0 p-3 sm:p-4 md:p-6 pb-4 md:pb-6 pb-safe overflow-y-auto overflow-x-hidden">
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

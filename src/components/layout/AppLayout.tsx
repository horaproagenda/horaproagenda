import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { NewAppointmentDialog } from '@/components/appointments/NewAppointmentDialog';
import { TrialBanner } from '@/components/TrialBanner';
import { OnboardingGate } from '@/components/onboarding/OnboardingWizard';
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

  // Recalcula alturas dinâmicas em rotação (iOS Safari nem sempre dispara resize).
  useEffect(() => {
    const onOrient = () => {
      // Força reflow: lê layout depois de um tick para dvh/env() reavaliar.
      requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`);
      });
    };
    onOrient();
    window.addEventListener('orientationchange', onOrient);
    window.addEventListener('resize', onOrient);
    return () => {
      window.removeEventListener('orientationchange', onOrient);
      window.removeEventListener('resize', onOrient);
    };
  }, []);


  return (
    <div
      className="overflow-hidden bg-background"
      style={{ height: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))' }}
    >

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
        "h-full flex flex-col transition-all duration-300 ease-in-out",

        // Mobile: sem padding (sidebar é drawer). Desktop: respeita largura da sidebar.
        "pl-0 md:pl-[72px]",
        !isSidebarCollapsed && "md:pl-64"
      )}>
        <div className="flex-shrink-0">
          <TrialBanner />
          <Header 
            title={title} 
            subtitle={subtitle}
            onMenuClick={() => setIsMobileSidebarOpen(true)}
          />
        </div>
        <main data-testid="app-main-scroll" className="flex-1 min-h-0 px-4 py-3 sm:p-4 md:p-6 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
      <NewAppointmentDialog 
        open={isNewAppointmentOpen} 
        onOpenChange={setIsNewAppointmentOpen}
      />
      <OnboardingGate />
    </div>
  );
}

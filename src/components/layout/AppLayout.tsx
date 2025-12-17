import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { NewAppointmentDialog } from '@/components/appointments/NewAppointmentDialog';
import { cn } from '@/lib/utils';

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

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar 
        onNewAppointment={() => setIsNewAppointmentOpen(true)} 
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <div className={cn(
        "min-h-screen flex flex-col transition-all duration-300 ease-in-out",
        isSidebarCollapsed ? "pl-[72px]" : "pl-64"
      )}>
        <Header title={title} subtitle={subtitle} />
        <main className="flex-1 p-6 pb-24 overflow-auto">
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

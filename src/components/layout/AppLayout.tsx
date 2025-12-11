import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { NewAppointmentDialog } from '@/components/appointments/NewAppointmentDialog';

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar onNewAppointment={() => setIsNewAppointmentOpen(true)} />
      <div className="pl-64 min-h-screen flex flex-col">
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

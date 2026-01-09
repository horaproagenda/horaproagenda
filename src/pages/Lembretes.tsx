import { AppLayout } from '@/components/layout/AppLayout';
import { RemindersPanel } from '@/components/lembretes/RemindersPanel';
import { PageTransition } from '@/components/layout/PageTransition';

export default function Lembretes() {
  return (
    <AppLayout title="Lembretes" subtitle="Gerencie seus lembretes e rotinas">
      <PageTransition>
        <RemindersPanel />
      </PageTransition>
    </AppLayout>
  );
}

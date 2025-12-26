import { AppLayout } from '@/components/layout/AppLayout';
import { RemindersPanel } from '@/components/lembretes/RemindersPanel';

export default function Lembretes() {
  return (
    <AppLayout title="Lembretes" subtitle="Gerencie seus lembretes e rotinas">
      <RemindersPanel />
    </AppLayout>
  );
}

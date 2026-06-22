import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { toast } from 'sonner';
import { Loader2, Sparkles, CheckCircle2 } from 'lucide-react';

const SEGMENTS = [
  { value: 'estetica', label: 'Clínica de estética' },
  { value: 'salao', label: 'Salão de beleza' },
  { value: 'barbearia', label: 'Barbearia' },
  { value: 'podologia', label: 'Podologia' },
  { value: 'fisioterapia', label: 'Fisioterapia / Terapias' },
  { value: 'outro', label: 'Outro' },
];

interface Props {
  open: boolean;
}

export function OnboardingWizard({ open }: Props) {
  const { user, profile } = useAuth();
  const { markCompleted } = useOnboardingStatus();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [clinicName, setClinicName] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [segment, setSegment] = useState('estetica');
  const [profSpecialty, setProfSpecialty] = useState('');

  const handleSkip = async () => {
    setSaving(true);
    try {
      await markCompleted();
      toast.success('Você pode configurar sua conta a qualquer momento em Configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    if (!clinicName.trim()) {
      toast.error('Informe o nome da clínica / negócio.');
      return;
    }
    if (!clinicPhone.trim()) {
      toast.error('Informe o telefone da clínica / negócio.');
      return;
    }

    setSaving(true);
    try {
      // 1) Salva business_settings (upsert simples)
      const { data: existing } = await supabase
        .from('business_settings')
        .select('id')
        .limit(1)
        .maybeSingle();

      const bsPayload: any = {
        clinic_name: clinicName.trim(),
        clinic_phone: clinicPhone.trim(),
      };
      const bsResult = existing?.id
        ? await supabase.from('business_settings').update(bsPayload).eq('id', existing.id)
        : await supabase.from('business_settings').insert(bsPayload);
      if (bsResult.error) {
        toast.error('Erro ao salvar dados da clínica: ' + bsResult.error.message);
        return;
      }

      // 2) Garante que o administrador exista como profissional (1º profissional = quem está cadastrando)
      const { count } = await supabase
        .from('professionals')
        .select('id', { count: 'exact', head: true });

      if ((count ?? 0) === 0) {
        const specialtyValue = profSpecialty.trim();
        const adminName = profile?.full_name || user?.email || 'Profissional';
        const { error: profError } = await supabase.from('professionals').insert({
          name: adminName,
          specialties: specialtyValue ? [specialtyValue] : null,
          is_active: true,
          user_id: user?.id ?? null,
          email: profile?.email ?? user?.email ?? null,
        } as any);
        if (profError) {
          toast.error('Erro ao cadastrar profissional: ' + profError.message);
          return;
        }
      }

      await markCompleted();
      toast.success('Tudo pronto! Vamos para sua agenda.');
      navigate('/agenda');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center">Bem-vindo ao Hora Pro</DialogTitle>
          <DialogDescription className="text-center">
            Preencha os dados básicos da sua clínica para começar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="clinic-name">Nome da clínica / negócio *</Label>
            <Input
              id="clinic-name"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              placeholder="Ex: Studio Bella"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="clinic-phone">Telefone *</Label>
            <Input
              id="clinic-phone"
              value={clinicPhone}
              onChange={(e) => setClinicPhone(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div>
            <Label>Segmento</Label>
            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEGMENTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="prof-spec">Sua especialidade (opcional)</Label>
            <Input
              id="prof-spec"
              value={profSpecialty}
              onChange={(e) => setProfSpecialty(e.target.value)}
              placeholder="Ex: Esteticista, Manicure, Massoterapeuta"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={handleSkip} disabled={saving}>
            Pular por enquanto
          </Button>
          <Button onClick={handleFinish} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Concluir
                <CheckCircle2 className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Wrapper que checa o status e renderiza o wizard quando necessário. */
export function OnboardingGate() {
  const { shouldShow } = useOnboardingStatus();
  if (!shouldShow) return null;
  return <OnboardingWizard open={true} />;
}

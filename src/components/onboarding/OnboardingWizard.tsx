import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { toast } from 'sonner';
import { Loader2, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';

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

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [clinicName, setClinicName] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [segment, setSegment] = useState('estetica');

  // Step 2
  const [profName, setProfName] = useState(profile?.full_name || '');
  const [profSpecialty, setProfSpecialty] = useState('');

  // Step 3
  const [serviceName, setServiceName] = useState('');
  const [serviceDuration, setServiceDuration] = useState('60');
  const [servicePrice, setServicePrice] = useState('');

  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  const handleSkip = async () => {
    setSaving(true);
    try {
      await markCompleted();
      toast.success('Você pode configurar sua conta a qualquer momento em Configurações.');
    } finally {
      setSaving(false);
    }
  };

  const saveStep1 = async () => {
    if (!clinicName.trim()) {
      toast.error('Informe o nome da clínica/negócio.');
      return false;
    }
    const { data: existing } = await supabase
      .from('business_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    const payload: any = {
      clinic_name: clinicName.trim(),
      clinic_phone: clinicPhone.trim() || null,
    };
    if (existing?.id) {
      const { error } = await supabase.from('business_settings').update(payload).eq('id', existing.id);
      if (error) {
        toast.error('Erro ao salvar: ' + error.message);
        return false;
      }
    } else {
      const { error } = await supabase.from('business_settings').insert(payload);
      if (error) {
        toast.error('Erro ao salvar: ' + error.message);
        return false;
      }
    }
    return true;
  };

  const saveStep2 = async () => {
    if (!profName.trim()) {
      toast.error('Informe o nome do profissional.');
      return false;
    }
    // Verifica se já existe profissional pra evitar duplicidade
    const { count } = await supabase
      .from('professionals')
      .select('id', { count: 'exact', head: true });
    if ((count ?? 0) > 0) return true;

    const { error } = await supabase.from('professionals').insert({
      name: profName.trim(),
      specialty: profSpecialty.trim() || null,
      is_active: true,
      user_id: user?.id ?? null,
    } as any);
    if (error) {
      toast.error('Erro ao cadastrar profissional: ' + error.message);
      return false;
    }
    return true;
  };

  const saveStep3 = async () => {
    if (!serviceName.trim()) {
      toast.error('Informe o nome do serviço.');
      return false;
    }
    const duration = Number(serviceDuration) || 60;
    const price = Number(servicePrice.replace(',', '.')) || 0;

    const { error } = await supabase.from('services').insert({
      name: serviceName.trim(),
      duration_minutes: duration,
      price,
      is_active: true,
    } as any);
    if (error) {
      toast.error('Erro ao cadastrar serviço: ' + error.message);
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    setSaving(true);
    try {
      let ok = false;
      if (step === 1) ok = await saveStep1();
      else if (step === 2) ok = await saveStep2();
      else if (step === 3) {
        ok = await saveStep3();
        if (ok) {
          await markCompleted();
          toast.success('Tudo pronto! Vamos para sua agenda.');
          navigate('/agenda');
          return;
        }
      }
      if (ok && step < totalSteps) setStep(step + 1);
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
            Em 3 passos rápidos sua agenda fica pronta para uso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Progress value={progress} className="h-1.5" />
          <p className="text-right text-[11px] text-muted-foreground">Passo {step} de {totalSteps}</p>
        </div>

        {step === 1 && (
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
              <Label htmlFor="clinic-phone">Telefone (opcional)</Label>
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
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cadastre o primeiro profissional. Você pode adicionar mais depois em Cadastros.
            </p>
            <div>
              <Label htmlFor="prof-name">Nome do profissional *</Label>
              <Input
                id="prof-name"
                value={profName}
                onChange={(e) => setProfName(e.target.value)}
                placeholder="Seu nome ou da pessoa"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="prof-spec">Especialidade (opcional)</Label>
              <Input
                id="prof-spec"
                value={profSpecialty}
                onChange={(e) => setProfSpecialty(e.target.value)}
                placeholder="Ex: Esteticista, Manicure, Massoterapeuta"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cadastre seu primeiro serviço. Mais adiante você pode criar pacotes e vínculos.
            </p>
            <div>
              <Label htmlFor="svc-name">Nome do serviço *</Label>
              <Input
                id="svc-name"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="Ex: Limpeza de pele"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="svc-dur">Duração (min)</Label>
                <Input
                  id="svc-dur"
                  type="number"
                  min={5}
                  step={5}
                  value={serviceDuration}
                  onChange={(e) => setServiceDuration(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="svc-price">Preço (R$)</Label>
                <Input
                  id="svc-price"
                  inputMode="decimal"
                  value={servicePrice}
                  onChange={(e) => setServicePrice(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={handleSkip} disabled={saving}>
            Pular por enquanto
          </Button>
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={saving}>
                Voltar
              </Button>
            )}
            <Button onClick={handleNext} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : step === totalSteps ? (
                <>
                  Concluir
                  <CheckCircle2 className="h-4 w-4" />
                </>
              ) : (
                <>
                  Próximo
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
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

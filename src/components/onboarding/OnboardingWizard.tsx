import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { toast } from 'sonner';
import { Loader2, Sparkles, CheckCircle2 } from 'lucide-react';

interface Props {
  open: boolean;
}

// Cores sugeridas para identificação na agenda
const AGENDA_COLORS = [
  '#7C3AED', '#2563EB', '#0EA5E9', '#10B981',
  '#F59E0B', '#EF4444', '#EC4899', '#6366F1',
];

function formatCpfMask(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function formatPhoneMask(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

export function OnboardingWizard({ open }: Props) {
  const { user, profile } = useAuth();
  const { markCompleted } = useOnboardingStatus();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [professionalId, setProfessionalId] = useState<string | null>(null);

  // Campos pré-preenchidos a partir do cadastro
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [agendaColor, setAgendaColor] = useState(AGENDA_COLORS[0]);
  const [specialty, setSpecialty] = useState('');
  const [isCommission, setIsCommission] = useState(false);
  const [commissionPct, setCommissionPct] = useState<string>('');

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('professionals')
          .select('id, name, cpf, birthdate, phone, agenda_color, specialties, is_commission_based, commission_percentage')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;

        const fallbackName = profile?.full_name || user.email?.split('@')[0] || '';
        const fallbackPhone = profile?.phone || '';

        setProfessionalId((data as any)?.id ?? null);
        setName(((data as any)?.name as string) || fallbackName);
        setCpf(formatCpfMask(((data as any)?.cpf as string) || ''));
        setBirthdate(((data as any)?.birthdate as string) || '');
        setWhatsapp(formatPhoneMask(((data as any)?.phone as string) || fallbackPhone));
        setAgendaColor(((data as any)?.agenda_color as string) || AGENDA_COLORS[0]);
        const specs = ((data as any)?.specialties as string[]) || [];
        setSpecialty(specs[0] || '');
        setIsCommission(Boolean((data as any)?.is_commission_based));
        const pct = (data as any)?.commission_percentage;
        setCommissionPct(pct != null ? String(pct) : '');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, profile]);

  const handleSkip = async () => {
    setSaving(true);
    try {
      await markCompleted();
      toast.success('Sem problemas! Você pode completar seu cadastro em Profissionais a qualquer momento.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    if (!name.trim()) {
      toast.error('Informe o nome do profissional.');
      return;
    }
    setSaving(true);
    try {
      const cpfDigits = cpf.replace(/\D/g, '') || null;
      const phoneDigits = whatsapp.replace(/\D/g, '') || null;
      const pctNum = commissionPct.trim() ? Number(commissionPct.replace(',', '.')) : null;

      const payload: any = {
        name: name.trim(),
        cpf: cpfDigits,
        birthdate: birthdate || null,
        phone: phoneDigits,
        agenda_color: agendaColor,
        specialties: specialty.trim() ? [specialty.trim()] : null,
        is_commission_based: isCommission,
        commission_percentage: isCommission ? (pctNum ?? null) : null,
      };

      if (professionalId) {
        const { error } = await supabase
          .from('professionals')
          .update(payload)
          .eq('id', professionalId);
        if (error) {
          toast.error('Erro ao salvar profissional: ' + error.message);
          return;
        }
      } else {
        const { error } = await supabase.from('professionals').insert({
          ...payload,
          email: profile?.email ?? user?.email ?? null,
          user_id: user?.id ?? null,
          is_active: true,
        } as any);
        if (error) {
          toast.error('Erro ao cadastrar profissional: ' + error.message);
          return;
        }
      }

      await markCompleted();
      toast.success('Cadastro concluído! Bem-vindo ao Hora Pro.');
      navigate('/agenda');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center">Bem-vindo ao Hora Pro</DialogTitle>
          <DialogDescription className="text-center">
            Confirme os dados do seu cadastro como profissional administrador.
            Para alterar e-mail ou senha, use Configurações (com verificação por código).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="ob-name">Nome *</Label>
              <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ob-cpf">CPF</Label>
                <Input
                  id="ob-cpf"
                  value={cpf}
                  onChange={(e) => setCpf(formatCpfMask(e.target.value))}
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <Label htmlFor="ob-birth">Data de nascimento</Label>
                <Input
                  id="ob-birth"
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="ob-wpp">WhatsApp</Label>
              <Input
                id="ob-wpp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(formatPhoneMask(e.target.value))}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div>
              <Label>Cor na agenda</Label>
              <div className="flex flex-wrap gap-2 pt-1">
                {AGENDA_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAgendaColor(c)}
                    className={`h-8 w-8 rounded-full border-2 transition ${
                      agendaColor === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
                <input
                  type="color"
                  value={agendaColor}
                  onChange={(e) => setAgendaColor(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border bg-transparent p-0"
                  aria-label="Cor personalizada"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="ob-spec">Especialidade</Label>
              <Input
                id="ob-spec"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="Ex: Esteticista, Cabeleireira, Fisioterapeuta"
              />
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm">Recebe por comissão</Label>
                  <p className="text-xs text-muted-foreground">
                    Ative se este profissional ganha % por atendimento.
                  </p>
                </div>
                <Switch checked={isCommission} onCheckedChange={setIsCommission} />
              </div>
              {isCommission && (
                <div>
                  <Label htmlFor="ob-pct" className="text-xs">Percentual de comissão (%)</Label>
                  <Input
                    id="ob-pct"
                    inputMode="decimal"
                    value={commissionPct}
                    onChange={(e) => setCommissionPct(e.target.value)}
                    placeholder="Ex: 40"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={handleSkip} disabled={saving || loading}>
            Pular por enquanto
          </Button>
          <Button onClick={handleFinish} disabled={saving || loading} className="gap-2">
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

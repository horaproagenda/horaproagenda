import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { toast } from 'sonner';
import { Loader2, Sparkles, CheckCircle2, ShieldCheck } from 'lucide-react';

interface Props {
  open: boolean;
}

const TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília / São Paulo (UTC-3)' },
  { value: 'America/Manaus', label: 'Manaus (UTC-4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (UTC-5)' },
  { value: 'America/Belem', label: 'Belém (UTC-3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (UTC-3)' },
  { value: 'America/Bahia', label: 'Salvador (UTC-3)' },
];

const CURRENCIES = [
  { value: 'BRL', label: 'Real brasileiro (R$)' },
  { value: 'USD', label: 'Dólar americano (US$)' },
  { value: 'EUR', label: 'Euro (€)' },
];

function formatPhoneMask(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

export function OnboardingWizard({ open }: Props) {
  const { user, profile } = useAuth();
  const { markCompleted } = useOnboardingStatus();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Identidade herdada da conta autenticada (somente leitura)
  const adminName = profile?.full_name || user?.email?.split('@')[0] || '';
  const adminEmail = profile?.email || user?.email || '';

  // Dados que ainda faltam: configurações da clínica
  const [clinicName, setClinicName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [unitName, setUnitName] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicStreet, setClinicStreet] = useState('');
  const [clinicNumber, setClinicNumber] = useState('');
  const [clinicCity, setClinicCity] = useState('');
  const [clinicState, setClinicState] = useState('');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [currency, setCurrency] = useState('BRL');

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Reconhece o usuário autenticado como Administrador principal (validado no backend)
        const { data: setupData, error: setupError } = await supabase.rpc('ensure_primary_admin_setup');
        if (setupError) {
          console.warn('ensure_primary_admin_setup:', setupError.message);
        }
        if (cancelled) return;
        const setup: any = setupData || {};
        setIsPrimaryAdmin(Boolean(setup?.is_primary_admin));

        const { data: settings } = await supabase
          .from('business_settings')
          .select(
            'id, clinic_name, clinic_logo_url, clinic_phone, clinic_street, clinic_number, clinic_city, clinic_state, timezone, currency, professional_name'
          )
          .limit(1)
          .maybeSingle();
        if (cancelled) return;

        const s: any = settings || {};
        setSettingsId(s.id ?? setup?.settings_id ?? null);
        setClinicName(s.clinic_name || '');
        setLogoUrl(s.clinic_logo_url || '');
        setUnitName(s.professional_name || '');
        setClinicPhone(formatPhoneMask(s.clinic_phone || ''));
        setClinicStreet(s.clinic_street || '');
        setClinicNumber(s.clinic_number || '');
        setClinicCity(s.clinic_city || '');
        setClinicState(s.clinic_state || '');
        setTimezone(s.timezone || 'America/Sao_Paulo');
        setCurrency(s.currency || 'BRL');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const handleSkip = async () => {
    setSaving(true);
    try {
      await markCompleted();
      toast.success('Sem problemas! Você pode ajustar as configurações da clínica a qualquer momento.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    if (!clinicName.trim()) {
      toast.error('Informe o nome da clínica.');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        clinic_name: clinicName.trim(),
        clinic_logo_url: logoUrl.trim() || null,
        professional_name: unitName.trim() || clinicName.trim(),
        clinic_phone: clinicPhone.replace(/\D/g, '') || null,
        clinic_street: clinicStreet.trim() || null,
        clinic_number: clinicNumber.trim() || null,
        clinic_city: clinicCity.trim() || null,
        clinic_state: clinicState.trim() || null,
        timezone,
        currency,
      };

      if (settingsId) {
        const { error } = await supabase.from('business_settings').update(payload).eq('id', settingsId);
        if (error) {
          toast.error('Não foi possível salvar as configurações da clínica.');
          return;
        }
      } else {
        const { error } = await supabase.from('business_settings').insert(payload);
        if (error) {
          toast.error('Não foi possível salvar as configurações da clínica.');
          return;
        }
      }

      await markCompleted();
      toast.success('Configuração inicial concluída! Bem-vindo ao Hora Pro.');
      setShowSuccess(true);
    } finally {
      setSaving(false);
    }
  };

  if (showSuccess) {
    return (
      <Dialog open={open}>
        <DialogContent
          className="max-w-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">Clínica configurada!</DialogTitle>
            <DialogDescription className="text-center space-y-3 pt-2">
              <span className="block">
                Sua clínica está configurada e sua conta já é a do{' '}
                <strong>Administrador principal</strong>, com acesso total.
              </span>
              <span className="block">
                Agora você pode cadastrar os demais profissionais na página{' '}
                <strong>Profissionais</strong>, definindo perfil, unidade, permissões e nível de
                visualização de cada um.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-2">
            <Button onClick={() => navigate('/agenda')} className="gap-2">
              Ir para a agenda
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
          <DialogTitle className="text-center">Configuração inicial da clínica</DialogTitle>
          <DialogDescription className="text-center">
            Só precisamos dos dados da clínica. Seus dados pessoais já foram herdados do seu
            cadastro.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                Você está configurando sua clínica com a conta do{' '}
                {isPrimaryAdmin ? 'Administrador principal' : 'usuário administrador'}:{' '}
                <strong className="text-foreground">{adminName}</strong> ({adminEmail}). Nome, e-mail
                e senha não são solicitados novamente.
              </p>
            </div>

            <div>
              <Label htmlFor="ob-clinic">Nome da clínica *</Label>
              <Input
                id="ob-clinic"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder="Ex: Studio Bella Estética"
              />
            </div>

            <div>
              <Label htmlFor="ob-logo">Logo da clínica (URL, opcional)</Label>
              <Input
                id="ob-logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div>
              <Label htmlFor="ob-unit">Primeira unidade</Label>
              <Input
                id="ob-unit"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="Ex: Unidade Centro"
              />
            </div>

            <div>
              <Label htmlFor="ob-phone">Telefone comercial (opcional)</Label>
              <Input
                id="ob-phone"
                value={clinicPhone}
                onChange={(e) => setClinicPhone(formatPhoneMask(e.target.value))}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label htmlFor="ob-street">Endereço da unidade (opcional)</Label>
                <Input
                  id="ob-street"
                  value={clinicStreet}
                  onChange={(e) => setClinicStreet(e.target.value)}
                  placeholder="Rua / Avenida"
                />
              </div>
              <div>
                <Label htmlFor="ob-number">Número</Label>
                <Input
                  id="ob-number"
                  value={clinicNumber}
                  onChange={(e) => setClinicNumber(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label htmlFor="ob-city">Cidade</Label>
                <Input
                  id="ob-city"
                  value={clinicCity}
                  onChange={(e) => setClinicCity(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ob-state">UF</Label>
                <Input
                  id="ob-state"
                  value={clinicState}
                  maxLength={2}
                  onChange={(e) => setClinicState(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fuso horário</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Moeda</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Depois de concluir, cadastre os demais profissionais em <strong>Profissionais</strong>.
            </p>
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

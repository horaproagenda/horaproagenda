import { useState, useEffect } from 'react';
import { Building2, Check, Trash2, Mail, Phone, ShieldCheck, Loader2, Pencil, X } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/layout/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useAppearanceSettings, PRIMARY_COLOR_PALETTE } from '@/hooks/useAppearanceSettings';
import { useContactChangeVerification, type ContactChangeType } from '@/hooks/useContactChangeVerification';
import { AddressFieldsCep, emptyAddress, type AddressFields } from '@/components/forms/AddressFieldsCep';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ESTABLISHMENT_TYPES } from '@/lib/establishmentType';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import { WhatsappTemplatesSettings } from '@/components/settings/WhatsappTemplatesSettings';
import { WhatsappSettings } from '@/components/settings/WhatsappSettings';
import { BulkDeleteDialog } from '@/components/settings/BulkDeleteDialog';
import { DeleteMyAccountDialog } from '@/components/settings/DeleteMyAccountDialog';
import { ChangeMyPasswordCard } from '@/components/auth/ChangeMyPasswordCard';
import { MinhasPreferenciasSettings } from '@/components/settings/MinhasPreferenciasSettings';

import { useAuth } from '@/contexts/AuthContext';

/**
 * Configurações da conta.
 * Horário de funcionamento, automações e opções da agenda vivem em
 * `MinhasPreferenciasSettings` (override por profissional).
 */
const Configuracoes = () => {
  const { hasRole, user, profile } = useAuth();
  const isAdmin = hasRole('admin');
  const { settings, updateSettings } = useBusinessSettings();
  const { settings: appearance, updateSettings: updateAppearance } = useAppearanceSettings();

  // Clinic info
  const [professionalName, setProfessionalName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicEmail, setClinicEmail] = useState('');
  const [address, setAddress] = useState<AddressFields>(emptyAddress);
  const [businessType, setBusinessType] = useState<string>('clinica');
  const [businessTypeLabel, setBusinessTypeLabel] = useState('');

  // E-mail / celular de login (com verificação)
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPhone, setAccountPhone] = useState('');

  // Dialog de troca
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeType, setChangeType] = useState<ContactChangeType>('email');
  const [changeNewValue, setChangeNewValue] = useState('');
  const [changeCode, setChangeCode] = useState('');
  const [changeStep, setChangeStep] = useState<'input' | 'code'>('input');
  const { sendCode, verifyCode, sending, verifying } = useContactChangeVerification();

  const [clinicInitialized, setClinicInitialized] = useState(false);
  const [isEditingClinic, setIsEditingClinic] = useState(false);

  // Inicializa UMA VEZ ao carregar as configurações. Refetches em background
  // (realtime, cross-device, invalidações de queries) não devem descartar
  // edições em andamento. Após salvar, os campos já refletem o que o usuário
  // digitou — não há necessidade de re-sincronizar.
  useEffect(() => {
    if (settings && !clinicInitialized) {
      const s = settings as any;
      setProfessionalName(s.professional_name || profile?.full_name || '');
      setClinicName(s.clinic_name || '');
      setClinicPhone(s.clinic_phone || '');
      setClinicEmail(s.clinic_email || '');
      setAddress({
        cep: s.clinic_cep || '',
        street: s.clinic_street || '',
        number: s.clinic_number || '',
        complement: s.clinic_complement || '',
        neighborhood: s.clinic_neighborhood || '',
        city: s.clinic_city || '',
        state: s.clinic_state || '',
      });
      setBusinessType(s.business_type || 'clinica');
      setBusinessTypeLabel(s.business_type_label || '');
      setClinicInitialized(true);
    }
  }, [settings, profile?.full_name, clinicInitialized]);

  useEffect(() => {
    setAccountEmail(user?.email || '');
    setAccountPhone((profile as any)?.phone || '');
  }, [user?.email, profile]);

  const handleSaveClinic = async () => {
    try {
      await updateSettings.mutateAsync({
        clinic_name: clinicName,
        clinic_phone: clinicPhone,
        clinic_email: clinicEmail,
        professional_name: professionalName,
        clinic_cep: address.cep,
        clinic_street: address.street,
        clinic_number: address.number,
        clinic_complement: address.complement,
        clinic_neighborhood: address.neighborhood,
        clinic_city: address.city,
        clinic_state: address.state,
        business_type: businessType,
        business_type_label: businessType === 'outro' ? businessTypeLabel : null,
      } as any);

      if (professionalName && user?.id && professionalName !== profile?.full_name) {
        const { error } = await supabase
          .from('profiles')
          .update({ full_name: professionalName })
          .eq('id', user.id);
        if (error) throw error;
      }

      toast.success('Informações da clínica salvas com sucesso!');
      setIsEditingClinic(false);
    } catch (err: any) {
      if (err?.message && !String(err.message).toLowerCase().includes('configurações')) {
        toast.error('Erro ao atualizar nome do profissional: ' + err.message);
      }
    }
  };

  const handleCancelEditClinic = () => {
    // Restaura valores originais do settings
    if (settings) {
      const s = settings as any;
      setProfessionalName(s.professional_name || profile?.full_name || '');
      setClinicName(s.clinic_name || '');
      setClinicPhone(s.clinic_phone || '');
      setClinicEmail(s.clinic_email || '');
      setAddress({
        cep: s.clinic_cep || '',
        street: s.clinic_street || '',
        number: s.clinic_number || '',
        complement: s.clinic_complement || '',
        neighborhood: s.clinic_neighborhood || '',
        city: s.clinic_city || '',
        state: s.clinic_state || '',
      });
      setBusinessType(s.business_type || 'clinica');
      setBusinessTypeLabel(s.business_type_label || '');
    }
    setIsEditingClinic(false);
  };

  const openChange = (type: ContactChangeType) => {
    setChangeType(type);
    setChangeNewValue('');
    setChangeCode('');
    setChangeStep('input');
    setChangeOpen(true);
  };

  const handleSendChange = async () => {
    if (!changeNewValue.trim()) {
      toast.error('Informe o novo valor.');
      return;
    }
    const ok = await sendCode(changeType, changeNewValue.trim());
    if (ok) setChangeStep('code');
  };

  const handleVerifyChange = async () => {
    if (changeCode.length !== 6) {
      toast.error('Digite os 6 dígitos.');
      return;
    }
    const ok = await verifyCode(changeType, changeNewValue.trim(), changeCode);
    if (ok) {
      setChangeOpen(false);
      // Atualiza estado local imediatamente
      if (changeType === 'email') setAccountEmail(changeNewValue.trim().toLowerCase());
      else setAccountPhone(changeNewValue.trim());
    }
  };

  return (
    <AppLayout title="Configurações" subtitle="Personalize seu sistema">
      <PageTransition>
        <div className="mx-auto w-full max-w-4xl space-y-4 text-xs settings-page">
          <MinhasPreferenciasSettings />

          {/* Informações da Clínica */}
          {isAdmin && (
            <Card className="card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-medium">Informações da Clínica</CardTitle>
                      <CardDescription className="text-xs">
                        {isEditingClinic
                          ? 'Atualize os dados e clique em "Salvar informações".'
                          : 'Clique em "Editar" para atualizar os dados da clínica.'}
                      </CardDescription>
                    </div>
                  </div>
                  {!isEditingClinic && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 shrink-0"
                      onClick={() => setIsEditingClinic(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome do profissional</Label>
                  <Input
                    className="h-8 text-sm"
                    value={professionalName}
                    onChange={(e) => setProfessionalName(e.target.value)}
                    placeholder="Seu nome completo"
                    disabled={!isEditingClinic}
                    readOnly={!isEditingClinic}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome da clínica</Label>
                  <Input
                    className="h-8 text-sm"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="Nome do estabelecimento"
                    disabled={!isEditingClinic}
                    readOnly={!isEditingClinic}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Área de atuação</Label>
                  <Select value={businessType} onValueChange={setBusinessType} disabled={!isEditingClinic}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Selecione a área" />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTABLISHMENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Define como o app se refere ao seu negócio (clínica, salão, consultório...).
                  </p>
                  {businessType === 'outro' && (
                    <Input
                      className="h-8 text-sm mt-2"
                      placeholder="Informe sua área (ex: tatuagem, acupuntura...)"
                      value={businessTypeLabel}
                      onChange={(e) => setBusinessTypeLabel(e.target.value)}
                      disabled={!isEditingClinic}
                      readOnly={!isEditingClinic}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefone da clínica</Label>
                    <Input
                      className="h-8 text-sm"
                      value={clinicPhone}
                      onChange={(e) => setClinicPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      disabled={!isEditingClinic}
                      readOnly={!isEditingClinic}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">E-mail da clínica</Label>
                    <Input
                      className="h-8 text-sm"
                      type="email"
                      value={clinicEmail}
                      onChange={(e) => setClinicEmail(e.target.value)}
                      placeholder="contato@clinica.com"
                      disabled={!isEditingClinic}
                      readOnly={!isEditingClinic}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <Label className="text-xs mb-2 block font-medium">Endereço</Label>
                  <fieldset disabled={!isEditingClinic} className={!isEditingClinic ? 'opacity-90 pointer-events-none' : ''}>
                    <AddressFieldsCep value={address} onChange={setAddress} compact />
                  </fieldset>
                </div>

                {isEditingClinic && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1"
                      onClick={handleCancelEditClinic}
                      disabled={updateSettings.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 btn-vibrant gap-1"
                      onClick={handleSaveClinic}
                      disabled={updateSettings.isPending}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {updateSettings.isPending ? 'Salvando...' : 'Salvar informações'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* E-mail e celular de acesso (verificação obrigatória) */}
          <Card className="card-hover">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-medium">E-mail e celular de acesso</CardTitle>
                  <CardDescription className="text-xs">
                    Para alterar, enviamos um código de 6 dígitos para o seu e-mail atual
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Mail className="h-3 w-3" /> E-mail
                  </Label>
                  <Input className="h-8 text-sm" value={accountEmail} readOnly />
                </div>
                <Button size="sm" variant="outline" onClick={() => openChange('email')}>
                  Alterar
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Celular
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    value={accountPhone}
                    readOnly
                    placeholder="Não cadastrado"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => openChange('phone')}>
                  Alterar
                </Button>
              </div>
            </CardContent>
          </Card>

          <WhatsappSettings />
          <WhatsappTemplatesSettings />

          {/* Aparência da interface removida — a paleta do app é padronizada (Petróleo + Âmbar).
              A cor do agendamento por profissional continua configurável na aba do profissional. */}


          {isAdmin && <BulkDeleteDialog />}

          <Card className="card-hover border-destructive/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-destructive/10 p-2">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-sm font-medium">Sua Conta</CardTitle>
                  <CardDescription className="text-xs">
                    Excluir permanentemente seu cadastro e todos os dados associados
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Ao excluir sua conta, todos os clientes, agendamentos, pacotes, registros financeiros e
                configurações serão apagados de forma <strong>irreversível</strong>.
              </p>
              <div className="flex justify-end">
                <DeleteMyAccountDialog />
              </div>
            </CardContent>
          </Card>

          <ChangeMyPasswordCard />
        </div>

        {/* Dialog de alteração de e-mail / celular */}
        <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                Alterar {changeType === 'email' ? 'e-mail' : 'celular'}
              </DialogTitle>
              <DialogDescription>
                Por segurança, enviaremos um código de 6 dígitos para o seu e-mail atual
                ({accountEmail}).
              </DialogDescription>
            </DialogHeader>

            {changeStep === 'input' ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Novo {changeType === 'email' ? 'e-mail' : 'celular'}
                  </Label>
                  <Input
                    autoFocus
                    type={changeType === 'email' ? 'email' : 'tel'}
                    placeholder={changeType === 'email' ? 'novo@email.com' : '(11) 99999-9999'}
                    value={changeNewValue}
                    onChange={(e) => setChangeNewValue(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setChangeOpen(false)} disabled={sending}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSendChange} disabled={sending}>
                    {sending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Enviar código
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Digite o código de 6 dígitos enviado para <strong>{accountEmail}</strong>.
                </p>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={changeCode} onChange={setChangeCode}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
                      <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                  <Button variant="ghost" onClick={() => setChangeStep('input')} disabled={verifying}>
                    Voltar
                  </Button>
                  <Button
                    onClick={handleVerifyChange}
                    disabled={verifying || changeCode.length !== 6}
                  >
                    {verifying && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Confirmar alteração
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </PageTransition>
    </AppLayout>
  );
};

export default Configuracoes;

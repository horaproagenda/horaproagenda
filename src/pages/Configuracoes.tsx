import { useState, useEffect } from 'react';
import { Building2, Palette, Check, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/layout/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useAppearanceSettings, PRIMARY_COLOR_PALETTE } from '@/hooks/useAppearanceSettings';
import { toast } from 'sonner';

import { WhatsappTemplatesSettings } from '@/components/settings/WhatsappTemplatesSettings';
import { WhatsappSettings } from '@/components/settings/WhatsappSettings';
import { BulkDeleteDialog } from '@/components/settings/BulkDeleteDialog';
import { DeleteMyAccountDialog } from '@/components/settings/DeleteMyAccountDialog';
import { ChangeMyPasswordCard } from '@/components/auth/ChangeMyPasswordCard';
import { MinhasPreferenciasSettings } from '@/components/settings/MinhasPreferenciasSettings';

import { useAuth } from '@/contexts/AuthContext';

/**
 * Configurações da conta.
 * Horário de funcionamento, automações e opções da agenda (drag-and-drop,
 * auto-complete) vivem APENAS em `MinhasPreferenciasSettings`, que aplica
 * override por profissional sobre o padrão global. Não duplicar essas seções
 * aqui — os helpers de overlay (`get_effective_business_settings`) já garantem
 * que cada profissional veja seus próprios horários/automações.
 */
const Configuracoes = () => {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const { settings, updateSettings } = useBusinessSettings();
  const { settings: appearance, updateSettings: updateAppearance } = useAppearanceSettings();

  // Clinic info (admin only — único bloco global restante)
  const [clinicName, setClinicName] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicEmail, setClinicEmail] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicEditing, setClinicEditing] = useState(false);

  const clinicSaved = !!((settings as any)?.clinic_name);
  const clinicLocked = clinicSaved && !clinicEditing;
  const savedInputClass =
    'h-8 text-sm border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium';

  useEffect(() => {
    if (settings) {
      setClinicName((settings as any).clinic_name || '');
      setClinicPhone((settings as any).clinic_phone || '');
      setClinicEmail((settings as any).clinic_email || '');
      setClinicAddress((settings as any).clinic_address || '');
    }
  }, [settings]);

  const handleSaveClinic = () => {
    if (clinicLocked) {
      setClinicEditing(true);
      return;
    }
    updateSettings.mutate(
      {
        clinic_name: clinicName,
        clinic_phone: clinicPhone,
        clinic_email: clinicEmail,
        clinic_address: clinicAddress,
      } as any,
      { onSuccess: () => setClinicEditing(false) }
    );
  };

  return (
    <AppLayout title="Configurações" subtitle="Personalize seu sistema">
      <PageTransition>
        <div className="mx-auto w-full max-w-4xl space-y-4 text-xs settings-page">
          {/* Preferências do profissional (horários, agenda, automações) */}
          <MinhasPreferenciasSettings />

          {/* Informações da Clínica (somente admin) */}
          {isAdmin && (
            <Card className="card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium">Informações da Clínica</CardTitle>
                    <CardDescription className="text-xs">Dados básicos do estabelecimento</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome da Clínica</Label>
                  <Input
                    className={clinicLocked ? savedInputClass : 'h-8 text-sm'}
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="Nome do estabelecimento"
                    readOnly={clinicLocked}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefone</Label>
                    <Input
                      className={clinicLocked ? savedInputClass : 'h-8 text-sm'}
                      value={clinicPhone}
                      onChange={(e) => setClinicPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      readOnly={clinicLocked}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input
                      className={clinicLocked ? savedInputClass : 'h-8 text-sm'}
                      type="email"
                      value={clinicEmail}
                      onChange={(e) => setClinicEmail(e.target.value)}
                      placeholder="contato@clinica.com"
                      readOnly={clinicLocked}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Endereço</Label>
                  <Input
                    className={clinicLocked ? savedInputClass : 'h-8 text-sm'}
                    value={clinicAddress}
                    onChange={(e) => setClinicAddress(e.target.value)}
                    placeholder="Rua, número - Cidade, UF"
                    readOnly={clinicLocked}
                  />
                </div>
                <Button
                  size="sm"
                  variant={clinicLocked ? 'outline' : 'default'}
                  className={clinicLocked ? 'w-full' : 'w-full btn-vibrant'}
                  onClick={handleSaveClinic}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending
                    ? 'Salvando...'
                    : clinicLocked
                    ? 'Editar Informações'
                    : clinicSaved
                    ? 'Salvar Alterações'
                    : 'Salvar Informações'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Conexão com o WhatsApp (cada profissional conecta o próprio número) */}
          <WhatsappSettings />

          {/* Mensagens de WhatsApp */}
          <WhatsappTemplatesSettings />

          {/* Aparência (preferência por usuário) */}
          <Card className="card-hover">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Palette className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-medium">Aparência</CardTitle>
                  <CardDescription className="text-xs">Personalize a interface</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Cor Principal</Label>
                <p className="text-[10px] text-muted-foreground">
                  Escolha a cor que será aplicada em toda a agenda. A escolha é salva apenas para você.
                </p>
                <div className="grid grid-cols-8 gap-2 pt-1">
                  {PRIMARY_COLOR_PALETTE.map((color) => {
                    const selected = appearance.primaryColor === color.hsl;
                    return (
                      <button
                        key={color.hsl}
                        type="button"
                        title={color.name}
                        aria-label={color.name}
                        onClick={() => {
                          updateAppearance({ primaryColor: color.hsl });
                          toast.success(`Cor principal: ${color.name}`);
                        }}
                        className={`relative h-7 w-7 rounded-full border-2 transition-all hover:scale-110 ${
                          selected ? 'border-foreground ring-2 ring-foreground/30' : 'border-border'
                        }`}
                        style={{ backgroundColor: color.hex }}
                      >
                        {selected && (
                          <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow" strokeWidth={3} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-t pt-3">
                <div>
                  <Label className="text-xs">Modo escuro</Label>
                  <p className="text-[10px] text-muted-foreground">Tema dark</p>
                </div>
                <Switch
                  checked={appearance.darkMode}
                  onCheckedChange={(checked) => {
                    updateAppearance({ darkMode: checked });
                    toast.success(checked ? 'Modo escuro ativado' : 'Modo claro ativado');
                  }}
                />
              </div>
              <div className="flex items-center justify-between py-1">
                <div>
                  <Label className="text-xs">Animações</Label>
                  <p className="text-[10px] text-muted-foreground">Efeitos visuais e transições</p>
                </div>
                <Switch
                  checked={appearance.animations}
                  onCheckedChange={(checked) => {
                    updateAppearance({ animations: checked });
                    toast.success(checked ? 'Animações ativadas' : 'Animações desativadas');
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Integridade Financeiro × Agenda agora roda automaticamente em background (useSaleFlowIntegrityAutoCheck) */}

          {/* Bulk Delete (apenas administradores) */}
          {isAdmin && <BulkDeleteDialog />}

          {/* Sua Conta - Exclusão definitiva */}
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
                configurações serão apagados de forma <strong>irreversível</strong>. Por questões de
                segurança, o e-mail, CPF, CNPJ e telefone usados ficarão bloqueados para reutilização
                do <strong>período gratuito de 7 dias</strong> por <strong>6 meses</strong> após a
                exclusão — para voltar antes desse prazo será necessário contratar um plano pago.
              </p>
              <div className="flex justify-end">
                <DeleteMyAccountDialog />
              </div>
            </CardContent>
          </Card>

          <ChangeMyPasswordCard />
        </div>
      </PageTransition>
    </AppLayout>
  );
};

export default Configuracoes;

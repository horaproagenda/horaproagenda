import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search } from 'lucide-react';
import { fetchAddressByCep, formatCep } from '@/lib/viacep';
import { toast } from 'sonner';

export interface AddressFields {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

export const emptyAddress: AddressFields = {
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
};

interface Props {
  value: AddressFields;
  onChange: (next: AddressFields) => void;
  required?: boolean;
  compact?: boolean;
  disabled?: boolean;
}

/**
 * Reusable address block with automatic CEP lookup via ViaCEP.
 * Used in signup, onboarding, configurações and professional registration.
 */
export function AddressFieldsCep({ value, onChange, required, compact, disabled }: Props) {
  const [searching, setSearching] = useState(false);

  const update = (patch: Partial<AddressFields>) => onChange({ ...value, ...patch });

  const lookup = async (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setSearching(true);
    try {
      const result = await fetchAddressByCep(digits);
      if (!result) {
        toast.error('CEP não encontrado. Preencha o endereço manualmente.');
        return;
      }
      update({
        street: result.logradouro || value.street,
        neighborhood: result.bairro || value.neighborhood,
        city: result.localidade || value.city,
        state: (result.uf || value.state).toUpperCase(),
      });
      // Foca o campo "Número" após preencher
      setTimeout(() => {
        const el = document.getElementById('addr-number') as HTMLInputElement | null;
        el?.focus();
      }, 50);
    } finally {
      setSearching(false);
    }
  };

  const h = compact ? 'h-8 text-sm' : '';
  const labelCls = compact ? 'text-xs' : '';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5 col-span-1">
          <Label className={labelCls}>CEP {required && '*'}</Label>
          <div className="relative">
            <Input
              className={h}
              inputMode="numeric"
              placeholder="00000-000"
              value={formatCep(value.cep)}
              disabled={disabled}
              onChange={(e) => {
                const masked = formatCep(e.target.value);
                update({ cep: masked });
                const digits = masked.replace(/\D/g, '');
                if (digits.length === 8) void lookup(digits);
              }}
              onBlur={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                if (digits.length === 8) void lookup(digits);
              }}
            />
            {searching && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            {!searching && (
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className={labelCls}>Rua / Logradouro</Label>
          <Input
            className={h}
            value={value.street}
            disabled={disabled}
            onChange={(e) => update({ street: e.target.value })}
            placeholder="Preenchido pelo CEP"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label className={labelCls}>Número {required && '*'}</Label>
          <Input
            id="addr-number"
            className={h}
            value={value.number}
            disabled={disabled}
            onChange={(e) => update({ number: e.target.value })}
            placeholder="123"
          />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className={labelCls}>Complemento</Label>
          <Input
            className={h}
            value={value.complement}
            disabled={disabled}
            onChange={(e) => update({ complement: e.target.value })}
            placeholder="Sala, andar, referência"
          />
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2">
        <div className="space-y-1.5 col-span-2">
          <Label className={labelCls}>Bairro</Label>
          <Input
            className={h}
            value={value.neighborhood}
            disabled={disabled}
            onChange={(e) => update({ neighborhood: e.target.value })}
          />
        </div>
        <div className="space-y-1.5 col-span-3">
          <Label className={labelCls}>Cidade</Label>
          <Input
            className={h}
            value={value.city}
            disabled={disabled}
            onChange={(e) => update({ city: e.target.value })}
          />
        </div>
        <div className="space-y-1.5 col-span-1">
          <Label className={labelCls}>UF</Label>
          <Input
            className={h}
            maxLength={2}
            value={value.state}
            disabled={disabled}
            onChange={(e) =>
              update({ state: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })
            }
          />
        </div>
      </div>
    </div>
  );
}

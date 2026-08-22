import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DATA_VISIBILITIES, type DataVisibility, type PermissionModuleKey } from '@/lib/permissions';
import { usePermissions } from '@/hooks/usePermissions';

interface Props {
  module: PermissionModuleKey;
  value: DataVisibility | null | undefined;
  onChange: (v: DataVisibility) => void;
  label?: string;
  disabled?: boolean;
}

/**
 * Seleção de privacidade do registro (privado / compartilhado / geral da clínica).
 * Só aparece para quem tem permissão de compartilhar no módulo; os demais criam
 * registros privados, que é o padrão aplicado pelo banco.
 */
export function VisibilitySelect({ module, value, onChange, label = 'Privacidade', disabled }: Props) {
  const { can, isAdmin } = usePermissions();
  const allowed = isAdmin || can(module, 'share');

  if (!allowed) return null;

  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? (isAdmin ? 'clinic' : 'private')} onValueChange={(v) => onChange(v as DataVisibility)} disabled={disabled}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATA_VISIBILITIES.map(v => (
            <SelectItem key={v.key} value={v.key} className="text-sm">{v.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default VisibilitySelect;

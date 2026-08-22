import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  DATA_SCOPES,
  PRESET_LABELS,
  presetPermissions,
  type PermissionRow,
  type PermissionActionKey,
  type PermissionPreset,
  type DataScope,
} from '@/lib/permissions';

interface Props {
  value: PermissionRow[];
  onChange: (rows: PermissionRow[]) => void;
}

/**
 * Matriz de permissões por módulo: ações, valores, dados de outros e escopo.
 * O que é marcado aqui é o mesmo que o banco valida via RLS.
 */
export function PermissionsMatrix({ value, onChange }: Props) {
  const update = (module: string, key: PermissionActionKey, val: boolean) => {
    onChange(value.map(row => {
      if (row.module !== module) return row;
      const next = { ...row, [key]: val } as PermissionRow;
      // Qualquer ação exige visualização do módulo.
      if (val && key !== 'can_view') next.can_view = true;
      // Desligar visualização desliga o resto.
      if (!val && key === 'can_view') {
        PERMISSION_ACTIONS.forEach(a => { if (a.key !== 'can_view') (next as never as Record<string, boolean>)[a.key] = false; });
      }
      return next;
    }));
  };

  const updateScope = (module: string, scope: DataScope) => {
    onChange(value.map(row => (row.module === module ? { ...row, data_scope: scope } : row)));
  };

  const applyPreset = (preset: PermissionPreset) => onChange(presetPermissions(preset));

  return (
    <div className="space-y-3 mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs text-muted-foreground">Modelos rápidos:</Label>
        {(Object.keys(PRESET_LABELS) as PermissionPreset[]).map(p => (
          <Button key={p} type="button" size="sm" variant="outline" onClick={() => applyPreset(p)}>
            {PRESET_LABELS[p]}
          </Button>
        ))}
      </div>

      <div className="border rounded-lg" data-table-wrapper>
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-2 text-[11px] font-semibold sticky left-0 bg-muted z-10">Módulo</th>
              {PERMISSION_ACTIONS.map(a => (
                <th key={a.key} className="text-center p-2 text-[11px] font-semibold whitespace-nowrap">{a.label}</th>
              ))}
              <th className="text-center p-2 text-[11px] font-semibold whitespace-nowrap">Escopo dos dados</th>
            </tr>
          </thead>
          <tbody>
            {value.map(row => (
              <tr key={row.module} className="border-t">
                <td className="p-2 whitespace-nowrap sticky left-0 bg-background z-10">
                  {PERMISSION_MODULES.find(m => m.key === row.module)?.label ?? row.module}
                </td>
                {PERMISSION_ACTIONS.map(a => (
                  <td key={a.key} className="text-center p-2">
                    <Switch
                      aria-label={`${a.label} — ${row.module}`}
                      checked={!!row[a.key]}
                      onCheckedChange={(b) => update(row.module, a.key, b)}
                    />
                  </td>
                ))}
                <td className="p-2">
                  <Select value={row.data_scope} onValueChange={(v) => updateScope(row.module, v as DataScope)}>
                    <SelectTrigger className="h-8 text-xs min-w-[190px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATA_SCOPES.map(s => (
                        <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        “Editar/Excluir próprios” vale para registros criados pelo próprio profissional.
        “Ver dados de outros” libera registros compartilhados de colegas. Registros
        privados de outro profissional nunca aparecem sem essa liberação.
      </p>
    </div>
  );
}

export default PermissionsMatrix;

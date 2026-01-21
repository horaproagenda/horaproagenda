import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Bell, Package, Save, Phone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

const STORAGE_KEY = 'stock_alert_settings';

interface StockAlertSettings {
  enabled: boolean;
  notifyPhone: string;
  notifyLowStock: boolean;
  notifyNearDepletion: boolean;
}

const defaultSettings: StockAlertSettings = {
  enabled: false,
  notifyPhone: '',
  notifyLowStock: true,
  notifyNearDepletion: true,
};

export function StockAlertSettings() {
  const [settings, setSettings] = useState<StockAlertSettings>(defaultSettings);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, []);

  const handleChange = (key: keyof StockAlertSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setIsDirty(false);
    toast.success('Configurações de alertas salvas!');
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 11) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-medium">Alertas de Estoque</CardTitle>
            <CardDescription className="text-xs">
              Notificações via WhatsApp quando produtos atingem níveis baixos
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">Ativar notificações</Label>
              <p className="text-xs text-muted-foreground">
                Receber alertas via WhatsApp
              </p>
            </div>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => handleChange('enabled', checked)}
          />
        </div>

        {settings.enabled && (
          <>
            {/* Phone number */}
            <div className="space-y-2">
              <Label htmlFor="notifyPhone" className="text-sm">
                Número para notificações
              </Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="notifyPhone"
                  type="tel"
                  placeholder="(00) 00000-0000"
                  value={formatPhone(settings.notifyPhone)}
                  onChange={(e) => handleChange('notifyPhone', e.target.value.replace(/\D/g, ''))}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Número que receberá os alertas de estoque baixo
              </p>
            </div>

            {/* Alert types */}
            <div className="space-y-3 pt-2">
              <Label className="text-sm font-medium">Tipos de alerta</Label>
              
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm">Estoque abaixo do mínimo</span>
                </div>
                <Switch
                  checked={settings.notifyLowStock}
                  onCheckedChange={(checked) => handleChange('notifyLowStock', checked)}
                />
              </div>

              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm">Produto próximo de acabar</span>
                </div>
                <Switch
                  checked={settings.notifyNearDepletion}
                  onCheckedChange={(checked) => handleChange('notifyNearDepletion', checked)}
                />
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Os alertas são enviados uma vez por dia para cada produto. 
                A previsão de uso é baseada no histórico de atendimentos realizados.
              </AlertDescription>
            </Alert>
          </>
        )}

        {isDirty && (
          <Button onClick={handleSave} className="w-full gap-2">
            <Save className="h-4 w-4" />
            Salvar configurações
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Export helper to get settings
export function getStockAlertSettings(): StockAlertSettings | null {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  try {
    const settings = JSON.parse(saved);
    if (settings.enabled && settings.notifyPhone) {
      return settings;
    }
    return null;
  } catch {
    return null;
  }
}

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Package, 
  AlertTriangle, 
  TrendingDown, 
  Calendar, 
  Activity,
  Eye,
  Bell,
} from 'lucide-react';
import { useProductUsagePrediction, ProductUsagePrediction } from '@/hooks/useProductUsagePrediction';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ProductUsagePredictionPanelProps {
  onViewProduct?: (productId: string) => void;
}

export function ProductUsagePredictionPanel({ onViewProduct }: ProductUsagePredictionPanelProps) {
  const { predictions, criticalProducts, warningProducts, totalAlerts } = useProductUsagePrediction();

  const alertProducts = [...criticalProducts, ...warningProducts];

  if (alertProducts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Previsão de Uso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            <Package className="h-10 w-10 mb-2 opacity-50" />
            <p className="text-sm">Todos os produtos estão com estoque adequado</p>
            <p className="text-xs mt-1">Nenhum alerta de uso no momento</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Previsão de Uso
          </CardTitle>
          <Badge variant={criticalProducts.length > 0 ? 'destructive' : 'outline'}>
            {totalAlerts} alerta(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-64">
          <div className="space-y-1 p-3 pt-0">
            {alertProducts.map((product) => (
              <ProductUsageItem 
                key={product.product_id}
                prediction={product}
                onView={() => onViewProduct?.(product.product_id)}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

interface ProductUsageItemProps {
  prediction: ProductUsagePrediction;
  onView?: () => void;
}

function ProductUsageItem({ prediction, onView }: ProductUsageItemProps) {
  const getAlertIcon = () => {
    if (prediction.alert_level === 'critical') {
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    }
    return <TrendingDown className="h-4 w-4 text-amber-500" />;
  };

  const getProgressColor = () => {
    if (prediction.depletion_percentage >= 90) return 'bg-destructive';
    if (prediction.depletion_percentage >= 70) return 'bg-amber-500';
    return 'bg-primary';
  };

  return (
    <TooltipProvider>
      <div className={cn(
        "p-3 rounded-lg border transition-colors",
        prediction.alert_level === 'critical' 
          ? "border-destructive/30 bg-destructive/5" 
          : "border-amber-500/30 bg-amber-500/5"
      )}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {getAlertIcon()}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{prediction.product_name}</p>
              <p className="text-xs text-muted-foreground">
                {prediction.current_stock} {prediction.product_unit} em estoque
              </p>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onView}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>

        {/* Usage progress bar */}
        {prediction.depletion_percentage > 0 && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Uso estimado</span>
              <span className="font-medium">{Math.round(prediction.depletion_percentage)}%</span>
            </div>
            <Progress 
              value={prediction.depletion_percentage} 
              className="h-1.5"
            />
          </div>
        )}

        {/* Alert message */}
        {prediction.alert_message && (
          <div className="mt-2 flex items-center gap-1.5">
            <Bell className="h-3 w-3 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">{prediction.alert_message}</p>
          </div>
        )}

        {/* Predictions */}
        <div className="mt-2 flex flex-wrap gap-2">
          {prediction.predicted_remaining_appointments >= 0 && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-xs gap-1">
                  <Activity className="h-3 w-3" />
                  ~{Math.round(prediction.predicted_remaining_appointments)} atend.
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Atendimentos restantes estimados</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {prediction.predicted_remaining_days >= 0 && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-xs gap-1">
                  <Calendar className="h-3 w-3" />
                  ~{Math.round(prediction.predicted_remaining_days)} dias
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Dias de uso restantes estimados</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Historical data info */}
        {prediction.total_historical_appointments > 0 && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Base: {prediction.total_historical_appointments} atendimentos com {prediction.total_units_consumed} {prediction.product_unit}
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatCard({ title, value, icon, description, trend, className }: StatCardProps) {
  return (
    <div 
      className={cn(
        'rounded-xl border border-border bg-card p-3 sm:p-4 md:p-6 transition-all duration-200 hover:shadow-lg animate-fade-in min-w-0',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] sm:text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wide truncate">{title}</p>
          <p className="mt-1 md:mt-2 text-lg sm:text-xl md:text-3xl font-display font-semibold text-foreground tabular-nums truncate">
            {value}
          </p>
          {description && (
            <p className="mt-0.5 md:mt-1 text-[10px] sm:text-xs text-muted-foreground truncate">{description}</p>
          )}
          {trend && (
            <p 
              className={cn(
                'mt-1 md:mt-2 text-[10px] sm:text-xs font-medium truncate',
                trend.isPositive ? 'text-success' : 'text-destructive'
              )}
            >
              {trend.isPositive ? '+' : ''}{trend.value}% vs mês anterior
            </p>
          )}
        </div>
        <div className="rounded-lg bg-primary/10 p-1.5 sm:p-2 md:p-3 flex-shrink-0 [&_svg]:h-4 [&_svg]:w-4 sm:[&_svg]:h-5 sm:[&_svg]:w-5 md:[&_svg]:h-6 md:[&_svg]:w-6">
          {icon}
        </div>
      </div>
    </div>
  );
}

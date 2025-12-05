import { Clock, DollarSign } from 'lucide-react';
import { Service } from '@/types';
import { Badge } from '@/components/ui/badge';

interface ServiceCardProps {
  service: Service;
}

export function ServiceCard({ service }: ServiceCardProps) {
  return (
    <div 
      className="group rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:border-primary/30 hover:shadow-lg animate-fade-in"
      style={{ borderTopColor: service.color, borderTopWidth: '3px' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground">{service.name}</h4>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {service.description}
          </p>
        </div>
        <Badge 
          variant="outline" 
          className="shrink-0"
          style={{ backgroundColor: `${service.color}15`, borderColor: `${service.color}40` }}
        >
          {service.category}
        </Badge>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{service.duration} min</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <DollarSign className="h-4 w-4 text-success" />
          <span>R$ {service.price.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

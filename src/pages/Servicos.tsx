import { useState } from 'react';
import { Plus, Sparkles, Filter } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ServiceCard } from '@/components/services/ServiceCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { mockServices } from '@/data/mockData';
import { cn } from '@/lib/utils';

const Servicos = () => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [...new Set(mockServices.map(s => s.category))];
  
  const filteredServices = selectedCategory
    ? mockServices.filter(s => s.category === selectedCategory)
    : mockServices;

  return (
    <AppLayout 
      title="Serviços" 
      subtitle="Catálogo de procedimentos"
    >
      {/* Header Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Badge
            variant="outline"
            className={cn(
              'cursor-pointer transition-colors',
              !selectedCategory && 'bg-primary text-primary-foreground border-primary'
            )}
            onClick={() => setSelectedCategory(null)}
          >
            Todos
          </Badge>
          {categories.map(category => (
            <Badge
              key={category}
              variant="outline"
              className={cn(
                'cursor-pointer transition-colors',
                selectedCategory === category && 'bg-primary text-primary-foreground border-primary'
              )}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </Badge>
          ))}
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Serviço
        </Button>
      </div>

      {/* Stats */}
      <div className="mt-6 flex items-center gap-6 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-display font-semibold">{mockServices.length}</p>
            <p className="text-xs text-muted-foreground">Serviços ativos</p>
          </div>
        </div>
        <div className="h-10 w-px bg-border" />
        <div>
          <p className="text-2xl font-display font-semibold">{categories.length}</p>
          <p className="text-xs text-muted-foreground">Categorias</p>
        </div>
        <div className="h-10 w-px bg-border" />
        <div>
          <p className="text-2xl font-display font-semibold">
            R$ {Math.round(mockServices.reduce((acc, s) => acc + s.price, 0) / mockServices.length)}
          </p>
          <p className="text-xs text-muted-foreground">Ticket médio</p>
        </div>
      </div>

      {/* Services Grid */}
      <div className="mt-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredServices.map((service, index) => (
            <div
              key={service.id}
              style={{ animationDelay: `${index * 50}ms` }}
              className="animate-slide-up"
            >
              <ServiceCard service={service} />
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default Servicos;

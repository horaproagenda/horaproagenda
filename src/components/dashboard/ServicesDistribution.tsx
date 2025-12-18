import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCategoryColor } from '@/lib/categoryColors';

interface ServiceData {
  name: string;
  category: string;
  count: number;
}

interface ServicesDistributionProps {
  data: ServiceData[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function ServicesDistribution({ data }: ServicesDistributionProps) {
  const chartData = data.map((item, index) => ({
    ...item,
    fill: getCategoryColor(item.category).hex || COLORS[index % COLORS.length],
  }));

  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Serviços Mais Realizados</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div className="space-y-4">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="name"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      `${value} (${((value / total) * 100).toFixed(1)}%)`,
                      name
                    ]}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="space-y-2">
              {data.map((item, index) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="h-3 w-3 rounded-full" 
                      style={{ backgroundColor: getCategoryColor(item.category).hex || COLORS[index % COLORS.length] }}
                    />
                    <span className="text-muted-foreground truncate max-w-[150px]">{item.name}</span>
                  </div>
                  <span className="font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum serviço realizado este mês
          </p>
        )}
      </CardContent>
    </Card>
  );
}

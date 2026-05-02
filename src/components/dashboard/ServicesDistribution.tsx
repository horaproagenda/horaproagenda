import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
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

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function ServicesDistribution({ data }: ServicesDistributionProps) {
  const chartData = data.map((item, index) => ({
    ...item,
    fill: getCategoryColor(item.category).hex || COLORS[index % COLORS.length],
  }));

  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm">Serviços Mais Realizados</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {data.length > 0 ? (
          <div className="space-y-2">
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={62}
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
                      name,
                    ]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-1">
              {chartData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.fill }}
                    />
                    <span
                      className="font-medium truncate max-w-[140px]"
                      style={{ color: item.fill }}
                      title={item.name}
                    >
                      {item.name}
                    </span>
                  </div>
                  <span className="font-semibold text-foreground">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-6">
            Nenhum serviço realizado este mês
          </p>
        )}
      </CardContent>
    </Card>
  );
}

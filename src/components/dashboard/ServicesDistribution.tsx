import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ServiceData {
  name: string;
  category: string;
  count: number;
}

interface ServicesDistributionProps {
  data: ServiceData[];
}

// Distinct, accessible palette so EACH service gets its own color.
// Colors stay aligned between the pie slice and the legend label.
const SERVICE_COLORS = [
  '#6366F1', // indigo
  '#EC4899', // pink
  '#10B981', // emerald
  '#F59E0B', // amber
  '#3B82F6', // blue
  '#EF4444', // red
  '#8B5CF6', // violet
  '#14B8A6', // teal
  '#F97316', // orange
  '#22C55E', // green
  '#06B6D4', // cyan
  '#A855F7', // purple
  '#EAB308', // yellow
  '#0EA5E9', // sky
  '#D946EF', // fuchsia
];

const colorForService = (name: string, index: number): string => {
  // Deterministic color per service name so colors are stable across renders,
  // with index fallback to keep visual distinction when names hash collide.
  if (!name) return SERVICE_COLORS[index % SERVICE_COLORS.length];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const base = Math.abs(hash) % SERVICE_COLORS.length;
  // Offset by index to reduce adjacent collisions in the legend.
  return SERVICE_COLORS[(base + index) % SERVICE_COLORS.length];
};

export function ServicesDistribution({ data }: ServicesDistributionProps) {
  const chartData = data.map((item, index) => ({
    ...item,
    fill: colorForService(item.name, index),
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

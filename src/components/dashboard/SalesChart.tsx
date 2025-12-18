import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ChartData {
  month: string;
  fullMonth?: string;
  revenue?: number;
  count?: number;
}

interface SalesChartProps {
  salesData: ChartData[];
  clientsData: ChartData[];
}

export function SalesChart({ salesData, clientsData }: SalesChartProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
    }).format(value);
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-lg">Evolução</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="sales" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="sales">Vendas por Mês</TabsTrigger>
            <TabsTrigger value="clients">Novos Clientes</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis 
                  tickFormatter={formatCurrency} 
                  className="text-xs" 
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  width={80}
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Receita']}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullMonth || label}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="clients" className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={clientsData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip 
                  formatter={(value: number) => [value, 'Novos Clientes']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

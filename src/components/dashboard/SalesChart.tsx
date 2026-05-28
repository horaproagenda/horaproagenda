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
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm text-indigo-700 flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
          Evolução
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <Tabs defaultValue="sales" className="w-full">
          <TabsList className="mb-2 h-7 bg-muted/50 p-1 gap-1">
            <TabsTrigger value="sales" className="text-[11px] h-6 px-2 border border-transparent data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-700 data-[state=active]:border-sky-500/40">Vendas por Mês</TabsTrigger>
            <TabsTrigger value="clients" className="text-[11px] h-6 px-2 border border-transparent data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-700 data-[state=active]:border-emerald-500/40">Novos Clientes</TabsTrigger>
          </TabsList>


          <TabsContent value="sales" className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                <YAxis
                  tickFormatter={formatCurrency}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  width={60}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'Receita']}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullMonth || label}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="clients" className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={clientsData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} width={28} />
                <Tooltip
                  formatter={(value: number) => [value, 'Novos Clientes']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

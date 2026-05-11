"use client";

import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  AreaChart,
  Area
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion } from 'motion/react';
import { TrendingUp, Users, BookOpen, Clock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAppState } from '@/src/state/AppStateContext';
import { Button } from '@/components/ui/button';

const TREND_DATA = [
  { name: 'Jan', ai: 40, crypto: 24, bio: 20 },
  { name: 'Feb', ai: 30, crypto: 13, bio: 22 },
  { name: 'Mar', ai: 20, crypto: 98, bio: 22 },
  { name: 'Apr', ai: 27, crypto: 39, bio: 20 },
  { name: 'May', ai: 18, crypto: 48, bio: 21 },
  { name: 'Jun', ai: 23, crypto: 38, bio: 25 },
  { name: 'Jul', ai: 34, crypto: 43, bio: 21 },
];

export default function Statistics() {
  const { topics, papers } = useAppState();
  const [timeRange, setTimeRange] = useState<"6m" | "12m">("6m");

  const topicChartData = useMemo(
    () => topics.map((topic) => ({ name: topic.name, count: topic.count })),
    [topics],
  );

  const visibleTrendData = timeRange === "6m" ? TREND_DATA.slice(-6) : TREND_DATA;

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <header>
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground">Publication Trends</h1>
        <p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
          Visualizing the velocity of human discovery and popular research intersections.
        </p>
        <div className="flex gap-2 mt-4">
          <Button variant={timeRange === "6m" ? "default" : "secondary"} size="sm" onClick={() => setTimeRange("6m")}>
            6 months
          </Button>
          <Button variant={timeRange === "12m" ? "default" : "secondary"} size="sm" onClick={() => setTimeRange("12m")}>
            12 months
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { icon: TrendingUp, label: 'Velocity', value: '+12.4%', sub: 'vs last month', color: 'text-emerald-600' },
          { icon: BookOpen, label: 'Papers Indexed', value: String(papers.length), sub: 'In your local feed', color: 'text-primary' },
          { icon: Users, label: 'Tracked Topics', value: String(topics.length), sub: 'Across all domains', color: 'text-primary' },
          { icon: Clock, label: 'Review Time', value: '4.2d', sub: 'Avg per paper', color: 'text-primary' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
                <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-secondary rounded-lg">
                            <stat.icon className="w-4 h-4 text-muted-foreground" />
                        </div>
                    </div>
                    <div className="text-2xl font-serif font-bold">{stat.value}</div>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-1">{stat.label}</div>
                    <div className="text-xs text-muted-foreground mt-3">
                        <span className={stat.color}>{stat.sub}</span>
                    </div>
                </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-serif">Topic Velocity</CardTitle>
            <CardDescription aria-hidden="true">Monthly publication volume across primary tracked topics.</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={visibleTrendData}>
                  <defs>
                    <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    fontSize={12} 
                    tick={{ fill: '#888' }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    fontSize={12} 
                    tick={{ fill: '#888' }} 
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="ai" 
                    name="AI & LLMs"
                    stroke="var(--color-primary)" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorAi)" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="crypto" 
                    name="Computing"
                    stroke="#a1a1aa" 
                    strokeWidth={2}
                    fillOpacity={0.05} 
                    fill="#a1a1aa" 
                  />
                </AreaChart>
             </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-serif">Topic Distribution</CardTitle>
            <CardDescription aria-hidden="true">Total papers indexed per tracked domain.</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topicChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis type="number" hide />
                <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    fontSize={10} 
                    width={100}
                    tick={{ fill: '#888', fontWeight: 600 }} 
                />
                <Tooltip 
                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} 
                />
                <Bar 
                    dataKey="count" 
                    fill="var(--color-primary)" 
                    radius={[0, 4, 4, 0]} 
                    barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

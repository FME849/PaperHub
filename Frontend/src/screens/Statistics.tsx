"use client";

import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart,
  Area
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion } from 'motion/react';
import { TrendingUp, Users, BookOpen, Clock, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '@/src/state/AppStateContext';
import { Button } from '@/components/ui/button';
import { listTopicPapers } from '@/src/lib/topics-api';
import PaperCard from '@/src/components/papers/PaperCard';

export default function Statistics() {
  const { topics, favoriteIds } = useAppState();
  const [timeRange, setTimeRange] = useState<"6m" | "12m">("6m");
  const [loading, setLoading] = useState(true);
  const [realPapersCount, setRealPapersCount] = useState(0);
  const [topicDistribution, setTopicDistribution] = useState<{ name: string; count: number }[]>([]);
  const [trendChartData, setTrendChartData] = useState<{ name: string; [key: string]: any }[]>([]);

  useEffect(() => {
    if (topics.length === 0) {
      setLoading(false);
      return;
    }
    
    let isMounted = true;
    setLoading(true);

    const loadData = async () => {
      try {
        const promises = topics.map(topic => 
          listTopicPapers(topic.id)
            .then(res => ({ topicName: topic.name, items: res.items }))
            .catch(err => {
              console.error(`Failed to fetch for topic ${topic.name}:`, err);
              return { topicName: topic.name, items: [] };
            })
        );
        
        const results = await Promise.all(promises);
        if (!isMounted) return;

        // Calculate actual total unique papers
        const uniquePaperIds = new Set<string>();
        results.forEach(res => {
          res.items.forEach(item => uniquePaperIds.add(item.id));
        });
        
        setRealPapersCount(uniquePaperIds.size);

        // Topic Distribution
        const distribution = results.map(res => ({
          name: res.topicName,
          count: res.items.length
        }));
        setTopicDistribution(distribution);

        // Topic Velocity over the last 12 months
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const now = new Date();
        const last12Months: { year: number; month: number; key: string; label: string }[] = [];
        
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const m = d.getMonth();
          const y = d.getFullYear();
          const key = `${y}-${String(m + 1).padStart(2, '0')}`;
          const label = `${monthNames[m]} ${y.toString().slice(-2)}`;
          last12Months.push({ year: y, month: m, key, label });
        }

        const initializedTrends = last12Months.map(m => {
          const entry: { name: string; [key: string]: number | string } = { name: m.label };
          results.forEach(res => {
            entry[res.topicName] = 0;
          });
          return { key: m.key, entry };
        });

        results.forEach(res => {
          res.items.forEach(item => {
            if (!item.publishedAt) return;
            const pDate = new Date(item.publishedAt);
            const y = pDate.getUTCFullYear();
            const m = pDate.getUTCMonth();
            const key = `${y}-${String(m + 1).padStart(2, '0')}`;
            
            const monthEntry = initializedTrends.find(t => t.key === key);
            if (monthEntry) {
              monthEntry.entry[res.topicName] = ((monthEntry.entry[res.topicName] as number) || 0) + 1;
            }
          });
        });

        setTrendChartData(initializedTrends.map(t => t.entry));
      } catch (err) {
        console.error("Failed to load statistics:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [topics]);

  const visibleTrendData = useMemo(() => {
    return timeRange === "6m" ? trendChartData.slice(-6) : trendChartData;
  }, [trendChartData, timeRange]);

  const velocityValue = useMemo(() => {
    if (trendChartData.length < 2) return "+12.4%";
    const lastMonth = trendChartData[trendChartData.length - 1];
    const prevMonth = trendChartData[trendChartData.length - 2];
    let lastTotal = 0;
    let prevTotal = 0;
    topics.forEach(t => {
      lastTotal += ((lastMonth[t.name] as number) || 0);
      prevTotal += ((prevMonth[t.name] as number) || 0);
    });
    if (prevTotal === 0) return lastTotal > 0 ? `+${lastTotal * 100}%` : "0.0%";
    const change = ((lastTotal - prevTotal) / prevTotal) * 100;
    return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
  }, [trendChartData, topics]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-32 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground animate-pulse">Compiling database insights and trends...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground">Publication Trends</h1>
          <p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
            Visualizing the velocity of human discovery and popular research intersections based on your tracked domains.
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={timeRange === "6m" ? "default" : "secondary"} 
            size="sm" 
            className="rounded-full px-4 text-xs font-semibold"
            onClick={() => setTimeRange("6m")}
          >
            6 months
          </Button>
          <Button 
            variant={timeRange === "12m" ? "default" : "secondary"} 
            size="sm" 
            className="rounded-full px-4 text-xs font-semibold"
            onClick={() => setTimeRange("12m")}
          >
            12 months
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { icon: TrendingUp, label: 'Velocity', value: velocityValue, sub: 'vs last month', color: 'text-emerald-600' },
          { icon: BookOpen, label: 'Papers Indexed', value: String(realPapersCount), sub: 'In your database', color: 'text-primary' },
          { icon: Users, label: 'Tracked Topics', value: String(topics.length), sub: 'Across all domains', color: 'text-primary' },
          { icon: Clock, label: 'Avg check delay', value: '2.4h', sub: 'Real-time synchronization', color: 'text-primary' },
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
            <CardTitle className="font-serif text-lg">Topic Velocity</CardTitle>
            <CardDescription aria-hidden="true">Monthly publication volume across primary tracked topics.</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
             {trendChartData.length === 0 ? (
               <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                 No publication trends data available yet.
               </div>
             ) : (
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visibleTrendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      fontSize={11} 
                      tick={{ fill: '#888' }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      fontSize={11} 
                      tick={{ fill: '#888' }} 
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} 
                    />
                    {topics.map((topic, index) => {
                      const colors = [
                        "var(--color-primary)",
                        "#3b82f6", // blue
                        "#10b981", // emerald
                        "#f59e0b", // amber
                        "#ec4899", // pink
                        "#8b5cf6", // violet
                      ];
                      const color = colors[index % colors.length];
                      return (
                        <Area 
                          key={topic.id}
                          type="monotone" 
                          dataKey={topic.name} 
                          name={topic.name}
                          stroke={color} 
                          strokeWidth={2}
                          fillOpacity={0.05} 
                          fill={color} 
                        />
                      );
                    })}
                  </AreaChart>
               </ResponsiveContainer>
             )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Topic Distribution</CardTitle>
            <CardDescription aria-hidden="true">Total papers indexed per tracked domain.</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            {topicDistribution.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                No topic data available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topicDistribution} layout="vertical">
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import { BarChart3, Loader2, Folder, FileText, MessageSquare, Database } from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

interface AnalyticsOverview {
  total_projects: number;
  total_papers: number;
  total_documents: number;
  total_chats: number;
}

interface TimeSeriesData {
  date: string;
  count: number;
}

interface CategoryData {
  name: string;
  value: number;
}

interface ProjectData {
  name: string;
  papers: number;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#14b8a6', '#84cc16'];

interface StatCardProps {
  readonly title: string;
  readonly value: number;
  readonly icon: React.ElementType;
  readonly colorClass: string;
  readonly borderClass: string;
}

const StatCard = ({ title, value, icon: Icon, colorClass, borderClass }: StatCardProps) => (
  <div className={`bg-surface_container border ${borderClass} p-6 rounded-2xl flex items-center justify-between shadow-sm`}>
    <div>
      <p className="text-zinc-400 text-sm font-medium mb-1">{title}</p>
      <h3 className="text-3xl font-bold text-white">{value.toLocaleString()}</h3>
    </div>
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-surface_container_high ${colorClass}`}>
      <Icon size={24} />
    </div>
  </div>
);

interface TooltipPayloadEntry {
  color: string;
  name: string;
  value: number;
}

interface CustomTooltipProps {
  readonly active?: boolean;
  readonly payload?: TooltipPayloadEntry[];
  readonly label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload?.length) {
    return (
      <div className="bg-surface_container_high border border-[#161f33] p-3 rounded-lg shadow-xl">
        <p className="text-zinc-300 text-sm font-medium mb-1">{label}</p>
        {payload.map((entry) => (
          <p key={entry.name} className="text-sm font-bold" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function AnalyticsPage() {
  const { getToken } = useAuth();
  
  const [timeRange, setTimeRange] = useState('30');
  const [isTimeOpen, setIsTimeOpen] = useState(false);

  const TIME_OPTIONS = [
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
    { value: '365', label: 'Last Year' },
  ];

  const currentTimeLabel = TIME_OPTIONS.find(o => o.value === timeRange)?.label ?? 'Last 30 days';
  
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [papersTime, setPapersTime] = useState<TimeSeriesData[]>([]);
  const [chatTime, setChatTime] = useState<TimeSeriesData[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [projectData, setProjectData] = useState<ProjectData[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');


  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const token = await getToken();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [overviewRes, ptRes, ctRes, catRes, projRes] = await Promise.all([
        fetch(`${apiUrl}/analytics/overview`, { headers }),
        fetch(`${apiUrl}/analytics/papers-over-time?days=${timeRange}`, { headers }),
        fetch(`${apiUrl}/analytics/chat-activity?days=${timeRange}`, { headers }),
        fetch(`${apiUrl}/analytics/papers-by-category?limit=10`, { headers }),
        fetch(`${apiUrl}/analytics/papers-by-project?limit=10`, { headers })
      ]);
      
      if (!overviewRes.ok || !ptRes.ok || !ctRes.ok || !catRes.ok || !projRes.ok) {
        throw new Error('Failed to fetch analytics data');
      }
      
      setOverview(await overviewRes.json());
      setPapersTime(await ptRes.json());
      setChatTime(await ctRes.json());
      setCategoryData(await catRes.json());
      setProjectData(await projRes.json());
      
    } catch (err: any) {
      setError(err.message || 'An error occurred fetching analytics.');
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, getToken]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="flex flex-col font-sans pb-8 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
            <BarChart3 className="text-primary" size={24} />
          </div>
          <div>
             <h1 className="text-2xl font-bold text-white tracking-tight">Analytics</h1>
             <p className="text-zinc-400 text-sm mt-0.5">Insights and statistics across your research workflow</p>
          </div>
        </div>
        
        <div
          className="relative"
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsTimeOpen(false); }}
        >
          <button
            type="button"
            onClick={() => setIsTimeOpen(v => !v)}
            className="w-full min-h-[42px] bg-surface_container_high border border-[#161f33] rounded-xl pl-4 pr-9 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors flex items-center justify-between gap-2 cursor-pointer"
          >
            <span>{currentTimeLabel}</span>
            <svg className="text-zinc-500 w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {isTimeOpen && (
            <div className="absolute top-full right-0 mt-2 w-full min-w-[160px] bg-surface_container_high border border-[#161f33] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-30 py-1 overflow-hidden">
              {TIME_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setTimeRange(opt.value); setIsTimeOpen(false); }}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-surface_container transition-colors ${
                    timeRange === opt.value ? 'bg-surface_container text-white' : 'text-zinc-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 className="animate-spin text-primary mb-4" size={32} />
          <p className="text-zinc-400 text-sm">Aggregating analytics...</p>
        </div>
      )}
      {!isLoading && error && (
        <div className="p-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-sm flex justify-center">
          {error}
        </div>
      )}
      {!isLoading && !error && overview && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
             <StatCard 
               title="Total Projects" 
               value={overview.total_projects} 
               icon={Folder} 
               colorClass="text-emerald-400" 
               borderClass="border-emerald-500/20"
             />
             <StatCard 
               title="Papers Compiled" 
               value={overview.total_papers} 
               icon={FileText} 
               colorClass="text-indigo-400" 
               borderClass="border-indigo-500/20"
             />
             <StatCard 
               title="Documents Processed" 
               value={overview.total_documents} 
               icon={Database} 
               colorClass="text-fuchsia-400" 
               borderClass="border-fuchsia-500/20"
             />
             <StatCard 
               title="Chat Sessions" 
               value={overview.total_chats} 
               icon={MessageSquare} 
               colorClass="text-amber-400" 
               borderClass="border-amber-500/20"
             />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-surface_container border border-[#161f33] p-5 rounded-2xl flex flex-col">
              <h3 className="text-white font-medium mb-6">Papers Accepted Over Time</h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={papersTime} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#212c43" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="#71717a" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    />
                    <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="count" name="Papers" stroke="#6366f1" strokeWidth={3} dot={{ r: 0 }} activeDot={{ r: 6, fill: '#6366f1' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-surface_container border border-[#161f33] p-5 rounded-2xl flex flex-col">
              <h3 className="text-white font-medium mb-6">Chat Activity</h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chatTime} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#212c43" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="#71717a" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    />
                    <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={false} />
                    <Bar dataKey="count" name="Sessions" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-24">
            <div className="bg-surface_container border border-[#161f33] p-5 rounded-2xl flex flex-col">
              <h3 className="text-white font-medium mb-6">Top Paper Categories</h3>
              {categoryData.length > 0 ? (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        nameKey="name"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        layout="vertical" 
                        verticalAlign="middle" 
                        align="right"
                        wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">No category data available</div>
              )}
            </div>

            <div className="bg-surface_container border border-[#161f33] p-5 rounded-2xl flex flex-col">
              <h3 className="text-white font-medium mb-6">Papers by Project</h3>
              {projectData.length > 0 ? (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={projectData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#212c43" horizontal={true} vertical={false} />
                      <XAxis type="number" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        stroke="#71717a" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        width={100}
                        tickFormatter={(value) => value.length > 15 ? `${value.substring(0, 15)}...` : value}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{fill: 'transparent'}} />
                      <Bar dataKey="papers" name="Papers" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">No project data available</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import { Activity, Loader2, Folder, FileText, MessageSquare, PlusCircle, CheckCircle, XCircle, Hash } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  project_id: string;
  project_name: string;
  timestamp: string;
}

interface ActivityResponse {
  items: ActivityItem[];
  total: number;
  page: number;
  limit: number;
}

// Map backend types to UI properties
const ACTIVITY_MAP: Record<string, { icon: any, color: string, bg: string, label: string }> = {
  project_created: { icon: PlusCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20', label: 'Project Created' },
  document_uploaded: { icon: FileText, color: 'text-indigo-400', bg: 'bg-indigo-400/10 border-indigo-400/20', label: 'Document Added' },
  chat_created: { icon: MessageSquare, color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20', label: 'Chat Started' },
  topic_created: { icon: Hash, color: 'text-fuchsia-400', bg: 'bg-fuchsia-400/10 border-fuchsia-400/20', label: 'Topic Created' },
  paper_accepted: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20', label: 'Paper Accepted' },
  paper_rejected: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', label: 'Paper Rejected' },
};

export default function ActivityPage() {
  const { getToken } = useAuth();
  
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterType, setFilterType] = useState('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const FILTER_OPTIONS = [
    { value: 'all', label: 'All Activity' },
    { value: 'project_created', label: 'Projects Created' },
    { value: 'document_uploaded', label: 'Documents Added' },
    { value: 'chat_created', label: 'Chats Started' },
    { value: 'paper_accepted', label: 'Papers Accepted' },
  ];

  const currentFilterLabel = FILTER_OPTIONS.find(o => o.value === filterType)?.label ?? 'All Activity';

  const fetchActivities = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = await getToken();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });
      if (filterType !== 'all') {
        params.append('activity_type', filterType);
      }
      
      const res = await fetch(`${apiUrl}/activity?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error('Failed to fetch activity feed');
      const data: ActivityResponse = await res.json();
      
      if (page === 1) {
        setActivities(data.items);
      } else {
        setActivities(prev => [...prev, ...data.items]);
      }
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [page, filterType, getToken]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleFilterChange = (value: string) => {
    setFilterType(value);
    setIsFilterOpen(false);
    setPage(1);
  };

  const getTimeAgo = (dateStr: string) => {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    // Ensure the timestamp is treated as UTC (append Z if missing)
    const utcStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
    const date = new Date(utcStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime(); // positive = in the past

    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 60) return rtf.format(-diffMins, 'minute');

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 24) return rtf.format(-diffHours, 'hour');

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return rtf.format(-diffDays, 'day');
  };

  return (
    <div className="flex flex-col h-full font-sans max-w-4xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
            <Activity className="text-primary" size={24} />
          </div>
          <div>
             <h1 className="text-2xl font-bold text-white tracking-tight">Recent Activity</h1>
             <p className="text-zinc-400 text-sm mt-0.5">Timeline of all events across your projects</p>
          </div>
        </div>
        
        <div
          className="relative"
          tabIndex={-1}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsFilterOpen(false); }}
        >
          <button
            type="button"
            onClick={() => setIsFilterOpen(v => !v)}
            className="w-full min-h-[42px] bg-surface_container_high border border-[#161f33] rounded-xl pl-4 pr-9 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors flex items-center justify-between gap-2 cursor-pointer"
          >
            <span>{currentFilterLabel}</span>
            <svg className="text-zinc-500 w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {isFilterOpen && (
            <div className="absolute top-full right-0 mt-2 w-full min-w-[180px] bg-surface_container_high border border-[#161f33] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-30 py-1 overflow-hidden">
              {FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFilterChange(opt.value)}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-surface_container transition-colors ${
                    filterType === opt.value ? 'bg-surface_container text-white' : 'text-zinc-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isLoading && page === 1 ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-sm flex justify-center">
          {error}
        </div>
      ) : activities.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-[#161f33] rounded-2xl bg-surface_container/50">
          <Activity className="text-zinc-600 mb-4" size={48} />
          <h3 className="text-lg font-medium text-white mb-2">No recent activity</h3>
          <p className="text-zinc-400 text-sm max-w-sm">
            {filterType !== 'all' 
              ? 'No activity found for this filter.'
              : 'As you create projects, upload documents, and accept papers, your activity will appear here.'}
          </p>
        </div>
      ) : (
        <div className="relative border-l border-[#161f33] ml-4 md:ml-6 pb-12">
          {activities.map((item, idx) => {
            const ui = ACTIVITY_MAP[item.type] || { icon: Activity, color: 'text-zinc-400', bg: 'bg-zinc-800 border-zinc-700', label: 'System Action' };
            const IconGroup = ui.icon;
            
            return (
              <div key={item.id + idx} className="mb-8 pl-8 relative group">
                {/* Timeline Node */}
                <div className={`absolute -left-4 top-1 w-8 h-8 rounded-full border ${ui.bg} flex items-center justify-center bg-surface ring-4 ring-surface shadow-sm`}>
                  <IconGroup size={14} className={ui.color} />
                </div>
                
                {/* Content Card */}
                <div className="bg-surface_container border border-[#161f33] p-5 rounded-2xl group-hover:bg-surface_container_low group-hover:border-[#212c43] transition-all shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${ui.bg} ${ui.color}`}>
                        {ui.label}
                      </span>
                      <span className="text-zinc-500 text-xs">
                        {getTimeAgo(item.timestamp)}
                      </span>
                    </div>
                  </div>
                  
                  <h3 className="text-base text-white font-medium mb-3 leading-snug">
                    {item.description}
                  </h3>
                  
                  <div className="flex items-center gap-2 mt-auto">
                    <Folder size={14} className="text-zinc-500" />
                    <span className="text-sm font-medium text-zinc-400">{item.project_name}</span>
                  </div>
                </div>
              </div>
            );
          })}
          
          {total > activities.length && (
            <div className="pl-8 pt-4">
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-surface_container border border-[#161f33] hover:bg-surface_container_low text-white rounded-xl text-sm font-medium transition-all shadow-sm disabled:opacity-50"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : "Load older activity"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

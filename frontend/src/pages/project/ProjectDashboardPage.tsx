import { useState, useEffect } from 'react';
import { useOutletContext, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import {
  FileText, Database, MessageSquare, Hash, Sparkles,
  BookOpen, Tag, ArrowRight, Loader2, Calendar, Clock
} from 'lucide-react';

interface Topic {
  id: string;
  name: string;
  status: string;
}

interface ChatSession {
  id: string;
  title: string | null;
  updated_at: string;
}

export default function ProjectDashboardPage() {
  const { project } = useOutletContext<{ project: any }>();
  const { projectId } = useParams<{ projectId: string }>();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = await getToken();
        const headers = { 'Authorization': `Bearer ${token}` };
        const [topicsRes, sessionsRes] = await Promise.all([
          fetch(`${apiUrl}/projects/${projectId}/topics`, { headers }),
          fetch(`${apiUrl}/projects/${projectId}/chat/sessions`, { headers }),
        ]);
        if (topicsRes.ok) setTopics(await topicsRes.json());
        if (sessionsRes.ok) setSessions(await sessionsRes.json());
      } catch (err) {
        console.error('Failed to fetch project overview data', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [projectId, getToken, apiUrl]);

  const getTimeAgo = (dateStr: string) => {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const utcStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
    const diffMs = Date.now() - new Date(utcStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return rtf.format(-diffMins, 'minute');
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return rtf.format(-diffHours, 'hour');
    return rtf.format(-Math.floor(diffMs / 86400000), 'day');
  };

  const quickActions = [
    {
      label: 'Add Papers',
      icon: BookOpen,
      path: 'knowledge',
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10 border-indigo-500/20 hover:border-indigo-500/50 hover:bg-indigo-500/20',
    },
    {
      label: 'AI Chat',
      icon: Sparkles,
      path: 'chat',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20 hover:border-amber-500/50 hover:bg-amber-500/20',
    },
    {
      label: 'Topics',
      icon: Tag,
      path: 'topics',
      color: 'text-fuchsia-400',
      bg: 'bg-fuchsia-500/10 border-fuchsia-500/20 hover:border-fuchsia-500/50 hover:bg-fuchsia-500/20',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-white">Project Overview</h1>
            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${
              project.status === 'active'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
            }`}>
              {project.status}
            </span>
          </div>
          <p className="text-zinc-400">{project.description || 'Welcome to your research environment.'}</p>
        </div>
        <div className="flex items-center gap-1.5 text-zinc-500 text-xs flex-shrink-0 mt-1.5">
          <Calendar size={13} />
          <span>
            {new Date(
              project.created_at.endsWith('Z') ? project.created_at : project.created_at + 'Z'
            ).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface_container border border-[#161f33] p-5 rounded-2xl flex items-center gap-4 hover:border-indigo-500/30 transition-colors shadow-sm">
          <div className="p-2.5 bg-indigo-500/10 rounded-xl">
            <FileText className="text-indigo-400" size={20} />
          </div>
          <div>
            <p className="text-zinc-400 text-xs font-medium mb-0.5">Papers</p>
            <p className="text-2xl font-bold text-white">{project.paper_count}</p>
          </div>
        </div>

        <div className="bg-surface_container border border-[#161f33] p-5 rounded-2xl flex items-center gap-4 hover:border-emerald-500/30 transition-colors shadow-sm">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl">
            <Database className="text-emerald-400" size={20} />
          </div>
          <div>
            <p className="text-zinc-400 text-xs font-medium mb-0.5">Documents</p>
            <p className="text-2xl font-bold text-white">{project.document_count}</p>
          </div>
        </div>

        <div className="bg-surface_container border border-[#161f33] p-5 rounded-2xl flex items-center gap-4 hover:border-fuchsia-500/30 transition-colors shadow-sm">
          <div className="p-2.5 bg-fuchsia-500/10 rounded-xl">
            <Hash className="text-fuchsia-400" size={20} />
          </div>
          <div>
            <p className="text-zinc-400 text-xs font-medium mb-0.5">Topics</p>
            <p className="text-2xl font-bold text-white">{isLoading ? '—' : topics.length}</p>
          </div>
        </div>

        <div className="bg-surface_container border border-[#161f33] p-5 rounded-2xl flex items-center gap-4 hover:border-amber-500/30 transition-colors shadow-sm">
          <div className="p-2.5 bg-amber-500/10 rounded-xl">
            <MessageSquare className="text-amber-400" size={20} />
          </div>
          <div>
            <p className="text-zinc-400 text-xs font-medium mb-0.5">Chat Sessions</p>
            <p className="text-2xl font-bold text-white">{isLoading ? '—' : sessions.length}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map(action => (
            <button
              key={action.path}
              onClick={() => navigate(`/dashboard/projects/${projectId}/${action.path}`)}
              className={`flex items-center gap-3 p-4 rounded-2xl border ${action.bg} transition-all text-left`}
            >
              <action.icon size={18} className={action.color} />
              <span className={`font-medium text-sm ${action.color}`}>{action.label}</span>
              <ArrowRight size={14} className={`ml-auto ${action.color} opacity-60`} />
            </button>
          ))}
        </div>
      </div>

      {/* Recent Chats + Topics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Chats */}
        <div className="bg-surface_container_high border border-[#161f33] p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Recent Chats</h3>
            <button
              onClick={() => navigate(`/dashboard/projects/${projectId}/chat`)}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="animate-spin text-zinc-500" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-6">
              <MessageSquare size={28} className="text-zinc-600 mx-auto mb-2" />
              <p className="text-zinc-500 text-sm">No chats yet</p>
              <button
                onClick={() => navigate(`/dashboard/projects/${projectId}/chat`)}
                className="mt-3 text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                Start your first chat →
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.slice(0, 4).map(session => (
                <button
                  key={session.id}
                  onClick={() => navigate(`/dashboard/projects/${projectId}/chat`)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface_container transition-colors text-left group"
                >
                  <div className="p-1.5 bg-amber-500/10 rounded-lg flex-shrink-0">
                    <Sparkles size={13} className="text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate group-hover:text-amber-300 transition-colors">
                      {session.title || 'Untitled Chat'}
                    </p>
                    <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                      <Clock size={10} />
                      {getTimeAgo(session.updated_at)}
                    </p>
                  </div>
                  <ArrowRight size={13} className="text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Topics */}
        <div className="bg-surface_container_high border border-[#161f33] p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Research Topics</h3>
            <button
              onClick={() => navigate(`/dashboard/projects/${projectId}/topics`)}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="animate-spin text-zinc-500" />
            </div>
          ) : topics.length === 0 ? (
            <div className="text-center py-6">
              <Tag size={28} className="text-zinc-600 mx-auto mb-2" />
              <p className="text-zinc-500 text-sm">No topics yet</p>
              <button
                onClick={() => navigate(`/dashboard/projects/${projectId}/topics`)}
                className="mt-3 text-xs text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
              >
                Create your first topic →
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topics.map(topic => (
                <span
                  key={topic.id}
                  className="px-3 py-1.5 bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-300 text-xs font-medium rounded-full"
                >
                  {topic.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Research Goal */}
      {project.research_goal && (
        <div className="bg-surface_container_high border border-[#161f33] p-6 rounded-2xl">
          <h3 className="text-sm font-semibold text-white mb-3">Research Goal</h3>
          <p className="text-zinc-300 leading-relaxed bg-surface_container_lowest p-4 rounded-xl border border-[#212c43] shadow-inner text-sm">
            {project.research_goal}
          </p>
        </div>
      )}
    </div>
  );
}

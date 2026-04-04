import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { useNavigate } from 'react-router-dom';
import { Folder, FileText, Database, Loader2, ArrowRight, Plus, Sparkles, Clock } from 'lucide-react';
import NewProjectModal from '../components/modals/NewProjectModal';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  paper_count: number;
  document_count: number;
  created_at: string;
  updated_at: string;
}

interface RecentSession {
  id: string;
  project_id: string;
  project_name: string;
  title: string | null;
  updated_at: string;
}

export default function DashboardPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { document.title = 'Dashboard | ResearchHub'; }, []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = await getToken();
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
        const headers = { 'Authorization': `Bearer ${token}` };

        const [projectsRes, sessionsRes] = await Promise.all([
          fetch(`${apiUrl}/projects`, { headers }),
          fetch(`${apiUrl}/activity/recent-sessions?limit=4`, { headers }),
        ]);

        if (projectsRes.ok) setProjects(await projectsRes.json());
        if (sessionsRes.ok) setRecentSessions(await sessionsRes.json());
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [getToken]);

  const totalPapers = projects.reduce((sum, p) => sum + p.paper_count, 0);
  const totalDocs = projects.reduce((sum, p) => sum + p.document_count, 0);

  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 4);

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

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in zoom-in-95 duration-300">
      <h1 className="text-3xl font-bold font-display text-white mb-2">Welcome Back</h1>
      <p className="text-zinc-400 mb-8">Access your recent projects and synthesize new research.</p>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-surface_container border border-[#161f33] rounded-2xl p-6 flex items-center gap-4 hover:border-indigo-500/30 transition-colors">
              <div className="p-3 bg-indigo-500/10 rounded-xl">
                <Folder className="text-indigo-400" size={24} />
              </div>
              <div>
                <p className="text-zinc-400 text-sm font-medium mb-1">Total Projects</p>
                <p className="text-3xl font-bold text-white tracking-tight">{projects.length}</p>
              </div>
            </div>
            <div className="bg-surface_container border border-[#161f33] rounded-2xl p-6 flex items-center gap-4 hover:border-emerald-500/30 transition-colors">
              <div className="p-3 bg-emerald-500/10 rounded-xl">
                <FileText className="text-emerald-400" size={24} />
              </div>
              <div>
                <p className="text-zinc-400 text-sm font-medium mb-1">Accepted Papers</p>
                <p className="text-3xl font-bold text-white tracking-tight">{totalPapers}</p>
              </div>
            </div>
            <div className="bg-surface_container border border-[#161f33] rounded-2xl p-6 flex items-center gap-4 hover:border-orange-500/30 transition-colors">
              <div className="p-3 bg-orange-500/10 rounded-xl">
                <Database className="text-orange-400" size={24} />
              </div>
              <div>
                <p className="text-zinc-400 text-sm font-medium mb-1">Uploaded Docs</p>
                <p className="text-3xl font-bold text-white tracking-tight">{totalDocs}</p>
              </div>
            </div>
          </div>

          {/* Continue where you left off */}
          {recentSessions.length > 0 && (
            <div className="mb-10">
              <h2 className="text-lg font-bold text-white mb-4">Continue where you left off</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recentSessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => navigate(`/dashboard/projects/${session.project_id}/chat`)}
                    className="group flex items-center gap-4 bg-surface_container border border-[#161f33] rounded-2xl p-4 text-left hover:border-amber-500/30 hover:bg-surface_container_low transition-all"
                  >
                    <div className="p-2.5 bg-amber-500/10 rounded-xl flex-shrink-0">
                      <Sparkles size={18} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white group-hover:text-amber-300 transition-colors truncate">
                        {session.title || 'Untitled Chat'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Folder size={11} className="text-zinc-500 flex-shrink-0" />
                        <span className="text-xs text-zinc-500 truncate">{session.project_name}</span>
                        <span className="text-zinc-600 text-xs">·</span>
                        <Clock size={11} className="text-zinc-500 flex-shrink-0" />
                        <span className="text-xs text-zinc-500">{getTimeAgo(session.updated_at)}</span>
                      </div>
                    </div>
                    <ArrowRight size={15} className="text-zinc-600 group-hover:text-amber-400 flex-shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent Projects */}
          {projects.length === 0 ? (
            <div className="border-2 border-dashed border-[#161f33] rounded-2xl p-12 text-center bg-surface_container/30 mb-10">
              <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Folder className="text-indigo-400" size={32} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No projects yet</h3>
              <p className="text-zinc-400 text-sm max-w-sm mx-auto mb-6">
                Create your first research project to start organizing papers, uploading documents, and chatting with your AI assistant.
              </p>
              <button
                onClick={() => setIsNewProjectModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-gradient text-white rounded-xl font-medium shadow-[0_0_16px_rgba(167,165,255,0.2)] hover:shadow-[0_0_24px_rgba(167,165,255,0.4)] transition-all"
              >
                <Plus size={16} />
                Create your first project
              </button>
            </div>
          ) : (
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Recent Projects</h2>
                <button
                  onClick={() => navigate('/dashboard/projects')}
                  className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  View all <ArrowRight size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recentProjects.map(project => (
                  <button
                    key={project.id}
                    onClick={() => navigate(`/dashboard/projects/${project.id}`)}
                    className="group bg-surface_container border border-[#161f33] rounded-2xl p-5 text-left hover:border-indigo-500/30 hover:bg-surface_container_low transition-all"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">
                        {project.name}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${
                        project.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                      }`}>
                        {project.status}
                      </span>
                    </div>
                    {project.description && (
                      <p className="text-xs text-zinc-500 line-clamp-1 mb-3">{project.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <FileText size={12} className="text-indigo-400" />
                        {project.paper_count} papers
                      </span>
                      <span className="flex items-center gap-1">
                        <Database size={12} className="text-indigo-400" />
                        {project.document_count} docs
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

        </>
      )}

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
      />
    </div>
  );
}

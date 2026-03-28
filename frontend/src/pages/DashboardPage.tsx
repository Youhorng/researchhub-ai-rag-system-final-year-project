import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { useNavigate } from 'react-router-dom';
import { Folder, FileText, Database, Loader2, ArrowRight } from 'lucide-react';

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

export default function DashboardPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const token = await getToken();
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
        const res = await fetch(`${apiUrl}/projects`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
        }
      } catch (err) {
        console.error('Failed to fetch projects', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, [getToken]);

  const totalPapers = projects.reduce((sum, p) => sum + p.paper_count, 0);
  const totalDocs = projects.reduce((sum, p) => sum + p.document_count, 0);

  // Sort by most recently updated for "recent projects"
  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 4);

  const handleCopyToken = async () => {
    const token = await getToken();
    if (token) {
      await navigator.clipboard.writeText(token);
      alert('JWT token copied to clipboard! Use it in Postman as:\nAuthorization: Bearer <token>');
    }
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

          {/* Recent Projects */}
          {recentProjects.length > 0 && (
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

          {/* Developer Tools */}
          <div className="bg-surface_container_low rounded-2xl p-6 border border-[#161f33] max-w-lg">
            <h3 className="font-bold text-white mb-2">Developer Tools</h3>
            <p className="text-sm text-zinc-400 mb-6">
              Use your JWT session token to authenticate with the backend API.
            </p>
            <button
              onClick={handleCopyToken}
              className="w-full py-3 bg-primary-gradient shadow-lg hover:shadow-xl text-white rounded-xl font-medium transition-all"
            >
              Copy JWT Token
            </button>
          </div>
        </>
      )}
    </div>
  );
}

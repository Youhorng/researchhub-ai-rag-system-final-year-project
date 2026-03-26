import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { useNavigate } from 'react-router-dom';
import { Search, Folder, FileText, Calendar, Loader2, Database, Trash2 } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  paper_count: number;
  document_count: number;
  created_at: string;
}

export default function ProjectsPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const token = await getToken();
        // Fallback to localhost if env URL isn't set
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
        
        const res = await fetch(`${apiUrl}/projects`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!res.ok) throw new Error('Failed to fetch projects');
        const data = await res.json();
        setProjects(data);
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching projects.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, [getToken]);

  const handleDeleteProject = async (projectId: string) => {
    setIsDeleting(projectId);
    try {
      const token = await getToken();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      
      const res = await fetch(`${apiUrl}/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!res.ok) throw new Error('Failed to delete project');
      
      // Update local state to remove the deleted project
      setProjects(prev => prev.filter(p => p.id !== projectId));
      setProjectToDelete(null);
    } catch (err) {
      console.error(err);
      alert('Failed to delete project.');
    } finally {
      setIsDeleting(null);
    }
  };

  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header section with Title and Search Bar aligned correctly */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
            <Folder className="text-primary" size={24} />
          </div>
          <div>
             <h1 className="text-2xl font-bold text-white tracking-tight">Projects</h1>
             <p className="text-zinc-400 text-sm mt-0.5">Manage your research projects</p>
          </div>
        </div>
        
        <div className="relative w-full sm:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="text-zinc-500" size={18} />
          </div>
          <input
            type="text"
            className="w-full bg-surface_container_high border border-[#161f33] rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 text-sm transition-colors shadow-sm"
            placeholder="Search projects by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-sm flex justify-center">
          {error}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-[#161f33] rounded-2xl bg-surface_container/50">
          <Folder className="text-zinc-600 mb-4" size={48} />
          <h3 className="text-lg font-medium text-white mb-2">No projects found</h3>
          <p className="text-zinc-400 text-sm max-w-sm">
            {searchQuery ? `We couldn't find any projects matching "${searchQuery}".` : 'Get started by creating a new research project from the sidebar.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-max">
          {filteredProjects.map((project) => (
            <div 
              key={project.id} 
              className="group bg-surface_container border border-[#161f33] rounded-2xl p-6 hover:border-indigo-500/50 hover:bg-surface_container_low transition-all shadow-sm hover:shadow-[0_8px_30px_-12px_rgba(99,102,241,0.3)] flex flex-col h-full"
            >
              <div className="flex items-start justify-between mb-4 gap-4">
                <h3 className="text-lg font-bold text-white line-clamp-2 leading-tight group-hover:text-indigo-400 transition-colors">
                  {project.name}
                </h3>
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap flex-shrink-0 ${
                  project.status === 'active' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                }`}>
                  {project.status}
                </span>
              </div>
              
              <div className="flex flex-col gap-3 mb-6 mt-auto">
                <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                  <div className="flex items-center gap-2 text-zinc-400 bg-surface_container_high px-3 py-1.5 rounded-lg border border-[#161f33] flex-1 sm:flex-none justify-center sm:justify-start">
                     <FileText size={14} className="text-indigo-400 flex-shrink-0" />
                     <span className="text-xs font-semibold">{project.paper_count} <span className="font-normal text-zinc-500">Papers</span></span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-400 bg-surface_container_high px-3 py-1.5 rounded-lg border border-[#161f33] flex-1 sm:flex-none justify-center sm:justify-start">
                     <Database size={14} className="text-indigo-400 flex-shrink-0" />
                     <span className="text-xs font-semibold">{project.document_count} <span className="font-normal text-zinc-500">Docs</span></span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-zinc-500 pl-1 mt-1">
                   <Calendar size={14} />
                   <span className="text-xs font-medium">
                     Created {new Date(project.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                   </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => navigate(`/dashboard/projects/${project.id}`)}
                  className="flex-1 flex items-center justify-center gap-2 bg-surface_container_high hover:bg-surface_container_highest border border-[#161f33] text-white py-2.5 rounded-xl text-sm font-medium transition-colors group-hover:border-indigo-500/30 group-hover:text-indigo-300 group-hover:bg-indigo-500/10"
                >
                  Open Project
                </button>
                <button 
                  onClick={() => setProjectToDelete(project)}
                  disabled={isDeleting === project.id}
                  className="w-12 flex-shrink-0 flex items-center justify-center bg-surface_container_high hover:bg-red-500/10 border border-[#161f33] hover:border-red-500/30 text-zinc-400 hover:text-red-400 rounded-xl transition-colors disabled:opacity-50"
                  title="Delete Project"
                >
                  {isDeleting === project.id ? <Loader2 size={18} className="animate-spin text-red-400" /> : <Trash2 size={18} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface_container border border-[#161f33] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <Trash2 className="text-red-500" size={24} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Delete Project</h2>
              <p className="text-zinc-400 text-sm">
                Are you sure you want to permanently delete "<span className="text-white font-medium">{projectToDelete.name}</span>"? 
                This action cannot be undone and will permanently remove all associated papers and documents.
              </p>
            </div>
            <div className="p-4 border-t border-[#161f33] bg-surface_container_high flex justify-end gap-3">
              <button 
                type="button"
                disabled={isDeleting === projectToDelete.id}
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 bg-surface_container hover:bg-surface_container_highest border border-[#161f33] text-zinc-300 hover:text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={isDeleting === projectToDelete.id}
                onClick={() => handleDeleteProject(projectToDelete.id)}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium shadow-[0_0_16px_rgba(239,68,68,0.2)] transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isDeleting === projectToDelete.id ? <Loader2 size={16} className="animate-spin" /> : null}
                {isDeleting === projectToDelete.id ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

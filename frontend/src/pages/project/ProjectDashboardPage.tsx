import { useOutletContext } from 'react-router-dom';
import { FileText, Database, Calendar } from 'lucide-react';

export default function ProjectDashboardPage() {
  const { project } = useOutletContext<{ project: any }>();

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Project Overview</h1>
        <p className="text-zinc-400">{project.description || 'Welcome to your research environment.'}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-surface_container border border-[#161f33] p-6 rounded-2xl flex items-center gap-4 hover:border-indigo-500/30 transition-colors shadow-sm">
          <div className="p-3 bg-indigo-500/10 rounded-xl">
            <FileText className="text-indigo-400" size={24} />
          </div>
          <div>
            <p className="text-zinc-400 text-sm font-medium mb-1">Indexed Papers</p>
            <p className="text-3xl font-bold text-white tracking-tight">{project.paper_count}</p>
          </div>
        </div>
        
        <div className="bg-surface_container border border-[#161f33] p-6 rounded-2xl flex items-center gap-4 hover:border-emerald-500/30 transition-colors shadow-sm">
          <div className="p-3 bg-emerald-500/10 rounded-xl">
            <Database className="text-emerald-400" size={24} />
          </div>
          <div>
            <p className="text-zinc-400 text-sm font-medium mb-1">Uploaded Docs</p>
            <p className="text-3xl font-bold text-white tracking-tight">{project.document_count}</p>
          </div>
        </div>

        <div className="bg-surface_container border border-[#161f33] p-6 rounded-2xl flex items-center gap-4 hover:border-orange-500/30 transition-colors shadow-sm">
          <div className="p-3 bg-orange-500/10 rounded-xl">
            <Calendar className="text-orange-400" size={24} />
          </div>
          <div>
            <p className="text-zinc-400 text-sm font-medium mb-1">Created At</p>
            <p className="text-lg font-bold text-white">
              {new Date(project.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>
        </div>
      </div>

      {project.research_goal && (
         <div className="bg-surface_container_high border border-[#161f33] p-6 rounded-2xl">
           <h3 className="text-lg font-bold text-white mb-3">Research Goal</h3>
           <p className="text-zinc-300 leading-relaxed bg-surface_container_lowest p-5 rounded-xl border border-[#212c43] shadow-inner">
             {project.research_goal}
           </p>
         </div>
      )}
    </div>
  );
}

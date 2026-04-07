import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useParams, useNavigate } from 'react-router-dom';
import { useAuth, UserButton } from '@clerk/react';
import { LayoutDashboard, BookOpen, Tag, Sparkles, Settings, Menu, Sidebar, X, ArrowLeft, Loader2 } from 'lucide-react';

export default function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const location = useLocation();
  const currentPath = location.pathname;
  const { getToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const token = await getToken();
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
        const res = await fetch(`${apiUrl}/projects/${projectId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch project');
        const data = await res.json();
        setProject(data);
      } catch (err) {
        console.error(err);
        navigate('/dashboard/projects');
      } finally {
        setIsLoading(false);
      }
    };
    if (projectId) fetchProject();
  }, [projectId, getToken, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  const navItems = [
    { name: 'Dashboard', path: `/dashboard/projects/${projectId}`, icon: LayoutDashboard, exact: true },
    { name: 'Knowledge Base', path: `/dashboard/projects/${projectId}/knowledge`, icon: BookOpen, exact: false },
    { name: 'Topics', path: `/dashboard/projects/${projectId}/topics`, icon: Tag, exact: false },
    { name: 'AI Chat', path: `/dashboard/projects/${projectId}/chat`, icon: Sparkles, exact: false },
    { name: 'Settings', path: `/dashboard/projects/${projectId}/settings`, icon: Settings, exact: false },
  ];

  return (
    <div className="min-h-screen bg-surface flex text-on_surface font-sans overflow-hidden">
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 bg-black/50 z-30 lg:hidden cursor-default"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`fixed lg:relative inset-y-0 left-0 z-40 transition-all duration-300 ease-in-out flex flex-col flex-shrink-0 bg-surface_container_low border-[#161f33] overflow-x-hidden whitespace-nowrap
        ${isSidebarOpen ? 'w-64 translate-x-0 border-r' : 'w-0 -translate-x-full lg:translate-x-0 lg:w-20 lg:border-r'}
      `}>
        {/* Header area with Logo and Collapse Icon */}
        <div className={`h-14 border-b border-[#161f33] flex items-center px-4 ${isSidebarOpen ? 'justify-between' : 'justify-center'} flex-shrink-0 w-full`}>
          {isSidebarOpen && (
             <div className="flex items-center gap-3">
               <img src="/main_logo.webp" alt="Logo" className="w-10 h-10 object-contain rounded-lg shadow-sm flex-shrink-0" />
               <div className="flex flex-col">
                 <span className="font-bold text-base text-white leading-tight tracking-tight">ResearchHub</span>
                 <span className="text-[9px] font-bold text-primary tracking-widest uppercase mt-0.5">Project View</span>
               </div>
             </div>
          )}
          
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Toggle sidebar"
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-surface_container_high transition-colors hidden lg:flex flex-shrink-0"
          >
            <Sidebar size={20} />
          </button>

          <button
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close sidebar"
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-surface_container_high transition-colors lg:hidden absolute top-3 right-4 z-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="h-full py-6 flex flex-col overflow-y-auto w-full">
          {/* Back to Projects Button */}
          <div className="px-4 mb-8">
            <Link 
              to="/dashboard/projects"
              className={`w-full flex items-center justify-center gap-2 bg-surface_container_high text-zinc-300 hover:text-white hover:bg-surface_container_highest border border-[#161f33] font-medium ${isSidebarOpen ? 'py-2.5 px-4' : 'p-2.5'} rounded-xl transition-all shadow-sm`}
            >
              <ArrowLeft size={18} className="flex-shrink-0" />
              {isSidebarOpen && <span>Back to Projects</span>}
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-2 px-3">
            {navItems.map((item) => {
              const isActive = item.exact ? currentPath === item.path : currentPath.startsWith(item.path);
              
              return (
                <Link 
                  key={item.name} 
                  to={item.path}
                  className={`flex items-center gap-3 ${isSidebarOpen ? 'px-4 py-3.5' : 'p-3.5 justify-center'} rounded-xl font-medium transition-all ${
                    isActive 
                      ? 'bg-primary-gradient text-white shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)]' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface_container_high'
                  }`}
                  title={isSidebarOpen ? undefined : item.name}
                >
                  <item.icon size={20} className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-zinc-500'}`} strokeWidth={isActive ? 2.5 : 2} />
                  {isSidebarOpen && <span>{item.name}</span>}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Bar Header */}
        <header className="h-14 border-b border-[#161f33] bg-surface/80 backdrop-blur-md flex items-center justify-between px-8 flex-shrink-0 z-10 w-full transition-all duration-300">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open menu"
              className="text-zinc-400 hover:text-white p-2 rounded-lg hover:bg-surface_container_high transition-colors -ml-2 lg:hidden"
            >
              <Menu size={24} />
            </button>
            <h2 className="text-lg font-bold text-white hidden sm:block">Project Environment</h2>
          </div>
          <div className="flex items-center gap-6">
            <UserButton 
              appearance={{
                elements: {
                  userButtonAvatarBox: "w-10 h-10 border border-zinc-700 shadow-sm"
                }
              }}
            />
          </div>
        </header>

        {/* Page Content View */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 relative">
          <Outlet context={{ project }} />
        </main>
      </div>
    </div>
  );
}

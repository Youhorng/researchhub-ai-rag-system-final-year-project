import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { UserButton } from '@clerk/react';
import { Plus, LayoutDashboard, Folder, Compass, Activity, BarChart3, Settings, Menu, Sidebar, X } from 'lucide-react';
import NewProjectModal from '../components/modals/NewProjectModal';

export default function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const location = useLocation();
  const currentPath = location.pathname;

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    
    // Initial check
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Projects', path: '/dashboard/projects', icon: Folder },
    { name: 'Explore', path: '/dashboard/explore', icon: Compass },
    { name: 'Activity', path: '/dashboard/activity', icon: Activity },
    { name: 'Analytics', path: '/dashboard/analytics', icon: BarChart3 },
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
        {/* Header area with Logo and Collapse Icon - perfectly aligned with top bar */}
        <div className={`h-14 border-b border-[#161f33] flex items-center px-4 ${isSidebarOpen ? 'justify-between' : 'justify-center'} flex-shrink-0 w-full`}>
          {isSidebarOpen && (
            <Link to="/dashboard" className="flex items-center gap-3">
              <img src="/main_logo.webp" alt="Logo" className="w-10 h-10 object-contain rounded-lg shadow-sm flex-shrink-0" />
              <div className="flex flex-col">
                <span className="font-bold text-base text-white leading-tight tracking-tight">ResearchHub</span>
                <span className="text-[9px] font-bold text-zinc-500 tracking-widest uppercase mt-0.5">The Digital Curator</span>
              </div>
            </Link>
          )}
          
          {/* Desktop Toggle Icon */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Toggle sidebar"
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-surface_container_high transition-colors hidden lg:flex flex-shrink-0"
          >
            <Sidebar size={20} />
          </button>

          {/* Mobile Close Icon */}
          <button
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close sidebar"
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-surface_container_high transition-colors lg:hidden absolute top-3 right-4 z-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="h-full py-6 flex flex-col overflow-y-auto w-full">
          {/* New Project Button */}
          <div className="px-4 mb-8">
            <button 
              onClick={() => setIsNewProjectModalOpen(true)}
              className={`w-full flex items-center justify-center gap-2 bg-primary-gradient text-white font-medium ${isSidebarOpen ? 'py-2.5 px-4' : 'p-2.5'} rounded-xl shadow-[0_0_16px_rgba(167,165,255,0.2)] hover:shadow-[0_0_24px_rgba(167,165,255,0.4)] transition-all`}
            >
              <Plus size={18} strokeWidth={2.5} className="flex-shrink-0" />
              {isSidebarOpen && <span>New Project</span>}
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-2 px-3">
            {navItems.map((item) => {
              // Active rule: exact match or subpath match for others. 
              // Simplest is exact match for dashboard, startswith for others.
              const isActive = item.path === '/dashboard' ? currentPath === '/dashboard' : currentPath.startsWith(item.path);
              
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
          </div>
          <div className="flex items-center gap-6">
            <button aria-label="Settings" className="text-zinc-400 hover:text-white transition-colors bg-surface_container_high p-2 rounded-full border border-zinc-800">
              <Settings size={20} />
            </button>
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
        <main className="flex-1 overflow-y-auto p-8 relative">
          <Outlet />
        </main>
      </div>

      <NewProjectModal 
        isOpen={isNewProjectModalOpen} 
        onClose={() => setIsNewProjectModalOpen(false)} 
      />
    </div>
  );
}

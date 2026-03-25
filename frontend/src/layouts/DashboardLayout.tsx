import { Outlet, Link, useLocation } from 'react-router-dom';
import { UserButton } from '@clerk/react';
import { Plus, LayoutDashboard, Folder, BookOpen, Sparkles, Settings } from 'lucide-react';

export default function DashboardLayout() {
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Projects', path: '/dashboard/projects', icon: Folder },
    { name: 'Knowledge Base', path: '/dashboard/knowledge', icon: BookOpen },
    { name: 'AI Chat', path: '/dashboard/chat', icon: Sparkles },
  ];

  return (
    <div className="min-h-screen bg-surface flex text-on_surface font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-[#161f33] bg-surface_container_low flex flex-col flex-shrink-0">
        <div className="p-6">
          {/* Branding */}
          <Link to="/dashboard" className="flex items-center gap-3 mb-10">
            <img src="/main_logo.png" alt="Logo" className="w-10 h-10 object-contain rounded-lg shadow-md" />
            <div className="flex flex-col">
              <span className="font-bold text-xl text-white leading-tight tracking-tight">ResearchHub</span>
              <span className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mt-0.5">The Digital Curator</span>
            </div>
          </Link>

          {/* New Project Button */}
          <button className="w-full mb-8 flex items-center justify-center gap-2 bg-primary-gradient text-white font-medium py-3 px-4 rounded-xl shadow-[0_0_16px_rgba(167,165,255,0.2)] hover:shadow-[0_0_24px_rgba(167,165,255,0.4)] transition-all">
            <Plus size={18} strokeWidth={2.5} />
            <span>New Project</span>
          </button>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              // Active rule: exact match or subpath match for others. 
              // Simplest is exact match for dashboard, startswith for others.
              const isActive = item.path === '/dashboard' ? currentPath === '/dashboard' : currentPath.startsWith(item.path);
              
              return (
                <Link 
                  key={item.name} 
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all ${
                    isActive 
                      ? 'bg-primary-gradient text-white shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)]' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface_container_high'
                  }`}
                >
                  <item.icon size={20} className={isActive ? 'text-white' : 'text-zinc-500'} strokeWidth={isActive ? 2.5 : 2} />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Bar Header */}
        <header className="h-20 border-b border-[#161f33] bg-surface/80 backdrop-blur-md flex items-center justify-between px-8 flex-shrink-0 z-10 w-full">
          <div>
             {/* Left side of top bar is empty because branding is in the sidebar */}
          </div>
          <div className="flex items-center gap-6">
            <button className="text-zinc-400 hover:text-white transition-colors bg-surface_container_high p-2 rounded-full border border-zinc-800">
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
    </div>
  );
}

import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-surface flex flex-col md:flex-row">
      {/* Left side: branding/editorial tension */}
      <div className="hidden md:flex w-full md:w-3/5 flex-col justify-center p-12 md:p-24 relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-[-20%] left-[-10%] w-[120%] h-[120%] bg-[radial-gradient(circle_at_0%_0%,rgba(167,165,255,0.08),transparent_50%)] pointer-events-none z-0"></div>
        
        <div className="z-10 max-w-2xl font-display">
          {/* Logo and Brand Name */}
          <div className="flex items-center gap-4 mb-8">
            <img src="/main_logo.webp" alt="ResearchHub Logo" className="w-12 h-12 sm:w-14 sm:h-14 object-contain rounded-lg hover:opacity-90 transition-opacity" />
            <span className="text-white font-bold text-2xl sm:text-3xl tracking-tight">ResearchHub</span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-[4.5rem] font-bold tracking-tight text-white leading-[1.1] mb-8">
            The intelligence layer<br />for your <span className="text-primary">curiosity.</span>
          </h1>
          <p className="font-sans text-xl text-zinc-400 max-w-md leading-relaxed">
            Unify your knowledge base with neural search and AI synthesis. Join the next generation of digital curators.
          </p>
        </div>
      </div>
      
      {/* Right side: floating auth form container */}
      <div className="w-full md:w-2/5 flex items-center justify-center p-4 sm:p-8 md:p-12 lg:p-16 z-10 min-h-screen md:min-h-0">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

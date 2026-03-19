import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2 bg-background">
      {/* Left side: branding/image */}
      <div className="hidden flex-col items-center justify-center bg-zinc-900 text-white md:flex p-10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 to-zinc-900/40 z-0"></div>
        <div className="z-10 text-center max-w-md">
          <h1 className="text-4xl font-bold tracking-tight mb-4">ResearchHub</h1>
          <p className="text-lg text-zinc-400">
            Your centralized AI-powered platform for discovering, analyzing, and synthesizing academic research.
          </p>
        </div>
      </div>
      
      {/* Right side: auth forms */}
      <div className="flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

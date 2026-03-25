import { useAuth } from '@clerk/react';

export default function DashboardPage() {
  const { getToken } = useAuth();

  const handleCopyToken = async () => {
    const token = await getToken();
    if (token) {
      await navigator.clipboard.writeText(token);
      alert('JWT token copied to clipboard! Use it in Postman as:\nAuthorization: Bearer <token>');
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold font-display text-white mb-2">Welcome Back</h1>
      <p className="text-zinc-400 mb-8">Access your recent projects and synthesize new research.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-surface_container_high rounded-2xl p-6 border border-[#212c43]">
          <h3 className="font-bold text-white mb-1">Total Projects</h3>
          <p className="text-3xl font-display text-primary">12</p>
        </div>
        <div className="bg-surface_container_high rounded-2xl p-6 border border-[#212c43]">
          <h3 className="font-bold text-white mb-1">Documents Indexed</h3>
          <p className="text-3xl font-display text-primary">1,402</p>
        </div>
        <div className="bg-surface_container_high rounded-2xl p-6 border border-[#212c43]">
          <h3 className="font-bold text-white mb-1">Knowledge Bases</h3>
          <p className="text-3xl font-display text-primary">4</p>
        </div>
      </div>

      <div className="bg-surface_container_low rounded-2xl p-6 border border-[#212c43] max-w-lg">
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
    </div>
  );
}


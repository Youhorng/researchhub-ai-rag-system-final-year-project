import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import AuthLayout from './layouts/AuthLayout'
import SignInPage from './pages/SignInPage'
import SignUpPage from './pages/SignUpPage'
import DashboardLayout from './layouts/DashboardLayout'
import DashboardPage from './pages/DashboardPage'
import ProjectsPage from './pages/ProjectsPage'
import ExplorePage from './pages/dashboard/ExplorePage'
import ActivityPage from './pages/dashboard/ActivityPage'
import AnalyticsPage from './pages/dashboard/AnalyticsPage'
import PaperDetailPage from './pages/dashboard/PaperDetailPage'
import ProjectLayout from './layouts/ProjectLayout'
import ProjectDashboardPage from './pages/project/ProjectDashboardPage'
import KnowledgeBasePage from './pages/project/KnowledgeBasePage'
import TopicsPage from './pages/project/TopicsPage'
import ChatPage from './pages/project/ChatPage'
import SettingsPage from './pages/project/SettingsPage'

function Home() {
  const { isSignedIn } = useAuth()

  if (isSignedIn) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-surface text-on_surface p-4 font-sans relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[120%] h-[120%] bg-[radial-gradient(circle_at_50%_50%,rgba(167,165,255,0.08),transparent_50%)] pointer-events-none z-0"></div>
      
      <div className="z-10 flex flex-col items-center text-center">
        <img 
          src="/main_logo.png" 
          alt="ResearchHub Logo" 
          className="w-16 h-16 object-contain drop-shadow-[0_0_24px_rgba(167,165,255,0.25)] mb-6" 
        />
        <h1 className="text-6xl font-bold mb-4 tracking-tight font-display text-white">ResearchHub</h1>
        <p className="text-zinc-400 mb-8 max-w-lg text-center text-lg">
          The centralized AI platform for your academic research. Please sign in or create an account to continue.
        </p>
        <div className="flex gap-4">
          <a href="/sign-in" className="px-6 py-3 bg-primary-gradient text-white rounded-xl font-medium shadow-[0_0_16px_rgba(167,165,255,0.2)] hover:shadow-[0_0_24px_rgba(167,165,255,0.4)] transition-all">Sign In</a>
          <a href="/sign-up" className="px-6 py-3 bg-surface_container_high text-white hover:bg-surface_bright border border-[#212c43] rounded-xl font-medium transition-all">Sign Up</a>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      
      {/* Authentication */}
      <Route element={<AuthLayout />}>
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
      </Route>

      {/* Authenticated Dashboard */}
      <Route element={<DashboardLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        {/* Sub-routes */}
        <Route path="/dashboard/projects" element={<ProjectsPage />} />
        <Route path="/dashboard/explore" element={<ExplorePage />} />
        <Route path="/dashboard/explore/paper/:arxivId" element={<PaperDetailPage />} />
        <Route path="/dashboard/activity" element={<ActivityPage />} />
        <Route path="/dashboard/analytics" element={<AnalyticsPage />} />
      </Route>

      {/* Authenticated Project Sub-App */}
      <Route path="/dashboard/projects/:projectId" element={<ProjectLayout />}>
        <Route index element={<ProjectDashboardPage />} />
        <Route path="knowledge" element={<KnowledgeBasePage />} />
        <Route path="topics" element={<TopicsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

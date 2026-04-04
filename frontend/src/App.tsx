import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AuthLayout from './layouts/AuthLayout'
import DashboardLayout from './layouts/DashboardLayout'
import ProjectLayout from './layouts/ProjectLayout'

// Lazily loaded pages — each becomes its own JS chunk loaded on demand
const LandingPage           = lazy(() => import('./pages/LandingPage'))
const SignInPage             = lazy(() => import('./pages/SignInPage'))
const SignUpPage             = lazy(() => import('./pages/SignUpPage'))
const DashboardPage          = lazy(() => import('./pages/DashboardPage'))
const ProjectsPage           = lazy(() => import('./pages/ProjectsPage'))
const ExplorePage            = lazy(() => import('./pages/dashboard/ExplorePage'))
const ActivityPage           = lazy(() => import('./pages/dashboard/ActivityPage'))
const AnalyticsPage          = lazy(() => import('./pages/dashboard/AnalyticsPage'))
const PaperDetailPage        = lazy(() => import('./pages/dashboard/PaperDetailPage'))
const ProjectDashboardPage   = lazy(() => import('./pages/project/ProjectDashboardPage'))
const KnowledgeBasePage      = lazy(() => import('./pages/project/KnowledgeBasePage'))
const TopicsPage             = lazy(() => import('./pages/project/TopicsPage'))
const ChatPage               = lazy(() => import('./pages/project/ChatPage'))
const SettingsPage           = lazy(() => import('./pages/project/SettingsPage'))

// Minimal dark spinner shown while a chunk is loading
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-surface">
      <div className="w-8 h-8 rounded-full border-2 border-[#212c43] border-t-primary animate-spin" />
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        {/* Authentication */}
        <Route element={<AuthLayout />}>
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route path="/sign-up/*" element={<SignUpPage />} />
        </Route>

        {/* Authenticated Dashboard */}
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
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
    </Suspense>
  )
}

export default App

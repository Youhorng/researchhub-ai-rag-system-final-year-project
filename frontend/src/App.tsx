import { Routes, Route, Navigate } from 'react-router-dom';
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
import LandingPage from './pages/LandingPage'

function App() {
  return (
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

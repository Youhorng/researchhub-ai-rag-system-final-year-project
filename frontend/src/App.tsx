import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth, UserButton } from '@clerk/react'
import AuthLayout from './layouts/AuthLayout'
import SignInPage from './pages/SignInPage'
import SignUpPage from './pages/SignUpPage'

function Home() {
  const { isSignedIn, getToken } = useAuth()

  const handleCopyToken = async () => {
    const token = await getToken()
    if (token) {
      await navigator.clipboard.writeText(token)
      alert('JWT token copied to clipboard! Use it in Postman as:\nAuthorization: Bearer <token>')
    }
  }

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
        <h1 className="text-4xl font-bold mb-4 tracking-tight">Welcome to ResearchHub</h1>
        <p className="text-zinc-500 mb-8 max-w-lg text-center">
          The centralized AI platform for your academic research. Please sign in or create an account to continue.
        </p>
        <div className="flex gap-4">
          <a href="/sign-in" className="px-6 py-2 bg-zinc-900 text-white rounded-md font-medium hover:bg-zinc-800 transition-colors">Sign In</a>
          <a href="/sign-up" className="px-6 py-2 bg-white text-zinc-900 border border-zinc-200 rounded-md font-medium hover:bg-zinc-50 transition-colors">Sign Up</a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-muted p-4">
      {/* Top Navigation Bar placeholder */}
      <div className="absolute top-0 w-full p-4 flex justify-between items-center bg-white border-b border-zinc-200">
        <div className="font-bold text-xl tracking-tight">ResearchHub</div>
        <UserButton afterSignOutUrl="/" />
      </div>

      <div className="bg-white border border-zinc-200 p-8 rounded-xl shadow-sm max-w-lg w-full text-center mt-16">
        <h1 className="text-3xl font-bold mb-2 tracking-tight">Dashboard</h1>
        <p className="text-green-600 font-medium mb-8">You are successfully signed in!</p>
        
        <div className="bg-zinc-50 rounded-lg p-4 mb-6 border border-zinc-200 text-left">
          <h3 className="font-semibold text-zinc-900 mb-2">API Testing</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Use your JWT token to authenticate with the backend API in tools like Postman.
          </p>
          <button 
            onClick={handleCopyToken} 
            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md font-medium transition-colors"
          >
            Copy JWT Token
          </button>
        </div>

        <div className="text-sm text-zinc-400 text-left bg-zinc-950 p-4 rounded-lg overflow-x-auto format-code">
          <code>GET http://localhost:8000/api/v1/me</code><br />
          <code>Header: Authorization: Bearer &lt;token&gt;</code>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route element={<AuthLayout />}>
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

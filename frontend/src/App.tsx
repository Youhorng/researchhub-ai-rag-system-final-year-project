import { Routes, Route } from 'react-router-dom'
import { SignIn, SignUp, useAuth } from '@clerk/react'

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
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h1>ResearchHub</h1>
        <p>Please sign in or sign up to continue.</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <a href="/sign-in">Sign In</a>
          <a href="/sign-up">Sign Up</a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h1>ResearchHub</h1>
      <p>You are signed in!</p>
      <button onClick={handleCopyToken} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
        Copy JWT Token (for Postman)
      </button>
      <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#666' }}>
        Use the token in Postman: <code>GET http://localhost:8000/api/v1/me</code><br />
        Header: <code>Authorization: Bearer &lt;token&gt;</code>
      </p>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sign-in/*" element={
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/" />
        </div>
      } />
      <Route path="/sign-up/*" element={
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/" />
        </div>
      } />
    </Routes>
  )
}

export default App

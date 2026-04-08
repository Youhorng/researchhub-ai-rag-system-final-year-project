import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { BrowserRouter, useNavigate } from 'react-router-dom'
import './index.css'
import 'katex/dist/katex.min.css'
import App from './App.tsx'

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!CLERK_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env')
}

function ClerkProviderWithRoutes({ children }: { readonly children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <ClerkProvider 
      publishableKey={CLERK_KEY} 
      afterSignOutUrl="/"
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
    >
      {children}
    </ClerkProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ClerkProviderWithRoutes>
        <App />
      </ClerkProviderWithRoutes>
    </BrowserRouter>
  </StrictMode>,
)

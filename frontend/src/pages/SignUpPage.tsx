import { SignUp, ClerkLoaded, ClerkLoading } from '@clerk/react';
import { Loader2 } from 'lucide-react';

export default function SignUpPage() {
  return (
    <div className="w-full flex justify-center">
      <ClerkLoading>
        <div className="flex flex-col items-center justify-center bg-surface_container_high rounded-2xl w-full h-[500px] border border-[#161f33] shadow-[inset_0_1px_0_0_#212c43]">
          <Loader2 className="animate-spin text-primary mb-4" size={36} />
          <p className="text-zinc-400 font-medium font-sans text-sm">Loading security module...</p>
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <SignUp 
      routing="path" 
      path="/sign-up" 
      signInUrl="/sign-in" 
      forceRedirectUrl="/dashboard"
      appearance={{
        variables: {
          colorPrimary: '#a7a5ff',
          colorBackground: '#161f33',
          colorText: '#ffffff',
          colorTextSecondary: '#a1a1aa',
          colorInputBackground: '#000000',
          colorInputText: '#E2E8F0',
          borderRadius: '0.5rem',
        },
        elements: {
          rootBox: 'mx-auto w-full',
          cardBox: 'shadow-none border-none',
          card: 'bg-surface_container_high shadow-[inset_0_1px_0_0_#212c43] w-full p-6 md:p-8',
          headerTitle: 'font-display text-4xl font-bold tracking-tight text-white mb-1',
          headerSubtitle: 'font-sans text-on_surface mt-2 text-base',
          formFieldLabel: 'font-sans text-on_surface font-medium',
          formFieldInput: 'rounded-lg border-none bg-surface_container_lowest px-4 py-3 text-sm text-on_surface placeholder:text-zinc-400 focus:ring-1 focus:ring-primary focus:outline-none transition-all',
          formButtonPrimary: 'font-sans bg-primary-gradient shadow-[0_0_16px_rgba(167,165,255,0.2)] hover:shadow-[0_0_24px_rgba(167,165,255,0.4)] text-white font-medium py-3 rounded-lg transition-all border-none',
          socialButtonsBlockButton: 'font-sans border-none bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] font-medium text-white rounded-lg py-3 transition-colors shadow-none text-white',
          socialButtonsBlockButtonText: 'font-sans font-medium text-white',
          badge: 'text-zinc-200 bg-zinc-800 border-zinc-700',
          footerActionLink: 'font-sans text-primary font-semibold hover:text-primary_dim',
          footerActionText: 'font-sans text-on_surface',
          dividerLine: 'bg-[#212c43]',
          dividerText: 'font-sans text-on_surface',
          formFieldLabelRow: 'font-sans',
          identityPreviewText: 'text-on_surface',
          identityPreviewEditButtonIcon: 'text-primary',
          formResendCodeLink: 'text-primary hover:text-primary_dim font-medium',
        }
      }}
    />
      </ClerkLoaded>
    </div>
  );
}

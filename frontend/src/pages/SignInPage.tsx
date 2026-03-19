import { SignIn } from '@clerk/react';

export default function SignInPage() {
  return (
    <SignIn 
      routing="path" 
      path="/sign-in" 
      signUpUrl="/sign-up" 
      forceRedirectUrl="/"
      appearance={{
        variables: {
          colorPrimary: '#18181b',
          borderRadius: '0.375rem',
        },
        elements: {
          rootBox: 'mx-auto w-full',
          cardBox: 'shadow-none border border-zinc-200',
          card: 'bg-white shadow-none w-full p-6 sm:p-8',
          headerTitle: 'text-3xl font-bold tracking-tight text-zinc-900',
          headerSubtitle: 'text-zinc-500 mt-2',
          formButtonPrimary: 'bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-2 rounded-md transition-colors shadow-none',
          formFieldLabel: 'text-zinc-700 font-medium',
          formFieldInput: 'rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none transition-all',
          socialButtonsBlockButton: 'border border-zinc-200 bg-white hover:bg-zinc-50 font-medium text-zinc-700 rounded-md py-2 transition-colors shadow-none',
          footerActionLink: 'text-zinc-900 font-semibold hover:text-zinc-700',
          identityPreviewEditButtonIcon: 'text-zinc-500',
        }
      }}
    />
  );
}

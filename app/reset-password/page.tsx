import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AppShell } from '@/components/ui/AppShell'
import ResetPasswordClient from '@/components/features/ResetPasswordClient'

export const metadata: Metadata = {
  title: 'Reset Password',
  robots: { index: false },
}

export default function ResetPasswordPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" /></div>}>
        <ResetPasswordClient />
      </Suspense>
    </AppShell>
  )
}

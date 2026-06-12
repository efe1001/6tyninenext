import type { Metadata } from 'next'
import { AppShell } from '@/components/ui/AppShell'
import ResetPasswordClient from '@/components/features/ResetPasswordClient'

export const metadata: Metadata = {
  title: 'Reset Password',
  robots: { index: false },
}

export default function ResetPasswordPage() {
  return (
    <AppShell>
      <ResetPasswordClient />
    </AppShell>
  )
}

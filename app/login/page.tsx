import type { Metadata } from 'next'
import LoginClient from '@/components/features/LoginClient'

export const metadata: Metadata = {
  title: 'Login',
  robots: { index: false },
}

export default function LoginPage() {
  return <LoginClient />
}

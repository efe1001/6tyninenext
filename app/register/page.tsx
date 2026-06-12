import type { Metadata } from 'next'
import RegisterClient from '@/components/features/RegisterClient'

export const metadata: Metadata = {
  title: 'Register',
  robots: { index: false },
}

export default function RegisterPage() {
  return <RegisterClient />
}

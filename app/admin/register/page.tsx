import type { Metadata } from 'next'
import AdminRegisterClient from '@/components/admin/AdminRegisterClient'

export const metadata: Metadata = {
  title: 'Admin Register',
  robots: { index: false },
}

export default function AdminRegisterPage() {
  return <AdminRegisterClient />
}

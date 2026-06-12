import type { Metadata } from 'next'
import AdminLeakManagementClient from '@/components/admin/AdminLeakManagementClient'

export const metadata: Metadata = {
  title: 'Leak Management',
  robots: { index: false },
}

export default function AdminLeaksPage() {
  return <AdminLeakManagementClient />
}

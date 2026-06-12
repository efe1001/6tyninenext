import type { Metadata } from 'next'
import AdminDashboardWrapper from '@/components/admin/AdminDashboardWrapper'

export const metadata: Metadata = {
  title: 'Admin Dashboard',
  robots: { index: false },
}

export default function AdminDashboardPage() {
  return <AdminDashboardWrapper />
}

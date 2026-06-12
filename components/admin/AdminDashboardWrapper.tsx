'use client'

import dynamic from 'next/dynamic'

// ssr: false is only valid in Client Components
const AdminDashboardClient = dynamic(
  () => import('@/components/admin/AdminDashboardClient'),
  {
    ssr: false,
    loading: () => <div className="text-white text-center p-8 min-h-screen bg-[#1C2526]">Loading dashboard...</div>,
  }
)

export default function AdminDashboardWrapper() {
  return <AdminDashboardClient />
}

import type { Metadata } from 'next'
import BlogManagementClient from '@/components/admin/BlogManagementClient'

export const metadata: Metadata = {
  title: 'Blog Management',
  robots: { index: false },
}

export default function AdminBlogPage() {
  return <BlogManagementClient />
}

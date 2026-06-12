import type { Metadata } from 'next'
import { fetchBlogTopics } from '@/lib/api/server'
import { AppShell } from '@/components/ui/AppShell'
import BlogClient from '@/components/features/BlogClient'

export const metadata: Metadata = {
  title: 'Blog — Creator Tips, Guides & News',
  description: 'Read guides, tips, and news for creators and fans on 6tynine.',
  alternates: { canonical: 'https://6tynine.net/blog' },
  openGraph: {
    title: '6tynine Blog',
    description: 'Creator tips, platform guides, and news',
    type: 'website',
  },
}

export default async function BlogPage() {
  const topics = await fetchBlogTopics()
  return (
    <AppShell>
      <BlogClient initialTopics={topics} />
    </AppShell>
  )
}

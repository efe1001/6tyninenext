import type { Metadata } from 'next'
import { fetchBlogTopic } from '@/lib/api/server'
import { AppShell } from '@/components/ui/AppShell'
import BlogTopicClient from '@/components/features/BlogTopicClient'

interface Props {
  params: Promise<{ topicId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topicId } = await params
  const topic = await fetchBlogTopic(topicId) as { title?: string; description?: string } | null

  return {
    title: topic?.title ? `${topic.title} — 6tynine Blog` : 'Blog Topic',
    description: topic?.description ?? 'Read this guide on 6tynine.',
    alternates: { canonical: `https://6tynine.net/blog/topic/${topicId}` },
  }
}

export default async function BlogTopicPage({ params }: Props) {
  const { topicId } = await params
  const initialTopic = await fetchBlogTopic(topicId)

  return (
    <AppShell>
      <BlogTopicClient topicId={topicId} initialTopic={initialTopic} />
    </AppShell>
  )
}

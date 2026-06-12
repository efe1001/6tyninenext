import type { Metadata } from 'next'
import { fetchHashtagPosts } from '@/lib/api/server'
import { AppShell } from '@/components/ui/AppShell'
import HashtagClient from '@/components/features/HashtagClient'

interface Props {
  params: Promise<{ hashtag: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hashtag } = await params
  return {
    title: `#${hashtag} posts`,
    description: `Browse all posts tagged #${hashtag} on 6tynine.`,
    openGraph: {
      title: `#${hashtag} on 6tynine`,
      description: `Browse posts tagged with #${hashtag}`,
    },
    alternates: { canonical: `https://6tynine.net/hashtag/${hashtag}` },
  }
}

export default async function HashtagPage({ params }: Props) {
  const { hashtag } = await params
  const initialPosts = await fetchHashtagPosts(hashtag)

  return (
    <AppShell>
      <HashtagClient hashtag={hashtag} initialPosts={initialPosts} />
    </AppShell>
  )
}

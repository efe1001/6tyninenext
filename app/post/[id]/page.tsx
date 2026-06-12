import type { Metadata } from 'next'
import { fetchPostById } from '@/lib/api/server'
import { AppShell } from '@/components/ui/AppShell'
import SinglePostClient from '@/components/features/SinglePostClient'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const post = await fetchPostById(id) as {
    username?: string
    text?: string
    images?: string[]
    videos?: string[]
  } | null

  if (!post) {
    return { title: 'Post not found', robots: { index: false } }
  }

  const description = post.text?.substring(0, 160) ?? ''
  const image = post.images?.[0] ?? post.videos?.[0]

  return {
    title: `Post by @${post.username ?? 'creator'} on 6tynine`,
    description,
    openGraph: {
      title: `@${post.username ?? 'creator'} on 6tynine`,
      description,
      images: image ? [{ url: image }] : [],
      type: 'article',
    },
    alternates: { canonical: `https://6tynine.net/post/${id}` },
  }
}

export default async function PostPage({ params }: Props) {
  const { id } = await params
  const initialPost = await fetchPostById(id)

  return (
    <AppShell>
      <SinglePostClient postId={id} initialPost={initialPost} />
    </AppShell>
  )
}

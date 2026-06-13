import type { Metadata } from 'next'
import { Suspense } from 'react'
import { fetchPublicProfile } from '@/lib/api/server'
import { AppShell } from '@/components/ui/AppShell'
import ProfileClient from '@/components/features/ProfileClient'

interface Props {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const profile = await fetchPublicProfile(username) as {
    displayName?: string
    username?: string
    bio?: string
    profilePicture?: string
  } | null

  if (!profile) {
    return { title: 'Profile not found', robots: { index: false } }
  }

  const name = profile.displayName ?? profile.username ?? username
  const description = profile.bio || `Subscribe to @${username} on 6tynine for exclusive content.`

  return {
    title: `${name} (@${username})`,
    description,
    openGraph: {
      title: `${name} on 6tynine`,
      description,
      images: profile.profilePicture ? [{ url: profile.profilePicture }] : [],
      type: 'profile',
    },
    alternates: { canonical: `https://6tynine.net/profile/${username}` },
  }
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params
  // Don't block the page render waiting for profile data — client fetches it.
  // generateMetadata above still fetches for SEO; page renders instantly.
  return (
    <AppShell>
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" /></div>}>
        <ProfileClient username={username} initialProfile={null} />
      </Suspense>
    </AppShell>
  )
}

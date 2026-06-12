import type { Metadata } from 'next'
import { AppShell } from '@/components/ui/AppShell'
import ExploreClient from '@/components/features/ExploreClient'

export const metadata: Metadata = {
  title: 'Explore',
  description: 'Discover new creators and trending content on 6tynine.',
  alternates: { canonical: 'https://6tynine.net/explore' },
}

export default function ExplorePage() {
  return (
    <AppShell>
      <ExploreClient />
    </AppShell>
  )
}

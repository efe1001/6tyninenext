import type { Metadata } from 'next'
import { AppShell } from '@/components/ui/AppShell'
import LeakContentClient from '@/components/features/LeakContentClient'

export const metadata: Metadata = {
  title: 'Leaks',
  description: 'Browse exclusive leak content on 6tynine.',
}

export default function LeaksPage() {
  return (
    <AppShell>
      <LeakContentClient />
    </AppShell>
  )
}

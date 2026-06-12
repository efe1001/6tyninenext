import type { Metadata } from 'next'
import { AppShell } from '@/components/ui/AppShell'
import BoostClient from '@/components/features/BoostClient'

export const metadata: Metadata = {
  title: 'Boost Your Profile',
  robots: { index: false },
}

export default function BoostPage() {
  return (
    <AppShell>
      <BoostClient />
    </AppShell>
  )
}

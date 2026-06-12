import type { Metadata } from 'next'
import { AppShell } from '@/components/ui/AppShell'
import LeakContentDetailsClient from '@/components/features/LeakContentDetailsClient'

export const metadata: Metadata = {
  title: 'Leak Details',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function LeakDetailsPage({ params }: Props) {
  const { id } = await params
  return (
    <AppShell>
      <LeakContentDetailsClient leakId={id} />
    </AppShell>
  )
}

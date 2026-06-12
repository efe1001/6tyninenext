import type { Metadata } from 'next'
import { AppShell } from '@/components/ui/AppShell'
import ChatClient from '@/components/features/ChatClient'

export const metadata: Metadata = {
  title: 'Messages',
  robots: { index: false },
}

interface Props {
  params: Promise<{ targetUsername: string }>
}

export default async function ChatWithUserPage({ params }: Props) {
  const { targetUsername } = await params
  return (
    <AppShell>
      <ChatClient targetUsername={targetUsername} />
    </AppShell>
  )
}

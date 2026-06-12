import type { Metadata } from 'next'
import { AppShell } from '@/components/ui/AppShell'
import ChatClient from '@/components/features/ChatClient'

export const metadata: Metadata = {
  title: 'Messages',
  robots: { index: false },
}

export default function ChatPage() {
  return (
    <AppShell>
      <ChatClient />
    </AppShell>
  )
}

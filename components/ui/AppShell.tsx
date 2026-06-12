'use client'

import { type ReactNode } from 'react'
import { Header } from '@/components/layout/Header'
import { BottomNav } from '@/components/layout/BottomNav'
import { AgeVerificationGate } from '@/components/ui/AgeVerificationGate'
import { NotificationToasts } from '@/components/ui/NotificationToasts'
import { NetworkStatusBanner } from '@/components/ui/NetworkStatusBanner'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AgeVerificationGate>
      <div className="min-h-screen bg-[#1C2526] flex flex-col">
        <NetworkStatusBanner />
        <Header />
        <NotificationToasts />
        <main className="flex-1 mt-13 pb-20 overflow-y-auto flex justify-center relative z-0">
          {children}
        </main>
        <BottomNav hideOnAuth />
      </div>
    </AgeVerificationGate>
  )
}

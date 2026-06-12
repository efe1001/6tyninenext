import type { Metadata } from 'next'
import { AppShell } from '@/components/ui/AppShell'
import FAQClient from '@/components/features/FAQClient'

export const metadata: Metadata = {
  title: 'FAQ — Frequently Asked Questions',
  description: 'Find answers to common questions about 6tynine — how subscriptions work, payments, account settings, and more.',
  alternates: { canonical: 'https://6tynine.net/faq' },
  openGraph: {
    title: '6tynine FAQ',
    description: 'Answers to common questions about 6tynine',
    type: 'website',
  },
}

export default function FAQPage() {
  return (
    <AppShell>
      <FAQClient />
    </AppShell>
  )
}

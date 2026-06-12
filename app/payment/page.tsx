import type { Metadata } from 'next'
import { AppShell } from '@/components/ui/AppShell'
import PaymentClient from '@/components/features/PaymentClient'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Wallet & Payments',
  robots: { index: false },
}

export default function PaymentPage() {
  return (
    <AppShell>
      {/* Load Paystack only on payment page */}
      <Script src="https://js.paystack.co/v1/inline.js" strategy="lazyOnload" />
      <PaymentClient />
    </AppShell>
  )
}

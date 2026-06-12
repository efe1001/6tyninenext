import type { Metadata } from 'next'
import Script from 'next/script'
import { Providers } from '@/components/layout/Providers'
import './globals.css'

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? 'G-S6MJ7TF0TE'

export const metadata: Metadata = {
  title: {
    default: '6tynine - Premium Creator Platform | Exclusive Ladies Content',
    template: '%s | 6tynine',
  },
  description:
    '6tynine: Premium subscription platform connecting creators with fans. Exclusive content, live streams, and direct messaging.',
  metadataBase: new URL('https://6tynine.net'),
  keywords: ['6tynine', 'creator platform', 'exclusive content', 'subscription'],
  openGraph: {
    siteName: '6tynine',
    images: [{ url: '/6tyninelogo.png', width: 1200, height: 630 }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/6tyninelogo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#EA580C" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://cdn.6tynine.net" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: '6tynine',
              url: 'https://6tynine.net',
              description: 'Premium subscription platform connecting creators with fans',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://6tynine.net/explore?q={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GTM_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GTM_ID}');
        `}</Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

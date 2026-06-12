import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/payment', '/chat'],
      },
    ],
    sitemap: 'https://6tynine.net/sitemap.xml',
  }
}

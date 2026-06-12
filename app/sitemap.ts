import type { MetadataRoute } from 'next'

const BASE = 'https://6tynine.net'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ['/', '/explore', '/blog', '/faq', '/leaks', '/login', '/register']

  return staticRoutes.map(path => ({
    url: `${BASE}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '/' || path === '/explore' ? 'hourly' : 'weekly',
    priority: path === '/' ? 1 : 0.8,
  }))
}

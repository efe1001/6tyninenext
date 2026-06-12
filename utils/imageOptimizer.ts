export function getLowQualityPlaceholder(url: string): string {
  if (!url) return ''
  if (url.includes('supabase.co') || url.includes('storage.googleapis.com')) {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}width=20&quality=5&format=webp`
  }
  return url
}

export function getProgressiveImageUrl(
  url: string,
  stage: 'ultra-low' | 'low' | 'medium' | 'high' = 'low',
  quality: number | null = null,
  width: number | null = null
): string {
  if (!url) return ''
  let q = quality
  let w = width
  if (!q) {
    switch (stage) {
      case 'ultra-low': q = 8;  w = w || 30;   break
      case 'low':       q = 20; w = w || 200;  break
      case 'medium':    q = 45; w = w || 600;  break
      case 'high':      q = 70; w = w || 1200; break
      default:          q = 45; w = w || 600
    }
  }
  if (url.includes('supabase.co') || url.includes('storage.googleapis.com')) {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}quality=${q}&format=webp${w ? `&width=${w}` : ''}`
  }
  return url
}

export function getOptimizedImageUrl(url: string, width = 600, quality = 55): string {
  return getProgressiveImageUrl(url, 'medium', quality, width)
}

export function getThumbnailUrl(url: string): string {
  return getProgressiveImageUrl(url, 'low', 15, 150)
}

export function getPreviewUrl(url: string): string {
  return getProgressiveImageUrl(url, 'medium', 45, 600)
}

export function getHighQualityUrl(url: string): string {
  return getProgressiveImageUrl(url, 'high', 75, 1600)
}

export function getUltraLightThumbnail(url: string): string {
  return getProgressiveImageUrl(url, 'ultra-low', 8, 30)
}

export function getOptimalSize(containerWidth: number): number {
  if (!containerWidth) return 600
  if (containerWidth <= 320) return 400
  if (containerWidth <= 640) return 600
  if (containerWidth <= 1024) return 800
  return 1200
}

export function preloadImage(url: string): void {
  if (!url) return
  const img = new Image()
  img.src = url
}

export function preloadImages(urls: string[]): void {
  if (!urls?.length) return
  urls.forEach(url => { if (url) { const img = new Image(); img.src = url } })
}

export function getVideoPosterUrl(videoUrl: string): string {
  if (!videoUrl) return ''
  if (videoUrl.includes('supabase.co')) {
    const sep = videoUrl.includes('?') ? '&' : '?'
    return `${videoUrl}${sep}poster=true&width=400&quality=30&format=webp`
  }
  return ''
}

export function getOptimizedVideoUrl(videoUrl: string): string {
  if (!videoUrl) return ''
  if (videoUrl.includes('supabase.co')) {
    const sep = videoUrl.includes('?') ? '&' : '?'
    return `${videoUrl}${sep}quality=low&width=640`
  }
  return videoUrl
}

export function getResponsiveSrcSet(url: string): string {
  if (!url) return ''
  if (url.includes('supabase.co') || url.includes('storage.googleapis.com')) {
    const sep = url.includes('?') ? '&' : '?'
    return [
      `${url}${sep}width=400&quality=45&format=webp 400w`,
      `${url}${sep}width=800&quality=55&format=webp 800w`,
      `${url}${sep}width=1200&quality=65&format=webp 1200w`,
      `${url}${sep}width=1600&quality=75&format=webp 1600w`,
    ].join(', ')
  }
  return ''
}

const loadedImagesCache = new Map<string, number>()
const MAX_CACHE_SIZE = 100

export function isImageLoaded(url: string): boolean {
  return loadedImagesCache.has(url)
}

export function markImageLoaded(url: string): void {
  if (url && !loadedImagesCache.has(url)) {
    if (loadedImagesCache.size >= MAX_CACHE_SIZE) {
      const firstKey = loadedImagesCache.keys().next().value
      loadedImagesCache.delete(firstKey)
    }
    loadedImagesCache.set(url, Date.now())
  }
}

export function cleanImageCache(): void {
  const now = Date.now()
  const FIVE_MINUTES = 5 * 60 * 1000
  for (const [url, ts] of loadedImagesCache.entries()) {
    if (now - ts > FIVE_MINUTES) loadedImagesCache.delete(url)
  }
}

export function detectNetworkSpeed(): 'slow' | 'medium' | 'fast' {
  if ('connection' in navigator) {
    const conn = (navigator as any).connection
    const et = conn?.effectiveType
    if (et === 'slow-2g' || et === '2g') return 'slow'
    if (et === '3g') return 'medium'
  }
  return 'fast'
}

export default {
  getLowQualityPlaceholder, getProgressiveImageUrl, getOptimizedImageUrl,
  getThumbnailUrl, getPreviewUrl, getHighQualityUrl, getUltraLightThumbnail,
  getOptimalSize, preloadImage, preloadImages, getVideoPosterUrl,
  getOptimizedVideoUrl, getResponsiveSrcSet, isImageLoaded, markImageLoaded,
  cleanImageCache, detectNetworkSpeed,
}

// Server-only API helpers — no localStorage, no window
// Used in Server Components and generateMetadata()

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8082'

async function safeFetch<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url, { ...init, signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

export async function fetchPublicProfile(username: string) {
  return safeFetch(
    `${BACKEND}/api/auth/public/users/${encodeURIComponent(username)}`,
    { next: { revalidate: 120 } }
  )
}

export async function fetchPostById(id: string) {
  return safeFetch(
    `${BACKEND}/api/auth/find-post/${encodeURIComponent(id)}`,
    { next: { revalidate: 60 } }
  )
}

export async function fetchHashtagPosts(hashtag: string): Promise<unknown[]> {
  const data = await safeFetch<unknown>(
    `${BACKEND}/api/auth/public/posts?hashtag=${encodeURIComponent(hashtag)}`,
    { next: { revalidate: 300 } }
  )
  if (!data) return []
  return Array.isArray(data) ? data : (data as { posts?: unknown[] }).posts ?? []
}

export async function fetchPublicPosts(page = 1, limit = 20): Promise<unknown[]> {
  const data = await safeFetch<unknown>(
    `${BACKEND}/api/auth/public/posts?page=${page}&limit=${limit}`,
    { next: { revalidate: 60 } }
  )
  if (!data) return []
  return Array.isArray(data) ? data : (data as { posts?: unknown[] }).posts ?? []
}

export async function fetchBlogTopics(): Promise<unknown[]> {
  const data = await safeFetch<unknown>(
    `${BACKEND}/api/auth/blogs`,
    { next: { revalidate: 3600 } }
  )
  if (!data) return []
  return Array.isArray(data) ? data : (data as { topics?: unknown[] }).topics ?? []
}

export async function fetchBlogTopic(topicId: string) {
  return safeFetch(
    `${BACKEND}/api/auth/blogs/${encodeURIComponent(topicId)}`,
    { next: { revalidate: 3600 } }
  )
}

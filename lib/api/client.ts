'use client'

// Browser-only API helpers — uses localStorage token
// Used in Client Components

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

const getToken = (): string | null =>
  typeof window !== 'undefined' ? localStorage.getItem('token') : null

const authHeaders = (): HeadersInit => {
  const token = getToken()
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

async function handleResponse<T>(res: Response, action: string): Promise<T> {
  if (!res.ok) {
    let message = `Failed to ${action}`
    try {
      const data = await res.clone().json()
      message = data.message ?? message
    } catch {
      const text = await res.text()
      message = text || message
    }
    const err = Object.assign(new Error(`${message}`), { status: res.status })
    throw err
  }
  return res.json() as Promise<T>
}

export async function fetchPublicPostsClient(page = 1, limit = 20) {
  const res = await fetch(`${API_BASE}/api/auth/public/posts?page=${page}&limit=${limit}`)
  return handleResponse(res, 'fetch public posts')
}

export async function fetchPostsAuth() {
  const res = await fetch(`${API_BASE}/api/auth/posts`, { headers: authHeaders() })
  return handleResponse(res, 'fetch posts')
}

export async function fetchCurrentUser() {
  const res = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() })
  return handleResponse(res, 'fetch current user')
}

export async function fetchAllUsers() {
  const res = await fetch(`${API_BASE}/api/auth/users`, { headers: authHeaders() })
  return handleResponse(res, 'fetch users')
}

export async function loginUser(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handleResponse<{ token: string }>(res, 'login')
}

export async function registerUser(data: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<{ token: string }>(res, 'register')
}

export async function fetchUserProfile(username: string) {
  const res = await fetch(`${API_BASE}/api/auth/users/${encodeURIComponent(username)}`, {
    headers: authHeaders(),
  })
  return handleResponse(res, 'fetch profile')
}

export async function updateFCMToken(fcmToken: string) {
  const res = await fetch(`${API_BASE}/api/auth/update-fcm-token`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ fcmToken }),
  })
  return handleResponse(res, 'update FCM token')
}

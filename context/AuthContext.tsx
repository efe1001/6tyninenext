'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import { fetchCurrentUser, loginUser, registerUser } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import { jwtDecode } from 'jwt-decode'

interface User {
  _id: string
  username: string
  email?: string
  balance?: number
  profilePicture?: string
  bio?: string
  isCreator?: boolean
  [key: string]: unknown
}

interface AuthContextValue {
  currentUser: User | null
  isLoggedIn: boolean
  token: string | null
  login: (email: string, password: string) => Promise<void>
  loginWithToken: (token: string) => void
  register: (data: Record<string, unknown>) => Promise<void>
  logout: () => void
  setCurrentUser: (user: User | null) => void
  refreshCurrentUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function setAuthCookie(token: string) {
  document.cookie = `auth_token=${token}; path=/; SameSite=Strict; max-age=${60 * 60 * 24 * 30}`
}

function clearAuthCookie() {
  document.cookie = 'auth_token=; path=/; max-age=0'
  document.cookie = 'admin_token=; path=/; max-age=0'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  const CACHE_KEY = 'user_profile_cache'
  const CACHE_TTL = 5 * 60 * 1000

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('token')
    if (stored) {
      setAuthCookie(stored)
      setToken(stored)
      setIsLoggedIn(true)
      // Decode JWT immediately for instant UI
      try {
        const decoded: any = jwtDecode(stored)
        setCurrentUser({
          _id: decoded._id || decoded.sub || '',
          username: decoded.username || '',
          email: decoded.email || '',
          isAdmin: decoded.isAdmin || false,
        } as User)
      } catch {}
      // Use sessionStorage cache to avoid Lambda call on every page visit
      try {
        const cached = sessionStorage.getItem(CACHE_KEY)
        if (cached) {
          const { data, ts } = JSON.parse(cached)
          if (Date.now() - ts < CACHE_TTL) {
            setCurrentUser(data as User)
            return
          }
        }
      } catch {}
      // Refresh full profile in background (cache miss or expired)
      fetchCurrentUser()
        .then(user => {
          setCurrentUser(user as User)
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: user, ts: Date.now() })) } catch {}
        })
        .catch(() => {
          localStorage.removeItem('token')
          clearAuthCookie()
          setToken(null)
          setIsLoggedIn(false)
          setCurrentUser(null)
        })
    }
  }, [])

  const loginWithToken = useCallback((newToken: string) => {
    localStorage.setItem('token', newToken)
    setAuthCookie(newToken)
    setToken(newToken)
    setIsLoggedIn(true)
    // Decode JWT immediately — no API call needed for basic info
    try {
      const decoded: any = jwtDecode(newToken)
      setCurrentUser({
        _id: decoded._id || decoded.sub || '',
        username: decoded.username || '',
        email: decoded.email || '',
        isAdmin: decoded.isAdmin || false,
      } as User)
    } catch {}
    // Fetch full profile in background — does not block redirect
    fetchCurrentUser()
      .then(user => {
        setCurrentUser(user as User)
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: user, ts: Date.now() })) } catch {}
      })
      .catch(() => {})
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const { token: newToken } = await loginUser(email, password)
      loginWithToken(newToken)
      router.push('/')
    },
    [loginWithToken, router]
  )

  const register = useCallback(
    async (data: Record<string, unknown>) => {
      const { token: newToken } = await registerUser(data)
      loginWithToken(newToken)
      router.push('/')
    },
    [loginWithToken, router]
  )

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('adminToken')
    clearAuthCookie()
    try { sessionStorage.removeItem(CACHE_KEY) } catch {}
    setToken(null)
    setIsLoggedIn(false)
    setCurrentUser(null)
    router.push('/login')
  }, [router])

  const refreshCurrentUser = useCallback(async () => {
    if (!token) return
    try {
      const user = await fetchCurrentUser() as User
      setCurrentUser(user)
    } catch { /* ignore */ }
  }, [token])

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoggedIn,
        token,
        login,
        loginWithToken,
        register,
        logout,
        setCurrentUser,
        refreshCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

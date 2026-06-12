'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'

// Routes that don't need age verification
const EXEMPT_PATHS = ['/blog', '/faq', '/login', '/register', '/admin', '/reset-password']

interface AgeVerificationContextValue {
  ageVerified: boolean
  verify: () => void
  isExempt: boolean
}

const AgeVerificationContext = createContext<AgeVerificationContextValue | null>(null)

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${value}; path=/; expires=${expires}; SameSite=Strict`
}

function getCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith(`${name}=`))
    ?.split('=')[1]
}

export function AgeVerificationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isExempt = EXEMPT_PATHS.some(p => pathname.startsWith(p))
  const [ageVerified, setAgeVerified] = useState(true) // default true to avoid flash

  useEffect(() => {
    // Read from cookie (persistent across sessions)
    const cookie = getCookie('age_verified')
    if (cookie === 'true') {
      setAgeVerified(true)
    } else if (!isExempt) {
      // Also check sessionStorage fallback
      const session = sessionStorage.getItem('ageVerified_6tynine')
      setAgeVerified(session === 'true')
    }
  }, [isExempt])

  const verify = useCallback(() => {
    setCookie('age_verified', 'true')
    sessionStorage.setItem('ageVerified_6tynine', 'true')
    setAgeVerified(true)
  }, [])

  return (
    <AgeVerificationContext.Provider value={{ ageVerified, verify, isExempt }}>
      {children}
    </AgeVerificationContext.Provider>
  )
}

export function useAgeVerification() {
  const ctx = useContext(AgeVerificationContext)
  if (!ctx) throw new Error('useAgeVerification must be inside AgeVerificationProvider')
  return ctx
}

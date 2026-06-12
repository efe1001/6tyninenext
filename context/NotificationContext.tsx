'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import { onMessageHandler, isFCMSupported } from '@/lib/firebase'

interface AppNotification {
  id: string
  title: string
  body: string
  data?: Record<string, unknown>
}

interface NotificationContextValue {
  notifications: AppNotification[]
  removeNotification: (id: string) => void
  clearAll: () => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  useEffect(() => {
    let unsubscribe: (() => void) | null = null

    isFCMSupported().then(supported => {
      if (!supported) return
      unsubscribe = onMessageHandler((payload) => {
        const p = payload as {
          notification?: { title?: string; body?: string }
          data?: Record<string, unknown>
        }
        setNotifications(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            title: p.notification?.title ?? 'New Notification',
            body: p.notification?.body ?? '',
            data: p.data,
          },
        ])
      })
    })

    return () => { unsubscribe?.() }
  }, [])

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const clearAll = useCallback(() => setNotifications([]), [])

  return (
    <NotificationContext.Provider value={{ notifications, removeNotification, clearAll }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be inside NotificationProvider')
  return ctx
}

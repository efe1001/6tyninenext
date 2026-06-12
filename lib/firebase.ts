'use client'

import { initializeApp, getApps } from 'firebase/app'
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  deleteToken,
  type Messaging,
} from 'firebase/messaging'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const storage = getStorage(app)

const CLOUDFLARE_CDN = process.env.NEXT_PUBLIC_CLOUDFLARE_CDN ?? 'https://cdn.6tynine.net'
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? ''

export const getMediaUrl = (firebaseUrl: string): string => {
  if (!firebaseUrl) return ''
  if (
    firebaseUrl.includes('cdn.6tynine.net') ||
    firebaseUrl.includes('workers.dev')
  ) {
    return firebaseUrl
  }

  let path = firebaseUrl

  // Handle gs://bucket/path URIs
  if (firebaseUrl.startsWith('gs://')) {
    path = firebaseUrl.replace(/^gs:\/\/[^/]+\//, '')
    return `${CLOUDFLARE_CDN}/${path}`
  }

  if (firebaseUrl.includes('firebasestorage.googleapis.com')) {
    const match = firebaseUrl.match(/\/o\/(.+?)\?/)
    if (match?.[1]) {
      path = decodeURIComponent(match[1])
    }
  }

  if (path.startsWith('/')) path = path.substring(1)
  return `${CLOUDFLARE_CDN}/${path}`
}

export const getMediaUrls = (firebaseUrls: string[]): string[] => {
  if (!Array.isArray(firebaseUrls)) return []
  return firebaseUrls.map(getMediaUrl)
}

export const uploadMedia = async (file: File, path: string): Promise<string> => {
  const storageRef = ref(storage, path)
  const snapshot = await uploadBytes(storageRef, file)
  const downloadUrl = await getDownloadURL(snapshot.ref)
  return getMediaUrl(downloadUrl)
}

let messaging: Messaging | null = null

export const initializeMessaging = async (): Promise<Messaging | null> => {
  try {
    const supported = await isSupported()
    if (!supported) return null
    messaging = getMessaging(app)
    return messaging
  } catch {
    return null
  }
}

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) return null
  try {
    const existing = await navigator.serviceWorker.getRegistrations()
    for (const reg of existing) {
      if (
        reg.scope.includes('firebase-cloud-messaging') ||
        reg.scope.includes('fcm')
      ) {
        await reg.unregister()
      }
    }
    return await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
  } catch {
    return null
  }
}

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  try {
    if (Notification.permission !== 'default') return Notification.permission
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export const getFCMToken = async (maxRetries = 3): Promise<string | null> => {
  try {
    if (!messaging) await initializeMessaging()
    if (!messaging) return null
    if (typeof window === 'undefined') return null

    const permission = await requestNotificationPermission()
    if (permission !== 'granted') return null

    const registration = await registerServiceWorker()
    if (!registration) return null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration,
        })
        if (token) return token
      } catch (err) {
        if (attempt === maxRetries) throw err
        await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** (attempt - 1), 10000)))
      }
    }
    return null
  } catch {
    return null
  }
}

export const onMessageHandler = (callback: (payload: unknown) => void): (() => void) => {
  if (!messaging) return () => {}
  return onMessage(messaging, payload => {
    callback(payload)
    const p = payload as { notification?: { title?: string; body?: string; icon?: string }; data?: unknown }
    if (p.notification && Notification.permission === 'granted') {
      const { title, body, icon } = p.notification
      try {
        const n = new Notification(title ?? 'Notification', {
          body: body ?? '',
          icon: icon ?? '/6tyninelogo.png',
          badge: '/6tyninelogo.png',
          tag: 'fcm-message',
        })
        n.onclick = () => { window.focus(); n.close() }
      } catch { /* browser may block */ }
    }
  })
}

export const isFCMSupported = async (): Promise<boolean> => {
  try { return await isSupported() } catch { return false }
}

export const deleteFCMToken = async (): Promise<void> => {
  if (!messaging) return
  try { await deleteToken(messaging) } catch { /* ignore */ }
}

export const manuallyRequestPermission = async (): Promise<string | null> => {
  try {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') return await getFCMToken()
    return null
  } catch {
    return null
  }
}

export default app

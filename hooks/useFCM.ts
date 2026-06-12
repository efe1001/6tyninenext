import { useState, useEffect, useCallback, useRef } from 'react'
import { getFCMToken, onMessageHandler, isFCMSupported, deleteFCMToken, manuallyRequestPermission } from '@/lib/firebase'

const API_BASE_URL = ''

export const useFCM = (currentUser: any) => {
  const [fcmToken, setFcmToken] = useState<string | null>(null)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [foregroundMessage, setForegroundMessage] = useState<any>(null)
  const [fcmSupported, setFcmSupported] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [showPermissionPopup, setShowPermissionPopup] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const initializedRef = useRef(false)
  const inProgressRef = useRef(false)

  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream
    const isAndroid = /android/i.test(ua)
    setIsMobile(isIOS || isAndroid || window.innerWidth < 768)
  }, [])

  useEffect(() => {
    isFCMSupported().then(supported => {
      setFcmSupported(supported)
      if (typeof Notification !== 'undefined') {
        setNotificationPermission(Notification.permission)
      }
    }).catch(() => setFcmSupported(false))
  }, [])

  const getPermission = useCallback((): NotificationPermission | 'unsupported' => {
    if (typeof Notification === 'undefined') return 'unsupported'
    return Notification.permission
  }, [])

  const saveToken = useCallback(async (token: string) => {
    try {
      const userToken = localStorage.getItem('token')
      if (!userToken) return
      await fetch(`${API_BASE_URL}/api/auth/save-fcm-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
        body: JSON.stringify({ fcmToken: token })
      })
    } catch {}
  }, [])

  const removeToken = useCallback(async (token: string) => {
    try {
      const userToken = localStorage.getItem('token')
      if (!userToken) return
      await fetch(`${API_BASE_URL}/api/auth/remove-fcm-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
        body: JSON.stringify({ fcmToken: token })
      })
    } catch {}
  }, [])

  const showCustomPermissionPopup = useCallback(() => {
    if (getPermission() === 'default') setShowPermissionPopup(true)
  }, [getPermission])

  const handlePermissionResponse = useCallback(async (userResponse: 'allow' | 'deny') => {
    setShowPermissionPopup(false)
    setInitializing(true)
    try {
      if (userResponse === 'allow') {
        const token = await manuallyRequestPermission()
        if (token) {
          setFcmToken(token)
          setNotificationPermission('granted')
          if (currentUser) await saveToken(token)
          return token
        }
      } else {
        setNotificationPermission('denied')
      }
    } catch {
      setNotificationPermission('denied')
    } finally {
      setInitializing(false)
    }
    return null
  }, [currentUser, saveToken])

  const initializeFCM = useCallback(async (force = false): Promise<string | null> => {
    if (inProgressRef.current && !force) return null
    if (initializedRef.current && !force) return fcmToken
    inProgressRef.current = true
    setInitializing(true)
    try {
      if (!fcmSupported) return null
      const permission = getPermission()
      setNotificationPermission(permission)
      if (permission === 'denied' || permission === 'unsupported') return null
      if (permission === 'granted') {
        const token = await getFCMToken()
        if (token) {
          setFcmToken(token)
          initializedRef.current = true
          if (currentUser) await saveToken(token)
          return token
        }
      }
      return null
    } catch {
      initializedRef.current = false
      return null
    } finally {
      setInitializing(false)
      inProgressRef.current = false
    }
  }, [currentUser, fcmSupported, fcmToken, getPermission, saveToken])

  useEffect(() => {
    if (!fcmSupported) return
    const unsubscribe = onMessageHandler((payload: any) => setForegroundMessage(payload))
    return () => { if (unsubscribe) unsubscribe() }
  }, [fcmSupported])

  useEffect(() => {
    if (!currentUser || !fcmSupported || initializing || initializedRef.current) return
    const permission = getPermission()
    if (permission === 'default' && !isMobile) {
      const t = setTimeout(() => setShowPermissionPopup(true), 2000)
      return () => clearTimeout(t)
    } else if (permission === 'granted') {
      initializeFCM()
    }
  }, [currentUser, fcmSupported, initializing, isMobile, getPermission, initializeFCM])

  useEffect(() => {
    if (!currentUser && fcmToken) {
      removeToken(fcmToken).then(() => deleteFCMToken()).catch(() => {})
      setFcmToken(null)
      initializedRef.current = false
    }
  }, [currentUser, fcmToken, removeToken])

  useEffect(() => {
    if (currentUser) {
      initializedRef.current = false
      inProgressRef.current = false
    }
  }, [currentUser?.username])

  const refreshToken = useCallback(async () => {
    initializedRef.current = false
    inProgressRef.current = false
    return initializeFCM(true)
  }, [initializeFCM])

  const cleanup = useCallback(async () => {
    if (fcmToken) {
      await removeToken(fcmToken)
      await deleteFCMToken()
      setFcmToken(null)
      initializedRef.current = false
    }
  }, [fcmToken, removeToken])

  return {
    fcmToken,
    notificationPermission,
    foregroundMessage,
    fcmSupported,
    initializing,
    showPermissionPopup,
    showCustomPermissionPopup,
    handlePermissionResponse,
    initializeFCM,
    refreshToken,
    cleanup,
    isMobile,
  }
}

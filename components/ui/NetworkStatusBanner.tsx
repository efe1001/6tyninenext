'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaWifi, FaExclamationTriangle } from 'react-icons/fa'

export function NetworkStatusBanner() {
  const [isOnline, setIsOnline] = useState(true)
  const [showBanner, setShowBanner] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      setShowBanner(true)
      setTimeout(() => setShowBanner(false), 3000)
    }
    const handleOffline = () => {
      setIsOnline(false)
      setShowBanner(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!mounted || !showBanner) return null

  return createPortal(
    <div className={`fixed top-0 left-0 right-0 z-[2147483647] ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}>
      <div className="text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center space-x-2">
        {isOnline ? (
          <>
            <FaWifi className="w-4 h-4" />
            <span>Connection restored! You are back online.</span>
          </>
        ) : (
          <>
            <FaExclamationTriangle className="w-4 h-4" />
            <span>You are offline. Showing cached content.</span>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

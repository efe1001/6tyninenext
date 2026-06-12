'use client'

import { useRouter } from 'next/navigation'
import { useNotifications } from '@/context/NotificationContext'

export function NotificationToasts() {
  const { notifications, removeNotification } = useNotifications()
  const router = useRouter()

  if (!notifications.length) return null

  return (
    <div className="fixed top-20 right-4 z-[1000] space-y-2 max-w-sm">
      {notifications.map(n => (
        <div
          key={n.id}
          className="bg-gray-800 border border-orange-500 rounded-lg p-3 shadow-2xl cursor-pointer hover:bg-gray-700 transition-colors"
          onClick={() => {
            if (n.data?.url) router.push(n.data.url as string)
            removeNotification(n.id)
          }}
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white font-semibold text-sm">{n.title}</p>
              <p className="text-gray-300 text-xs mt-1">{n.body}</p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); removeNotification(n.id) }}
              className="text-gray-400 hover:text-white ml-2 flex-shrink-0"
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

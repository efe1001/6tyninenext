'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import Pusher from 'pusher-js'

const API_BASE = ''

interface Props {
  targetUsername?: string
}

export default function ChatClient({ targetUsername }: Props) {
  const router = useRouter()
  const { currentUser, isLoggedIn } = useAuth()

  const [conversations, setConversations] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [selectedChat, setSelectedChat] = useState<string | null>(targetUsername || null)
  const [messageInput, setMessageInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [pendingUpload, setPendingUpload] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [userStatus, setUserStatus] = useState<Record<string, any>>({})
  const [notifications, setNotifications] = useState<any[]>([])
  const [theme] = useState<'dark' | 'light'>('dark')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pusherRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeChannelRef = useRef<string | null>(null)
  const messageHandlersRef = useRef<Map<string, any>>(new Map())

  const colors = {
    senderBg: '#005c4b', receiverBg: '#202c33', chatBg: '#0b141a',
    textPrimary: '#e9edef', textSecondary: '#8696a0', inputBg: '#2a3942',
    sidebarBg: '#111b21', borderColor: '#2a3942',
  }

  // Update online status
  const updateOnlineStatus = useCallback(async () => {
    if (!currentUser) return
    const token = localStorage.getItem('token'); if (!token) return
    try { await fetch(`${API_BASE}/api/auth/user/online`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }) } catch {}
  }, [currentUser])

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!currentUser) return
    const token = localStorage.getItem('token'); if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/auth/chats`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); setConversations(d.conversations || []) }
    } catch {}
    finally { setIsLoading(false) }
  }, [currentUser])

  // Fetch messages
  const fetchMessages = useCallback(async (target: string) => {
    if (!currentUser || !target) return
    const token = localStorage.getItem('token'); if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/auth/chats/${target}/messages`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const d = await res.json()
        setMessages((d.messages || []).map((m: any, i: number) => ({ ...m, uniqueKey: `${m.id}-${i}`, isOwnMessage: m.sender === currentUser.username })))
      }
    } catch {}
  }, [currentUser])

  // Subscribe to Pusher channel
  const subscribeToChatChannel = useCallback((chatUsername: string) => {
    if (!pusherRef.current || !currentUser || !chatUsername) return
    if (activeChannelRef.current) {
      const oldHandler = messageHandlersRef.current.get(activeChannelRef.current)
      if (oldHandler) {
        try {
          const oldCh = pusherRef.current.channel(activeChannelRef.current)
          if (oldCh) { oldCh.unbind('new-message', oldHandler); pusherRef.current.unsubscribe(activeChannelRef.current) }
          messageHandlersRef.current.delete(activeChannelRef.current)
        } catch {}
      }
    }
    const sorted = [currentUser.username, chatUsername].sort()
    const channelName = `private-${sorted[0]}-${sorted[1]}`
    activeChannelRef.current = channelName
    try {
      const ch = pusherRef.current.subscribe(channelName)
      const handler = (data: any) => {
        setMessages(prev => {
          if (prev.some(m => m.id === data.id)) return prev
          const isOwn = data.sender === currentUser.username
          return [...prev, { ...data, status: 'delivered', uniqueKey: `${data.id}-${Date.now()}`, isOwnMessage: isOwn }]
        })
        setTimeout(() => fetchConversations(), 500)
      }
      ch.bind('new-message', handler)
      messageHandlersRef.current.set(channelName, handler)
    } catch {}
  }, [currentUser, fetchConversations])

  // Fetch user statuses
  const fetchUserStatuses = useCallback(async () => {
    if (!currentUser || conversations.length === 0) return
    const token = localStorage.getItem('token'); if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/status`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: conversations.map(c => c.targetUsername) }),
      })
      if (res.ok) setUserStatus(await res.json())
    } catch {}
  }, [currentUser, conversations])

  // Init Pusher
  useEffect(() => {
    if (!currentUser) return
    const token = localStorage.getItem('token'); if (!token) return
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'eu'
    if (!pusherKey) return
    try {
      pusherRef.current = new Pusher(pusherKey, {
        cluster: pusherCluster,
        authEndpoint: `${API_BASE}/api/auth/pusher/auth`,
        auth: { headers: { 'Authorization': `Bearer ${token}` } },
      })
      pusherRef.current.connection.bind('connected', () => updateOnlineStatus())
    } catch {}
    return () => {
      if (pusherRef.current) {
        messageHandlersRef.current.forEach((handler, chName) => {
          try { const ch = pusherRef.current.channel(chName); if (ch) ch.unbind('new-message', handler); pusherRef.current.unsubscribe(chName) } catch {}
        })
        messageHandlersRef.current.clear(); pusherRef.current.disconnect()
      }
      if (currentUser) { const t = localStorage.getItem('token'); if (t) fetch(`${API_BASE}/api/auth/user/offline`, { method: 'POST', headers: { 'Authorization': `Bearer ${t}` } }).catch(() => {}) }
    }
  }, [currentUser, updateOnlineStatus])

  useEffect(() => {
    if (currentUser) { fetchConversations(); const iv = setInterval(fetchConversations, 10000); return () => clearInterval(iv) }
  }, [currentUser, fetchConversations])

  useEffect(() => {
    if (currentUser) { updateOnlineStatus(); const iv = setInterval(updateOnlineStatus, 30000); return () => clearInterval(iv) }
  }, [currentUser, updateOnlineStatus])

  useEffect(() => {
    if (currentUser) { fetchUserStatuses(); const iv = setInterval(fetchUserStatuses, 30000); return () => clearInterval(iv) }
  }, [currentUser, fetchUserStatuses])

  useEffect(() => {
    if (targetUsername && currentUser) { setSelectedChat(targetUsername); fetchMessages(targetUsername) }
    else if (!targetUsername) { setSelectedChat(null); setMessages([]) }
  }, [targetUsername, currentUser, fetchMessages])

  useEffect(() => {
    if (selectedChat && currentUser && pusherRef.current) subscribeToChatChannel(selectedChat)
  }, [selectedChat, currentUser, subscribeToChatChannel])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const uploadMedia = useCallback(async (files: File[]) => {
    const results = await Promise.all(files.map(async file => {
      const ext = file.name.split('.').pop()
      const fileRef = storageRef(storage, `chats/chat_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`)
      const snap = await uploadBytesResumable(fileRef, file)
      const url = await getDownloadURL(snap.ref)
      return { url, type: file.type.startsWith('image/') ? 'image' : 'video' }
    }))
    return { images: results.filter(r => r.type === 'image').map(r => r.url), videos: results.filter(r => r.type === 'video').map(r => r.url) }
  }, [])

  const sendMessage = useCallback(async () => {
    const text = messageInput.trim()
    if ((!text && selectedFiles.length === 0) || !selectedChat || !currentUser || isSending) return
    const token = localStorage.getItem('token'); if (!token) return
    setIsSending(true)
    const origInput = messageInput, origFiles = [...selectedFiles]
    setMessageInput(''); setSelectedFiles([])
    const tempId = `temp-${Date.now()}`
    try {
      if (origFiles.length > 0) {
        setPendingUpload(true)
        setMessages(prev => [...prev, { id: tempId, uniqueKey: tempId, sender: currentUser.username, text: text || '[Media]', timestamp: new Date().toISOString(), status: 'uploading', images: [], videos: [], isOwnMessage: true }])
        const { images, videos } = await uploadMedia(origFiles)
        const res = await fetch(`${API_BASE}/api/auth/chats/${selectedChat}/messages`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text || '[Media]', images, videos }),
        })
        if (!res.ok) throw new Error(`Send failed: ${res.status}`)
        const d = await res.json()
        setMessages(prev => prev.map(m => m.uniqueKey === tempId ? { ...d, status: 'sent', uniqueKey: `${d.id}-${Date.now()}`, images, videos, sender: currentUser.username, isOwnMessage: true } : m))
        setPendingUpload(false)
      } else {
        setMessages(prev => [...prev, { id: tempId, uniqueKey: tempId, sender: currentUser.username, text, timestamp: new Date().toISOString(), status: 'sending', isOwnMessage: true }])
        const res = await fetch(`${API_BASE}/api/auth/chats/${selectedChat}/messages`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        if (!res.ok) throw new Error(`Send failed: ${res.status}`)
        const d = await res.json()
        setMessages(prev => prev.map(m => m.uniqueKey === tempId ? { ...d, status: 'sent', uniqueKey: `${d.id}-${Date.now()}`, sender: currentUser.username, isOwnMessage: true } : m))
      }
      fetchConversations()
    } catch (err: any) {
      setError(err.message); setMessageInput(origInput); setSelectedFiles(origFiles); setPendingUpload(false)
      setMessages(prev => prev.filter(m => m.uniqueKey !== tempId))
    } finally { setIsSending(false) }
  }, [messageInput, selectedFiles, selectedChat, currentUser, fetchConversations, uploadMedia, isSending])

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: colors.chatBg }}>
        <div className="text-center p-8">
          <p className="text-xl mb-4" style={{ color: colors.textPrimary }}>Please log in to use Chat</p>
          <Link href="/login" className="px-6 py-3 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition">Login</Link>
        </div>
      </div>
    )
  }

  const filtered = conversations.filter(c => c.targetUsername.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <div className="flex pt-14 h-screen overflow-hidden text-white">
      {/* Notification toasts */}
      {notifications.map(n => (
        <div key={n.id} className="fixed top-4 right-4 z-50 bg-gray-800 border-l-4 border-orange-500 text-white p-4 rounded-lg shadow-lg max-w-sm cursor-pointer" onClick={() => { router.push(`/chat/${n.data?.username || ''}`); setNotifications(p => p.filter(x => x.id !== n.id)) }}>
          <p className="text-sm font-semibold">{n.title}</p>
          <p className="text-xs text-gray-300 mt-1">{n.body}</p>
          <button onClick={e => { e.stopPropagation(); setNotifications(p => p.filter(x => x.id !== n.id)) }} className="absolute top-2 right-2 text-gray-400 hover:text-white">×</button>
        </div>
      ))}

      {/* Left Sidebar */}
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r`} style={{ backgroundColor: colors.sidebarBg, borderColor: colors.borderColor }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.borderColor }}>
          <Link href="/" className="p-2 rounded-full hover:bg-gray-700 transition-colors" style={{ color: colors.textPrimary }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <h2 className="text-lg font-bold flex-1 text-center" style={{ color: colors.textPrimary }}>Chats</h2>
          <div className="w-9" />
        </div>
        <div className="p-3 border-b" style={{ borderColor: colors.borderColor }}>
          <div className="flex items-center rounded-full p-2" style={{ backgroundColor: colors.inputBg }}>
            <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.textSecondary }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" placeholder="Search chats..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-transparent outline-none flex-1 text-sm placeholder-gray-500" style={{ color: colors.textPrimary }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="flex items-center space-x-3"><div className="w-12 h-12 rounded-full bg-gray-700 flex-shrink-0" /><div className="flex-1 space-y-2"><div className="h-3 bg-gray-700 rounded w-3/4" /><div className="h-3 bg-gray-700 rounded w-1/2" /></div></div>)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center" style={{ color: colors.textSecondary }}>
              <div className="text-5xl mb-4">💬</div>
              <p>No conversations yet.</p>
              <p className="text-sm mt-2">Start a conversation from someone's profile!</p>
            </div>
          ) : (
            filtered.map(conv => (
              <div key={conv.targetUsername} className={`p-4 border-b cursor-pointer flex items-center space-x-3 transition-all hover:bg-gray-700 ${selectedChat === conv.targetUsername ? 'bg-green-500/10 border-l-4 border-l-green-500' : ''}`} style={{ borderColor: colors.borderColor }} onClick={() => { setSelectedChat(conv.targetUsername); router.push(`/chat/${conv.targetUsername}`) }}>
                <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0 relative">
                  <span className="text-sm font-semibold">{conv.targetUsername[0].toUpperCase()}</span>
                  {userStatus[conv.targetUsername]?.online && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>{conv.targetUsername}</p>
                    <p className="text-xs flex-shrink-0 ml-1" style={{ color: colors.textSecondary }}>{conv.timestamp ? new Date(conv.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                  </div>
                  <p className="text-xs truncate" style={{ color: colors.textSecondary }}>{conv.lastMessage || 'No messages yet'}</p>
                </div>
                {conv.unreadCount > 0 && <div className="w-5 h-5 bg-green-500 text-white text-xs rounded-full flex items-center justify-center flex-shrink-0">{conv.unreadCount > 99 ? '99+' : conv.unreadCount}</div>}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Side - Chat Area */}
      <div className={`${selectedChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col`} style={{ backgroundColor: colors.chatBg }}>
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b flex items-center space-x-3 shadow-sm" style={{ backgroundColor: colors.sidebarBg, borderColor: colors.borderColor }}>
              <button onClick={() => { setSelectedChat(null); router.push('/chat') }} className="p-2 rounded-full hover:bg-gray-700 transition-colors md:hidden" style={{ color: colors.textPrimary }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0 relative">
                <span className="text-sm font-semibold">{selectedChat[0].toUpperCase()}</span>
                {userStatus[selectedChat]?.online && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold truncate" style={{ color: colors.textPrimary }}>{selectedChat}</p>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  {userStatus[selectedChat]?.online ? <span className="flex items-center"><span className="w-2 h-2 bg-green-500 rounded-full mr-1" />Online</span> : 'Offline'}
                </p>
              </div>
              <Link href={`/profile/${selectedChat}`} className="p-2 rounded-full hover:bg-gray-700 transition-colors" style={{ color: colors.textSecondary }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </Link>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {error && <p className="text-red-400 text-sm text-center bg-red-900/20 rounded p-2">{error}</p>}
              {messages.map(msg => (
                <div key={msg.uniqueKey || msg.id} className={`flex ${msg.isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm`} style={{ backgroundColor: msg.isOwnMessage ? colors.senderBg : colors.receiverBg }}>
                    {msg.images?.map((img: string, i: number) => <img key={i} src={img} alt="" className="max-w-full rounded-md mb-1 cursor-pointer max-h-64 object-contain" loading="lazy" />)}
                    {msg.videos?.map((vid: string, i: number) => <video key={i} src={vid} controls className="max-w-full rounded-md mb-1 max-h-48" />)}
                    {msg.text && <p className="text-sm break-words" style={{ color: colors.textPrimary }}>{msg.text}</p>}
                    <div className="flex items-center justify-end mt-1 space-x-1">
                      <p className="text-[10px]" style={{ color: colors.textSecondary }}>{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                      {msg.isOwnMessage && <span className="text-[10px]" style={{ color: msg.status === 'sent' ? '#4ade80' : colors.textSecondary }}>{msg.status === 'uploading' ? '⏳' : msg.status === 'sending' ? '🕐' : '✓✓'}</span>}
                    </div>
                  </div>
                </div>
              ))}
              {pendingUpload && (
                <div className="flex justify-end">
                  <div className="bg-gray-700 rounded-lg px-3 py-2"><div className="flex items-center gap-2 text-gray-400 text-sm"><div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />Uploading...</div></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Selected Files Preview */}
            {selectedFiles.length > 0 && (
              <div className="px-4 py-2 border-t flex gap-2 flex-wrap" style={{ borderColor: colors.borderColor, backgroundColor: colors.sidebarBg }}>
                {selectedFiles.map((f, i) => (
                  <div key={i} className="relative">
                    {f.type.startsWith('image/') ? <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 rounded object-cover" /> : <div className="w-16 h-16 rounded bg-gray-700 flex items-center justify-center text-2xl">🎬</div>}
                    <button onClick={() => setSelectedFiles(p => p.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Input Area */}
            <div className="p-3 border-t flex items-end space-x-2" style={{ backgroundColor: colors.sidebarBg, borderColor: colors.borderColor }}>
              <input type="file" ref={fileInputRef} accept="image/*,video/*" multiple className="hidden" onChange={e => { if (e.target.files) { const valid = Array.from(e.target.files).filter(f => (f.type.startsWith('image/') || f.type.startsWith('video/')) && f.size <= 50 * 1024 * 1024); setSelectedFiles(p => [...p, ...valid]) }; e.target.value = '' }} />
              <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-full transition-colors flex-shrink-0" style={{ color: colors.textSecondary }}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              </button>
              <div className="flex-1 rounded-full px-4 py-2 flex items-center" style={{ backgroundColor: colors.inputBg }}>
                <textarea value={messageInput} onChange={e => setMessageInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..." rows={1} className="bg-transparent outline-none flex-1 text-sm resize-none max-h-24 placeholder-gray-500" style={{ color: colors.textPrimary }} />
              </div>
              <button onClick={sendMessage} disabled={isSending || (!messageInput.trim() && selectedFiles.length === 0)} className="p-3 rounded-full bg-green-600 hover:bg-green-700 transition-colors flex-shrink-0 disabled:opacity-50">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center" style={{ color: colors.textSecondary }}>
              <div className="text-6xl mb-4">💬</div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: colors.textPrimary }}>Select a conversation</h3>
              <p className="text-sm">Choose from your existing conversations or start a new one from someone's profile.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

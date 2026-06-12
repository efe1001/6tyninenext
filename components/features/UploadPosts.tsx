'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'

const API_BASE_URL = ''
const MAX_IMAGES = 10
const MAX_VIDEOS = 10
const MAX_RETRIES = 3
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/3gpp']

const extractHashtags = (text: string): string[] =>
  (text.match(/#[a-zA-Z0-9_]+/g) || []).map(t => t.slice(1).toLowerCase())

const extractMentions = (text: string): string[] =>
  (text.match(/@[a-zA-Z0-9_]+/g) || []).map(t => t.slice(1).toLowerCase())

const formatFileSize = (bytes: number): string => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

interface FileData {
  id: string
  file: File
  name: string
  size: number
  url: string // local blob URL for preview
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'retrying'
  progress: number
  downloadURL?: string
  retryCount: number
  type: 'image' | 'video'
}

interface Props {
  onClose?: () => void
  setPosts?: (post: any, tempId?: string) => void
}

export default function UploadPosts({ onClose, setPosts }: Props) {
  const { user: currentUser } = useAuth()
  const router = useRouter()

  const [text, setText] = useState('')
  const [images, setImages] = useState<FileData[]>([])
  const [videos, setVideos] = useState<FileData[]>([])
  const [isPremium, setIsPremium] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [userSuggestions, setUserSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const suggestionDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach(f => URL.revokeObjectURL(f.url))
      videos.forEach(f => URL.revokeObjectURL(f.url))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced mention search
  useEffect(() => {
    if (!mentionSearch || mentionSearch.length < 1) {
      setUserSuggestions([])
      setShowSuggestions(false)
      return
    }
    if (suggestionDebounce.current) clearTimeout(suggestionDebounce.current)
    suggestionDebounce.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_BASE_URL}/api/auth/search/users?q=${encodeURIComponent(mentionSearch)}&limit=5`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        })
        if (res.ok) {
          const data = await res.json()
          setUserSuggestions(data.users || data || [])
          setShowSuggestions(true)
        }
      } catch {}
    }, 300)
  }, [mentionSearch])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setText(val)

    const cursor = e.target.selectionStart
    const textBefore = val.slice(0, cursor)
    const mentionMatch = textBefore.match(/@([a-zA-Z0-9_]*)$/)
    if (mentionMatch) {
      setMentionSearch(mentionMatch[1])
    } else {
      setMentionSearch('')
      setShowSuggestions(false)
    }
  }

  const insertMention = (username: string) => {
    const cursor = textareaRef.current?.selectionStart ?? text.length
    const textBefore = text.slice(0, cursor)
    const mentionStart = textBefore.lastIndexOf('@')
    const newText = text.slice(0, mentionStart) + `@${username} ` + text.slice(cursor)
    setText(newText)
    setShowSuggestions(false)
    setMentionSearch('')
    setTimeout(() => {
      const pos = mentionStart + username.length + 2
      textareaRef.current?.setSelectionRange(pos, pos)
      textareaRef.current?.focus()
    }, 0)
  }

  const addFiles = (files: File[], type: 'image' | 'video') => {
    const current = type === 'image' ? images : videos
    const max = type === 'image' ? MAX_IMAGES : MAX_VIDEOS
    const supported = type === 'image' ? SUPPORTED_IMAGE_TYPES : SUPPORTED_VIDEO_TYPES
    const newFiles: FileData[] = []
    const errors: string[] = []

    for (const file of files) {
      if (current.length + newFiles.length >= max) {
        errors.push(`Max ${max} ${type}s allowed`)
        break
      }
      if (!supported.includes(file.type.toLowerCase())) {
        errors.push(`Unsupported ${type} type: ${file.type}`)
        continue
      }
      newFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        url: URL.createObjectURL(file),
        status: 'pending',
        progress: 0,
        retryCount: 0,
        type,
      })
    }

    if (errors.length > 0) setFormError(errors[0])
    if (type === 'image') setImages(prev => [...prev, ...newFiles])
    else setVideos(prev => [...prev, ...newFiles])
  }

  const removeFile = (id: string, type: 'image' | 'video') => {
    if (type === 'image') {
      setImages(prev => {
        const f = prev.find(i => i.id === id)
        if (f) URL.revokeObjectURL(f.url)
        return prev.filter(i => i.id !== id)
      })
    } else {
      setVideos(prev => {
        const f = prev.find(v => v.id === id)
        if (f) URL.revokeObjectURL(f.url)
        return prev.filter(v => v.id !== id)
      })
    }
  }

  const uploadFileToFirebase = useCallback(async (fileData: FileData): Promise<string> => {
    const { file, id, type } = fileData
    const folder = isPremium ? 'premium-posts' : 'posts'
    const username = currentUser?.username || 'unknown'
    const path = `${folder}/${username}/${id}_${file.name}`
    const fileRef = storageRef(storage, path)

    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(fileRef, file)
      task.on(
        'state_changed',
        snapshot => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          const updateList = type === 'image' ? setImages : setVideos
          updateList(prev => prev.map(f => f.id === id ? { ...f, status: 'uploading', progress } : f))
        },
        error => {
          reject(error)
        },
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref)
            const updateList = type === 'image' ? setImages : setVideos
            updateList(prev => prev.map(f => f.id === id ? { ...f, status: 'completed', progress: 100, downloadURL: url } : f))
            resolve(url)
          } catch (e) { reject(e) }
        }
      )
    })
  }, [currentUser, isPremium])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setFormError(null)

    if (!currentUser?.username) {
      setFormError('You must be logged in to post.')
      router.push('/login')
      return
    }
    if (!text.trim()) { setFormError('Post text cannot be empty.'); return }
    if (images.length === 0 && videos.length === 0) {
      setFormError('Posts must include at least one image or video.')
      return
    }

    setIsSubmitting(true)

    try {
      const token = localStorage.getItem('token')
      if (!token) { setFormError('You must be logged in to post.'); return }

      const hashtags = extractHashtags(text)
      const userMentions = extractMentions(text)

      const imageUrls: string[] = []
      for (const img of images) {
        if (img.status === 'completed' && img.downloadURL) {
          imageUrls.push(img.downloadURL)
        } else {
          const url = await uploadFileToFirebase(img)
          imageUrls.push(url)
        }
      }

      const videoUrls: string[] = []
      for (const vid of videos) {
        if (vid.status === 'completed' && vid.downloadURL) {
          videoUrls.push(vid.downloadURL)
        } else {
          const url = await uploadFileToFirebase(vid)
          videoUrls.push(url)
        }
      }

      const postData = {
        text: text.trim(),
        images: imageUrls,
        videos: videoUrls,
        username: currentUser.username,
        timestamp: new Date().toISOString(),
        isPremium,
        hashtags,
        userMentions,
      }

      const endpoint = isPremium ? '/api/auth/premium-posts' : '/api/auth/posts'
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.message || 'Failed to create post')
      }

      const newPost = await res.json()
      if (typeof setPosts === 'function') setPosts(newPost.post || newPost)

      setText('')
      setImages([])
      setVideos([])
      setIsPremium(false)
      setSuccessMessage('âœ… Post created successfully!')
      setTimeout(() => {
        setSuccessMessage(null)
        if (typeof onClose === 'function') onClose()
      }, 2000)

    } catch (err: any) {
      let msg = 'Failed to create post. '
      if (err.message?.includes('storage/unauthorized')) msg += 'You do not have permission to upload files.'
      else if (err.message?.includes('storage/network')) msg += 'Network error during upload. Please try again.'
      else msg += err.message || 'Please try again.'
      setFormError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }, [isSubmitting, currentUser, text, images, videos, isPremium, uploadFileToFirebase, setPosts, onClose, router])

  const totalProgress = (() => {
    const all = [...images, ...videos]
    if (all.length === 0) return 0
    return Math.round(all.reduce((s, f) => s + f.progress, 0) / all.length)
  })()

  const allFilesUploading = isSubmitting && [...images, ...videos].some(f => f.status === 'uploading')

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Text input with mentions */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          placeholder="What's on your mind? Use #hashtags and @mentions..."
          rows={4}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
          disabled={isSubmitting}
        />
        {showSuggestions && userSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-2xl z-50">
            {userSuggestions.map(u => (
              <button
                key={u.username}
                type="button"
                onClick={() => insertMention(u.username)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-full bg-orange-600 flex items-center justify-center text-xs text-white shrink-0">
                  {u.username?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">@{u.username}</p>
                  {u.displayName && <p className="text-gray-400 text-xs">{u.displayName}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Character count */}
      <div className="flex justify-between items-center text-xs text-gray-500">
        <span>{text.length} characters</span>
        {extractHashtags(text).length > 0 && (
          <span className="text-orange-400">{extractHashtags(text).length} hashtag{extractHashtags(text).length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Premium toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={() => setIsPremium(v => !v)}
          className={`relative w-10 h-6 rounded-full transition-colors ${isPremium ? 'bg-purple-600' : 'bg-gray-700'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isPremium ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
        <span className="text-sm text-gray-300">
          {isPremium ? 'ðŸ’Ž Premium post (subscribers only)' : 'ðŸŒ Public post'}
        </span>
      </label>

      {/* Image and video file picks */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={isSubmitting || images.length >= MAX_IMAGES}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-800 border border-gray-700 hover:border-orange-500 disabled:opacity-50 rounded-xl text-gray-300 text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Images ({images.length}/{MAX_IMAGES})
        </button>
        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          disabled={isSubmitting || videos.length >= MAX_VIDEOS}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-800 border border-gray-700 hover:border-orange-500 disabled:opacity-50 rounded-xl text-gray-300 text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          Videos ({videos.length}/{MAX_VIDEOS})
        </button>
      </div>

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept={SUPPORTED_IMAGE_TYPES.join(',')} multiple hidden onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files), 'image'); e.target.value = '' }} />
      <input ref={videoInputRef} type="file" accept={SUPPORTED_VIDEO_TYPES.join(',')} multiple hidden onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files), 'video'); e.target.value = '' }} />

      {/* Image previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map(img => (
            <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 group">
              <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
              {img.status === 'uploading' && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-white text-sm font-bold">{img.progress}%</div>
                    <div className="w-12 h-1 bg-gray-600 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${img.progress}%` }} />
                    </div>
                  </div>
                </div>
              )}
              {img.status === 'completed' && (
                <div className="absolute top-1 left-1 bg-green-500 rounded-full p-0.5">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
              )}
              {!isSubmitting && (
                <button
                  type="button"
                  onClick={() => removeFile(img.id, 'image')}
                  className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                <p className="text-white text-[9px] truncate">{formatFileSize(img.size)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video list */}
      {videos.length > 0 && (
        <div className="space-y-2">
          {videos.map(vid => (
            <div key={vid.id} className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl p-2.5">
              <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{vid.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-gray-400 text-[10px]">{formatFileSize(vid.size)}</span>
                  {vid.status === 'uploading' && (
                    <>
                      <span className="text-blue-400 text-[10px]">{vid.progress}%</span>
                      <div className="flex-1 h-1 bg-gray-600 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${vid.progress}%` }} />
                      </div>
                    </>
                  )}
                  {vid.status === 'completed' && <span className="text-green-400 text-[10px]">âœ“ Ready</span>}
                  {vid.status === 'error' && <span className="text-red-400 text-[10px]">Failed</span>}
                  {vid.status === 'pending' && <span className="text-gray-400 text-[10px]">Ready to upload</span>}
                </div>
              </div>
              {!isSubmitting && (
                <button type="button" onClick={() => removeFile(vid.id, 'video')} className="text-red-400 hover:text-red-300 transition-colors shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Overall progress bar while uploading */}
      {allFilesUploading && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Uploading media...</span>
            <span>{totalProgress}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-linear-to-r from-orange-500 to-red-500 rounded-full transition-all duration-300" style={{ width: `${totalProgress}%` }} />
          </div>
        </div>
      )}

      {/* Error and success */}
      {formError && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
          <span className="text-red-400 shrink-0">âš ï¸</span>
          <p className="text-red-400 text-sm">{formError}</p>
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-center">
          <p className="text-green-400 text-sm font-medium">{successMessage}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {onClose && (
          <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-xl text-white text-sm font-medium transition-colors">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || !text.trim() || (images.length === 0 && videos.length === 0)}
          className="flex-1 py-2.5 bg-linear-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 rounded-xl text-white text-sm font-medium transition-opacity"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Uploading...
            </span>
          ) : isPremium ? 'ðŸ’Ž Post (Premium)' : 'ðŸ“¤ Post'}
        </button>
      </div>
    </form>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback, useRef, useMemo, forwardRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  getProgressiveImageUrl,
  getVideoPosterUrl,
  getOptimizedVideoUrl,
  getUltraLightThumbnail,
} from '@/utils/imageOptimizer'
import { getMediaUrl } from '@/lib/firebase'
import { db } from '@/utils/database'

const API_BASE_URL = ''

const GIFT_OPTIONS = [
  { id: 'flower',   name: '🌸 Flower',   icon: '🌸', price: 2,  color: 'from-pink-400 to-pink-600' },
  { id: 'heart',    name: '❤️ Heart',    icon: '❤️', price: 2,  color: 'from-red-400 to-red-600' },
  { id: 'star',     name: '⭐ Star',     icon: '⭐', price: 3,  color: 'from-yellow-400 to-yellow-600' },
  { id: 'crown',    name: '👑 Crown',    icon: '👑', price: 5,  color: 'from-purple-400 to-purple-600' },
  { id: 'diamond',  name: '💎 Diamond',  icon: '💎', price: 10, color: 'from-blue-400 to-cyan-600' },
  { id: 'rocket',   name: '🚀 Rocket',   icon: '🚀', price: 15, color: 'from-orange-400 to-red-600' },
  { id: 'unicorn',  name: '🦄 Unicorn',  icon: '🦄', price: 20, color: 'from-purple-400 to-pink-600' },
  { id: 'treasure', name: '💰 Treasure', icon: '💰', price: 25, color: 'from-yellow-500 to-amber-600' },
  { id: 'fire',     name: '🔥 Fire',     icon: '🔥', price: 30, color: 'from-red-500 to-orange-700' },
  { id: 'dragon',   name: '🐉 Dragon',   icon: '🐉', price: 50, color: 'from-green-500 to-emerald-700' },
]

function renderTextWithHashtagsAndMentions(text: string, router: ReturnType<typeof useRouter>) {
  if (!text) return null
  const regex = /(#[\w֐-׿Ѐ-ӿ]+)|(@[\w֐-׿Ѐ-ӿ]+)/gi
  const parts = text.split(regex)
  return parts.map((part, index) => {
    if (!part) return null
    if (/^#[\w֐-׿Ѐ-ӿ]+$/gi.test(part)) {
      const hashtag = part.slice(1).toLowerCase()
      return (
        <Link key={index} href={`/hashtag/${hashtag}`}
          className="text-blue-500 hover:text-blue-400 hover:underline font-semibold cursor-pointer"
          onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(`/hashtag/${hashtag}`) }}>
          {part}
        </Link>
      )
    }
    if (/^@[\w֐-׿Ѐ-ӿ]+$/gi.test(part)) {
      const username = part.slice(1)
      return (
        <Link key={index} href={`/profile/${username}`}
          className="text-blue-500 hover:text-blue-400 hover:underline font-semibold cursor-pointer"
          onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(`/profile/${username}`) }}>
          {part}
        </Link>
      )
    }
    return <span key={index} className="text-white">{part}</span>
  })
}

const OptimizedImage = forwardRef<HTMLImageElement, any>(
  ({ src, alt, className, onError, onLoad, index, currentIndex, priority = false, ...props }, externalRef) => {
    const cdnSrc = useMemo(() => getMediaUrl(src), [src])
    const [currentSrc, setCurrentSrc] = useState<string | undefined>(undefined)
    const [isLoaded, setIsLoaded] = useState(false)
    const [error, setError] = useState(false)
    const imgRef = useRef<HTMLImageElement>(null)
    const mountedRef = useRef(true)
    const highResLoadedRef = useRef(false)

    useEffect(() => {
      if (!cdnSrc) return
      setIsLoaded(false); setError(false); highResLoadedRef.current = false; mountedRef.current = true
      setCurrentSrc(getProgressiveImageUrl(cdnSrc, 'ultra-low', 8, 30))
      const low = new Image(); low.src = getProgressiveImageUrl(cdnSrc, 'low', 15, 80)
      low.onload = () => { if (mountedRef.current && !highResLoadedRef.current) { setCurrentSrc(low.src); setIsLoaded(true) } }
      const med = new Image(); med.src = getProgressiveImageUrl(cdnSrc, 'medium', 45, 400)
      med.onload = () => { if (mountedRef.current) { setCurrentSrc(med.src); if (onLoad) onLoad() } }
      const hi = new Image(); hi.src = getProgressiveImageUrl(cdnSrc, 'high', 70, 1200)
      hi.onload = () => { if (mountedRef.current) { highResLoadedRef.current = true; setCurrentSrc(hi.src) } }
      return () => { mountedRef.current = false }
    }, [cdnSrc, index, currentIndex, onLoad, priority])

    if (!cdnSrc || !currentSrc) return null
    return (
      <div className="relative w-full h-full overflow-hidden bg-gray-800">
        {!isLoaded && !error && <div className="absolute inset-0 bg-linear-to-r from-gray-800 via-gray-700 to-gray-800 animate-pulse" />}
        <img ref={(node) => {
          (imgRef as any).current = node
          if (typeof externalRef === 'function') externalRef(node)
          else if (externalRef) (externalRef as any).current = node
        }}
          src={currentSrc} alt={alt}
          className={`${className} transition-all duration-300`}
          style={{ filter: !isLoaded ? 'blur(12px)' : 'blur(0px)', transform: 'scale(1.02)', transition: 'filter 0.3s ease-out, transform 0.3s ease-out' }}
          {...props}
        />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="text-center">
              <p className="text-gray-400 text-sm">Failed to load image</p>
              <button onClick={() => { setError(false); setIsLoaded(false) }}
                className="mt-2 px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600">Retry</button>
            </div>
          </div>
        )}
      </div>
    )
  }
)
OptimizedImage.displayName = 'OptimizedImage'

const OptimizedVideo = forwardRef<HTMLVideoElement, any>(
  ({ src, className, onError, poster, index, currentIndex, autoPlay = false, ...props }, externalRef) => {
    const cdnSrc = useMemo(() => getMediaUrl(src), [src])
    const [videoBlobUrl, setVideoBlobUrl] = useState('')
    const [isLoaded, setIsLoaded] = useState(false)
    const [error, setError] = useState(false)
    const [showPoster, setShowPoster] = useState(true)
    const videoRef = useRef<HTMLVideoElement>(null)
    const mountedRef = useRef(true)

    const posterUrl = useMemo(() => poster || (cdnSrc ? getVideoPosterUrl(cdnSrc) : ''), [cdnSrc, poster])

    const fetchWithByteRange = useCallback(async (videoUrl: string) => {
      if (!videoUrl) return
      try {
        const cached = await db?.videos?.get(videoUrl)
        if (cached?.blobUrl) { setVideoBlobUrl(cached.blobUrl); setIsLoaded(true); setShowPoster(false); return }
      } catch {}
      try {
        const firstChunkRes = await fetch(videoUrl, { headers: { 'Range': 'bytes=0-524288' }, cache: 'force-cache' })
        if (!firstChunkRes.ok) throw new Error('fetch failed')
        const firstBlob = await firstChunkRes.blob()
        const firstUrl = URL.createObjectURL(firstBlob)
        if (mountedRef.current) { setVideoBlobUrl(firstUrl); setIsLoaded(true); setShowPoster(false) }
        const headRes = await fetch(videoUrl, { method: 'HEAD', cache: 'force-cache' })
        const fileSize = parseInt(headRes.headers.get('content-length') || '0')
        if (fileSize > 524288) {
          const remRes = await fetch(videoUrl, { headers: { 'Range': `bytes=524289-${fileSize}` }, cache: 'force-cache' })
          if (remRes.ok) {
            const remBlob = await remRes.blob()
            const fullBlob = new Blob([firstBlob, remBlob], { type: 'video/mp4' })
            const fullUrl = URL.createObjectURL(fullBlob)
            if (videoRef.current?.src === firstUrl) {
              const wasPlaying = !videoRef.current.paused
              const ct = videoRef.current.currentTime
              videoRef.current.src = fullUrl
              videoRef.current.currentTime = ct
              if (wasPlaying) videoRef.current.play().catch(() => {})
            }
            try { await db?.videos?.put({ url: videoUrl, blobUrl: fullUrl, timestamp: Date.now() }) } catch {}
          }
        }
      } catch {
        setVideoBlobUrl(getOptimizedVideoUrl(videoUrl))
        setIsLoaded(true)
        setShowPoster(false)
      }
    }, [])

    useEffect(() => {
      if (!cdnSrc) return
      setIsLoaded(false); setError(false); setShowPoster(true); mountedRef.current = true
      if (videoBlobUrl?.startsWith('blob:')) URL.revokeObjectURL(videoBlobUrl)
      fetchWithByteRange(cdnSrc)
      return () => { mountedRef.current = false }
    }, [cdnSrc, index, currentIndex])

    return (
      <div className="relative w-full h-full overflow-hidden bg-gray-800">
        {showPoster && posterUrl && !isLoaded && !error && (
          <img src={posterUrl} alt="Video thumbnail" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'blur(4px)', transform: 'scale(1.02)' }} loading="eager" />
        )}
        {!isLoaded && !error && !showPoster && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 z-10">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <video key={`${cdnSrc}-${index}-${currentIndex}`}
          ref={(node) => {
            (videoRef as any).current = node
            if (typeof externalRef === 'function') externalRef(node)
            else if (externalRef) (externalRef as any).current = node
          }}
          src={videoBlobUrl || undefined}
          className={`${className} transition-opacity duration-150 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          poster={posterUrl || undefined} playsInline preload="metadata"
          onLoadedData={() => { if (mountedRef.current) { setIsLoaded(true); setTimeout(() => setShowPoster(false), 100) } }}
          onCanPlay={() => { if (mountedRef.current) { setIsLoaded(true); setShowPoster(false) } }}
          onError={() => { if (mountedRef.current) { setError(true); setIsLoaded(false); if (onError) onError() } }}
          {...props}
        />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="text-center">
              <p className="text-gray-400 text-sm">Failed to load video</p>
              <button onClick={() => { setError(false); setIsLoaded(false); setShowPoster(true); fetchWithByteRange(cdnSrc) }}
                className="mt-2 px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600">Retry</button>
            </div>
          </div>
        )}
      </div>
    )
  }
)
OptimizedVideo.displayName = 'OptimizedVideo'

function GiftAnimation({ gift, onComplete }: { gift: any; onComplete: () => void }) {
  useEffect(() => {
    const t = setTimeout(onComplete, 2000)
    return () => clearTimeout(t)
  }, [onComplete])
  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-[100]">
      <div className="animate-bounce text-6xl">{gift.icon}</div>
      <div className="absolute bottom-1/4 left-1/2 transform -translate-x-1/2 text-center">
        <div className="text-white font-bold text-xl bg-black bg-opacity-50 px-4 py-2 rounded-full">+{gift.price} coins</div>
      </div>
    </div>
  )
}

interface CardProps {
  post: any
  currentUser?: any
  setCurrentUser?: (u: any) => void
  isProfileOwner?: boolean
  isSubscribed?: boolean
  handlePremiumPostClick?: (post: any) => void
  handleEditPost?: (post: any) => void
  handleEditPremiumPost?: (post: any) => void
  handleDeletePost?: (id: string) => void
  handleDeletePremiumPost?: (id: string) => void
  renderTextWithHashtags?: (text: string) => React.ReactNode
  onFollow?: (username: string) => Promise<void>
  onUnfollow?: (username: string) => Promise<void>
  isFollowing?: boolean
  followLoading?: boolean
  onLike?: () => void
  onPostUpdate?: (id: string, data: any) => void
  isAdmin?: boolean
  connectionSpeed?: string
  onBoost?: (post: any) => void
  showBoostButton?: boolean
  setPosts?: (post: any, replaceTempId?: string) => void
}

export default function Card({
  post,
  currentUser: currentUserProp,
  setCurrentUser,
  isProfileOwner = false,
  isSubscribed = false,
  handlePremiumPostClick,
  handleEditPost,
  handleEditPremiumPost,
  handleDeletePost,
  handleDeletePremiumPost,
  renderTextWithHashtags,
  onFollow,
  onUnfollow,
  isFollowing = false,
  followLoading = false,
  onLike,
  onPostUpdate,
  isAdmin = false,
  connectionSpeed = 'fast',
  onBoost,
  showBoostButton = true,
}: CardProps) {
  const router = useRouter()
  const { currentUser: authUser, setCurrentUser: authSetCurrentUser } = useAuth()
  const currentUser = currentUserProp ?? authUser

  const stablePostId = useMemo(() =>
    post?.id || post?._id || `${post?.username}-${post?.timestamp}`, [post?.id, post?._id, post?.username, post?.timestamp])

  const [likes, setLikes] = useState(0)
  const [isLiked, setIsLiked] = useState(false)
  const [views, setViews] = useState(post?.views || 0)
  const [showComments, setShowComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [comments, setComments] = useState<any[]>(post?.comments || [])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0)
  const [profilePicture] = useState(post?.user?.profilePicture || null)
  const [imageError, setImageError] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [isProcessingLike, setIsProcessingLike] = useState(false)
  const [isProcessingComment, setIsProcessingComment] = useState(false)
  const [localIsFollowing, setLocalIsFollowing] = useState(isFollowing)
  const [localFollowLoading, setLocalFollowLoading] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [showScrubber, setShowScrubber] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [scrubPosition, setScrubPosition] = useState(0)
  const [scrubPreviewTime, setScrubPreviewTime] = useState(0)
  const [scrubStartX, setScrubStartX] = useState<number | null>(null)
  const [isWriteUpExpanded, setIsWriteUpExpanded] = useState(false)
  const [locationDisplay, setLocationDisplay] = useState<string | null>(null)
  const [isFetchingLocation, setIsFetchingLocation] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedText, setEditedText] = useState(post?.text || '')
  const [isDeleted, setIsDeleted] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [localPost, setLocalPost] = useState<any>(post)
  const [viewTracked, setViewTracked] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const [showGiftModal, setShowGiftModal] = useState(false)
  const [selectedGift, setSelectedGift] = useState<any>(null)
  const [isSendingGift, setIsSendingGift] = useState(false)
  const [giftAnimation, setGiftAnimation] = useState<any>(null)
  const [giftsReceived, setGiftsReceived] = useState<any[]>([])
  const [totalGiftsValue, setTotalGiftsValue] = useState(0)
  const [isBoosted, setIsBoosted] = useState(false)
  const [boostInfo, setBoostInfo] = useState<any>(null)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [mediaIndex, setMediaIndex] = useState(0)
  const [sliderOffset, setSliderOffset] = useState(0)
  const [isSliding, setIsSliding] = useState(false)

  const isSwipingRef = useRef(false)
  const lastSwipeTimeRef = useRef(0)
  const navigateLockRef = useRef(false)
  const swipeTimeoutRef = useRef<any>(null)
  const swipeTriggeredRef = useRef(false)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const swipeDirectionLockRef = useRef<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const sliderDragStartX = useRef<number | null>(null)
  const sliderDragStartY = useRef<number | null>(null)
  const sliderDirRef = useRef<'h' | 'v' | null>(null)
  const sliderContainerW = useRef(350)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const singleTapTimeoutRef = useRef<any>(null)
  const scrubTimeoutRef = useRef<any>(null)
  const fetchTimeoutRef = useRef<any>(null)
  const downloadMenuTimeoutRef = useRef<any>(null)
  const lastTapTimeRef = useRef(0)
  const tapCountRef = useRef(0)
  const trackedInMemoryRef = useRef(false)
  const isUpdatingCommentsRef = useRef(false)
  const locationFetchedRef = useRef(false)
  const preloadCacheRef = useRef(new Map<string, boolean>())

  const postId = stablePostId

  const ChevronLeftIcon = () => (
    <svg className="w-3 h-3 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
    </svg>
  )
  const ChevronRightIcon = () => (
    <svg className="w-3 h-3 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
    </svg>
  )

  const fetchGifts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(`${API_BASE_URL}/api/auth/posts/${postId}/gifts`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      if (data.gifts && Array.isArray(data.gifts)) {
        setGiftsReceived(data.gifts)
        setTotalGiftsValue(data.totalValue || data.gifts.reduce((s: number, g: any) => s + (g.price || 0), 0))
      }
    } catch {}
  }, [postId])

  useEffect(() => { if (postId && currentUser) fetchGifts() }, [postId, currentUser, fetchGifts])

  const handleSendGift = useCallback(async (gift: any) => {
    if (!currentUser?.username) { alert('Please log in to send gifts'); router.push('/login'); return }
    if (currentUser.username === localPost?.username) { alert('You cannot send gifts to yourself'); return }
    setIsSendingGift(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) throw new Error('Authentication required')
      const res = await fetch(`${API_BASE_URL}/api/auth/posts/${postId}/gift`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftId: gift.id, giftName: gift.name, giftIcon: gift.icon, price: gift.price }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Failed to send gift') }
      const data = await res.json()
      setGiftAnimation(gift); setTimeout(() => setGiftAnimation(null), 2000)
      setGiftsReceived(prev => [...prev, data.gift])
      setTotalGiftsValue(prev => prev + gift.price)
      const meRes = await fetch(`${API_BASE_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (meRes.ok) {
        const updatedUser = await meRes.json()
        const setter = setCurrentUser || authSetCurrentUser
        if (setter) setter((prev: any) => ({ ...prev, balance: updatedUser.balance, coinBalance: updatedUser.coinBalance }))
      }
      setShowGiftModal(false); setSelectedGift(null)
      alert(`🎁 You sent a ${gift.icon} ${gift.name} to @${localPost?.username}!`)
    } catch (error: any) { alert(error.message) }
    finally { setIsSendingGift(false) }
  }, [currentUser, localPost, postId, router, setCurrentUser, authSetCurrentUser])

  useEffect(() => {
    if (localPost) {
      const hasValidBoost = localPost.isBoosted === true && localPost.boostExpiresAt && new Date(localPost.boostExpiresAt) > new Date()
      setIsBoosted(hasValidBoost)
      setBoostInfo(hasValidBoost ? localPost.boostInfo || { expiresAt: localPost.boostExpiresAt, priority: localPost.boostPriority } : null)
    }
  }, [localPost])

  const handleBoostClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault()
    if (!currentUser?.username) { alert('Please log in to boost your posts'); router.push('/login'); return }
    if (localPost?.username !== currentUser.username) { alert('You can only boost your own posts'); return }
    if (onBoost) { onBoost(localPost) } else { router.push('/boost') }
  }, [localPost, currentUser, router, onBoost])

  const preloadAllMedia = useCallback(() => {
    if (!localPost) return
    localPost.images?.forEach((imgUrl: string, idx: number) => {
      const cdn = getMediaUrl(imgUrl)
      if (!preloadCacheRef.current.has(`u-${cdn}`)) {
        const u = new Image(); u.src = getProgressiveImageUrl(cdn, 'ultra-low', 8, 30); preloadCacheRef.current.set(`u-${cdn}`, true)
        setTimeout(() => { const m = new Image(); m.src = getProgressiveImageUrl(cdn, 'medium', 45, 400); preloadCacheRef.current.set(`m-${cdn}`, true) }, idx * 50)
      }
    })
    localPost.videos?.forEach((vidUrl: string) => {
      const cdn = getMediaUrl(vidUrl)
      if (!preloadCacheRef.current.has(`v-${cdn}`)) {
        const p = getVideoPosterUrl(cdn); if (p) { const i = new Image(); i.src = p }
        fetch(cdn, { headers: { 'Range': 'bytes=0-102400' }, cache: 'force-cache' }).catch(() => {})
        preloadCacheRef.current.set(`v-${cdn}`, true)
      }
    })
  }, [localPost])

  useEffect(() => {
    if (!cardRef.current) return
    const obs = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) { preloadAllMedia(); obs.disconnect() } }, { threshold: 0.01, rootMargin: '300px' })
    obs.observe(cardRef.current)
    return () => obs.disconnect()
  }, [localPost, preloadAllMedia])

  const memoizedPost = useMemo(() => {
    if (!post) return null
    return { ...post, id: post.id || post._id, _id: post._id || post.id }
  }, [post?.id, post?._id, post?.text, post?.images, post?.videos, post?.likes, post?.comments, post?.timestamp, post?.username, post?.isPremium])

  useEffect(() => {
    if (memoizedPost && JSON.stringify(memoizedPost) !== JSON.stringify(localPost)) {
      setLocalPost(memoizedPost); setViewTracked(false); trackedInMemoryRef.current = false
      locationFetchedRef.current = false; setLocationDisplay(null)
      setCurrentImageIndex(0); setCurrentVideoIndex(0); setImageError(false); setVideoError(false)
      swipeDirectionLockRef.current = null; swipeTriggeredRef.current = false; navigateLockRef.current = false
      preloadCacheRef.current.clear()
    }
  }, [memoizedPost])

  useEffect(() => {
    if (!localPost) return
    let likeCount = 0; let userLiked = false
    if (Array.isArray(localPost.likes)) { likeCount = localPost.likes.length; userLiked = currentUser ? localPost.likes.includes(currentUser.username) : false }
    else if (typeof localPost.likes === 'number') { likeCount = localPost.likes; userLiked = localPost.userLiked || false }
    setLikes(likeCount); setIsLiked(userLiked)
  }, [localPost, currentUser])

  const fetchUserLocation = useCallback(async () => {
    if (!localPost?.username || locationDisplay || isFetchingLocation || locationFetchedRef.current) return
    if (localPost.city || localPost.country) {
      const d = localPost.city && localPost.country ? `${localPost.city}, ${localPost.country}` : localPost.city || localPost.country
      if (d) { setLocationDisplay(d); locationFetchedRef.current = true; return }
    }
    locationFetchedRef.current = true; setIsFetchingLocation(true)
    try {
      const token = localStorage.getItem('token')
      const headers: any = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${API_BASE_URL}/api/auth/public/users/${localPost.username}`, { headers })
      if (res.ok) {
        const u = await res.json()
        const d = u.city && u.country ? `${u.city}, ${u.country}` : u.city || u.country || u.location
        if (d) setLocationDisplay(d)
      }
    } catch {} finally { setIsFetchingLocation(false) }
  }, [localPost?.username, localPost?.city, localPost?.country, locationDisplay, isFetchingLocation])

  useEffect(() => {
    if (localPost?.username && !locationDisplay && !isFetchingLocation && !locationFetchedRef.current) fetchUserLocation()
  }, [localPost?.username, locationDisplay, isFetchingLocation, fetchUserLocation])

  useEffect(() => { if (localPost?.views !== undefined) setViews(localPost.views) }, [localPost?.views])

  useEffect(() => {
    if (!isUpdatingCommentsRef.current && localPost?.comments && Array.isArray(localPost.comments)) {
      if (JSON.stringify(comments) !== JSON.stringify(localPost.comments)) setComments(localPost.comments)
    }
  }, [localPost?.comments])

  useEffect(() => {
    if (!postId || isDeleted || viewTracked || trackedInMemoryRef.current) return
    if (localPost?.isPremium && !isAdmin && !isSubscribed && !isProfileOwner && currentUser) return
    let hasTriggered = false
    const trackView = () => {
      if (hasTriggered || trackedInMemoryRef.current) return
      hasTriggered = true; trackedInMemoryRef.current = true; setViewTracked(true)
      const token = localStorage.getItem('token')
      const endpoint = localPost?.isPremium
        ? (token ? `/api/auth/premium-posts/${postId}/views` : `/api/auth/public/premium-posts/${postId}/views`)
        : (token ? `/api/auth/posts/${postId}/views` : `/api/auth/public/posts/${postId}/views`)
      const headers: any = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      fetch(endpoint, { method: 'POST', headers, cache: 'no-cache' })
        .then(r => r.json()).then(d => { if (d.views !== undefined) setViews(d.views); if (onPostUpdate) onPostUpdate(postId, { views: d.views }) }).catch(() => {})
    }
    const obs = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) trackView() }, { threshold: 0.1 })
    const t = setTimeout(() => { if (cardRef.current) obs.observe(cardRef.current) }, 100)
    return () => { clearTimeout(t); obs.disconnect() }
  }, [postId, localPost?.isPremium, isSubscribed, isProfileOwner, currentUser, onPostUpdate, isDeleted, viewTracked, isAdmin])

  useEffect(() => { if (localIsFollowing !== isFollowing) setLocalIsFollowing(isFollowing) }, [isFollowing])
  useEffect(() => { if (localPost?.text && !isEditing && editedText !== localPost.text) setEditedText(localPost.text) }, [localPost?.text, isEditing])

  const formatTime = useCallback((time: number) => {
    if (!time || isNaN(time)) return '0:00'
    return `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`
  }, [])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && !isScrubbing) {
      setCurrentTime(videoRef.current.currentTime)
      setDuration(videoRef.current.duration || 0)
    }
  }, [isScrubbing])

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) { setDuration(videoRef.current.duration || 0); setVideoError(false) }
  }, [])

  const updateScrubPosition = useCallback((e: any) => {
    if (!isScrubbing || !videoRef.current || !videoContainerRef.current) return
    const clientX = e.clientX || e.touches?.[0]?.clientX; if (!clientX) return
    const rect = videoContainerRef.current.getBoundingClientRect()
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setScrubPosition(pos); setScrubPreviewTime(pos * duration)
  }, [isScrubbing, duration])

  const finishScrubbing = useCallback(() => {
    if (!isScrubbing || !videoRef.current || duration <= 0) return
    setIsScrubbing(false)
    videoRef.current.currentTime = scrubPosition * duration
    videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
    if (scrubTimeoutRef.current) clearTimeout(scrubTimeoutRef.current)
    scrubTimeoutRef.current = setTimeout(() => setShowScrubber(false), 2000)
  }, [isScrubbing, scrubPosition, duration])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!localPost?.videos?.length || !videoRef.current) return
    e.preventDefault(); e.stopPropagation(); setScrubStartX(e.clientX); setShowScrubber(true)
  }, [localPost?.videos?.length])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (scrubStartX === null || !videoRef.current) return
    if (Math.abs(e.clientX - scrubStartX) > 10 && !isScrubbing) {
      setIsScrubbing(true); if (!videoRef.current.paused) { videoRef.current.pause(); setIsPlaying(false) }
    }
    if (isScrubbing) updateScrubPosition(e)
  }, [scrubStartX, isScrubbing, updateScrubPosition])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (scrubStartX === null) return; if (isScrubbing) finishScrubbing(); setScrubStartX(null)
  }, [scrubStartX, isScrubbing, finishScrubbing])

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    if (scrubStartX === null) return; if (isScrubbing) finishScrubbing(); setScrubStartX(null)
  }, [scrubStartX, isScrubbing, finishScrubbing])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!localPost?.videos?.length || !videoRef.current) return
    setScrubStartX(e.touches[0].clientX); setShowScrubber(true)
  }, [localPost?.videos?.length])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (scrubStartX === null || !videoRef.current) return
    const curr = e.touches[0].clientX
    if (Math.abs(curr - scrubStartX) > 10 && !isScrubbing) {
      setIsScrubbing(true); if (!videoRef.current.paused) { videoRef.current.pause(); setIsPlaying(false) }
    }
    if (isScrubbing) updateScrubPosition(e as any)
  }, [scrubStartX, isScrubbing, updateScrubPosition])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (scrubStartX === null) return; if (isScrubbing) finishScrubbing(); setScrubStartX(null)
  }, [scrubStartX, isScrubbing, finishScrubbing])

  const handleVideoMouseMove = useCallback((e: React.MouseEvent) => {
    if (localPost?.videos?.length > 0 && !isScrubbing) {
      setShowScrubber(true)
      if (scrubTimeoutRef.current) clearTimeout(scrubTimeoutRef.current)
      scrubTimeoutRef.current = setTimeout(() => setShowScrubber(false), 2000)
    }
  }, [localPost?.videos?.length, isScrubbing])

  const handleCombinedMouseMove = useCallback((e: React.MouseEvent) => {
    handleVideoMouseMove(e); if (localPost?.videos?.length > 0) handleMouseMove(e)
  }, [handleVideoMouseMove, localPost?.videos?.length, handleMouseMove])

  const fetchSuggestions = useCallback(async (query: string) => {
    try {
      const token = localStorage.getItem('token'); if (!token) return
      const res = await fetch(`${API_BASE_URL}/api/auth/posts/hashtag/${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) { setSuggestions(await res.json() || []); setShowSuggestions(true) }
    } catch { setSuggestions([]); setShowSuggestions(false) }
  }, [])

  const handleCommentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value; setNewComment(val)
    const lastSpace = val.lastIndexOf(' ')
    const lastPart = lastSpace >= 0 ? val.slice(lastSpace + 1) : val
    if (lastPart.startsWith('#') && lastPart.length > 1) fetchSuggestions(lastPart.slice(1))
    else { setShowSuggestions(false); setSuggestions([]) }
  }, [fetchSuggestions])

  const handleSuggestionClick = useCallback((suggestion: any) => {
    const lastSpace = newComment.lastIndexOf(' ')
    const before = lastSpace >= 0 ? newComment.slice(0, lastSpace + 1) : ''
    setNewComment(before + '#' + suggestion.hashtag + ' ')
    setShowSuggestions(false); setSuggestions([])
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [newComment])

  const handleCopyLink = useCallback(async () => {
    try {
      const link = `${window.location.origin}/post/${localPost?.id || postId}`
      await navigator.clipboard.writeText(link)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = `${window.location.origin}/post/${localPost?.id || postId}`
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000)
  }, [localPost?.id, postId])

  const handleCommentSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || isProcessingComment) return
    if (!currentUser?.username) { alert('Please log in to comment on posts'); return }
    setIsProcessingComment(true); isUpdatingCommentsRef.current = true
    const currentPostId = localPost?.id || localPost?._id || postId
    const prevComments = [...comments]
    const tempComment = { id: `temp-${Date.now()}`, username: currentUser.username, text: newComment.trim(), timestamp: new Date().toISOString() }
    setComments([...comments, tempComment]); const commentText = newComment.trim(); setNewComment('')
    try {
      const token = localStorage.getItem('token'); if (!token) throw new Error('Authentication required')
      const endpoint = localPost?.isPremium
        ? `${API_BASE_URL}/api/auth/premium-posts/${currentPostId}/comment`
        : `${API_BASE_URL}/api/auth/posts/${currentPostId}/comment`
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: commentText }) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `Failed to comment`) }
      const data = await res.json()
      const serverComments = data.comments || data.post?.comments || data.data?.comments || [...comments, tempComment]
      setComments(serverComments)
      if (localPost) setLocalPost({ ...localPost, comments: serverComments })
      if (onPostUpdate) onPostUpdate(currentPostId, { comments: serverComments })
    } catch (error: any) { setComments(prevComments); alert(`Failed to comment: ${error.message}`) }
    finally { setIsProcessingComment(false); setTimeout(() => { isUpdatingCommentsRef.current = false }, 500) }
  }, [localPost, newComment, isProcessingComment, currentUser?.username, comments, onPostUpdate, postId])

  const handleEditClick = useCallback(() => {
    if (localPost?.isPremium) handleEditPremiumPost?.(localPost)
    else { setIsEditing(true); setEditedText(localPost?.text || '') }
  }, [localPost, handleEditPremiumPost])

  const handleDeleteClick = useCallback(async () => {
    if (!window.confirm('Are you sure you want to delete this post?')) return
    setIsDeleting(true)
    try {
      const token = localStorage.getItem('token'); if (!token) throw new Error('Authentication required')
      const deleteId = localPost?.id || localPost?._id
      const endpoint = localPost?.isPremium ? `${API_BASE_URL}/api/auth/premium-posts/${deleteId}` : `${API_BASE_URL}/api/auth/posts/${deleteId}`
      const res = await fetch(endpoint, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
      if (localPost?.isPremium && handleDeletePremiumPost) handleDeletePremiumPost(deleteId)
      else if (handleDeletePost) handleDeletePost(deleteId)
      setIsDeleted(true)
    } catch (error: any) { setIsDeleting(false); alert(`Failed to delete post: ${error.message}`) }
  }, [localPost, handleDeletePremiumPost, handleDeletePost])

  const handleSaveEdit = useCallback(async () => {
    if (!editedText.trim() || isSavingEdit) return
    setIsSavingEdit(true)
    try {
      const token = localStorage.getItem('token'); if (!token) throw new Error('Authentication required')
      const endpoint = localPost?.isPremium ? `${API_BASE_URL}/api/auth/premium-posts/${localPost?.id}` : `${API_BASE_URL}/api/auth/posts/${localPost?.id}`
      const res = await fetch(endpoint, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: editedText.trim() }) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Failed to edit post') }
      const updated = await res.json()
      if (updated.text) {
        const updatedLocalPost = { ...localPost, text: updated.text }
        setLocalPost(updatedLocalPost)
        if (localPost?.isPremium) handleEditPremiumPost?.(updatedLocalPost); else handleEditPost?.(updatedLocalPost)
        setIsEditing(false)
      }
    } catch (error: any) { alert(`Failed to edit post: ${error.message}`) }
    finally { setIsSavingEdit(false) }
  }, [localPost, editedText, isSavingEdit, handleEditPremiumPost, handleEditPost])

  const handleCancelEdit = useCallback(() => { setIsEditing(false); setEditedText(localPost?.text || '') }, [localPost?.text])

  const handlePremiumClick = useCallback(() => {
    if (localPost?.isPremium && !isSubscribed && !isProfileOwner && !isAdmin) {
      if (handlePremiumPostClick) handlePremiumPostClick(localPost)
    }
  }, [localPost, isSubscribed, isProfileOwner, isAdmin, handlePremiumPostClick])

  const goToNextImage = useCallback(() => {
    if (!localPost?.images?.length || navigateLockRef.current) return
    const next = (currentImageIndex + 1) % localPost.images.length
    navigateLockRef.current = true; setImageError(false); setCurrentImageIndex(next)
    setTimeout(() => { navigateLockRef.current = false }, 200)
  }, [localPost?.images, currentImageIndex])

  const goToPrevImage = useCallback(() => {
    if (!localPost?.images?.length || navigateLockRef.current) return
    const prev = (currentImageIndex - 1 + localPost.images.length) % localPost.images.length
    navigateLockRef.current = true; setImageError(false); setCurrentImageIndex(prev)
    setTimeout(() => { navigateLockRef.current = false }, 200)
  }, [localPost?.images, currentImageIndex])

  const goToNextVideo = useCallback(() => {
    if (!localPost?.videos?.length || navigateLockRef.current) return
    const next = (currentVideoIndex + 1) % localPost.videos.length
    navigateLockRef.current = true; setVideoError(false); setIsPlaying(false)
    if (videoRef.current) videoRef.current.pause()
    setCurrentTime(0); setDuration(0); setScrubPosition(0); setCurrentVideoIndex(next)
    setTimeout(() => { navigateLockRef.current = false }, 200)
  }, [localPost?.videos, currentVideoIndex])

  const goToPrevVideo = useCallback(() => {
    if (!localPost?.videos?.length || navigateLockRef.current) return
    const prev = (currentVideoIndex - 1 + localPost.videos.length) % localPost.videos.length
    navigateLockRef.current = true; setVideoError(false); setIsPlaying(false)
    if (videoRef.current) videoRef.current.pause()
    setCurrentTime(0); setDuration(0); setScrubPosition(0); setCurrentVideoIndex(prev)
    setTimeout(() => { navigateLockRef.current = false }, 200)
  }, [localPost?.videos, currentVideoIndex])

  // Unified media slider
  const allMedia = useMemo(() => [
    ...(localPost?.videos || []).map((url: string, idx: number) => ({ type: 'video' as const, url, idx })),
    ...(localPost?.images || []).map((url: string, idx: number) => ({ type: 'image' as const, url, idx })),
  ], [localPost?.videos, localPost?.images])

  const sliderGoTo = useCallback((n: number) => {
    if (n < 0 || n >= allMedia.length || navigateLockRef.current) return
    if (allMedia[mediaIndex]?.type === 'video' && videoRef.current) { videoRef.current.pause(); setIsPlaying(false) }
    setImageError(false); setVideoError(false); setCurrentTime(0); setDuration(0); setScrubPosition(0)
    navigateLockRef.current = true; setMediaIndex(n)
    setTimeout(() => { navigateLockRef.current = false }, 300)
  }, [allMedia, mediaIndex])

  const sliderStart = useCallback((clientX: number, clientY: number, w: number) => {
    sliderDragStartX.current = clientX; sliderDragStartY.current = clientY
    sliderDirRef.current = null; sliderContainerW.current = w; setIsSliding(true)
  }, [])

  const sliderMove = useCallback((clientX: number, clientY: number) => {
    if (sliderDragStartX.current === null || sliderDragStartY.current === null) return
    const dx = clientX - sliderDragStartX.current; const dy = clientY - sliderDragStartY.current
    if (sliderDirRef.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) sliderDirRef.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
      return
    }
    if (sliderDirRef.current !== 'h') { setSliderOffset(0); return }
    const N = allMedia.length
    const resist = (mediaIndex === 0 && dx > 0) || (mediaIndex === N - 1 && dx < 0)
    setSliderOffset(resist ? dx * 0.25 : dx)
  }, [allMedia.length, mediaIndex])

  const sliderEnd = useCallback((clientX: number) => {
    if (sliderDragStartX.current === null) { setIsSliding(false); setSliderOffset(0); return }
    const dx = sliderDirRef.current === 'h' ? clientX - sliderDragStartX.current : 0
    const threshold = sliderContainerW.current * 0.28
    let next = mediaIndex
    if (dx < -threshold && mediaIndex < allMedia.length - 1) next = mediaIndex + 1
    else if (dx > threshold && mediaIndex > 0) next = mediaIndex - 1
    if (next !== mediaIndex) {
      if (allMedia[mediaIndex]?.type === 'video' && videoRef.current) { videoRef.current.pause(); setIsPlaying(false) }
      setImageError(false); setVideoError(false); setCurrentTime(0); setDuration(0); setScrubPosition(0)
      navigateLockRef.current = true; setTimeout(() => { navigateLockRef.current = false }, 300)
    }
    setMediaIndex(next); setSliderOffset(0); setIsSliding(false)
    sliderDragStartX.current = null; sliderDragStartY.current = null; sliderDirRef.current = null
  }, [allMedia, mediaIndex])

  const handleImageTouchStart = useCallback((e: React.TouchEvent) => {
    if (!localPost?.images?.length || localPost.images.length <= 1 || navigateLockRef.current) return
    setTouchStart(e.touches[0].clientX); isSwipingRef.current = true; swipeDirectionLockRef.current = null; swipeTriggeredRef.current = false
    e.preventDefault()
  }, [localPost?.images])

  const handleImageTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwipingRef.current || touchStart === null || !localPost?.images?.length || localPost.images.length <= 1) return
    const diff = e.touches[0].clientX - touchStart
    if (Math.abs(diff) > 10) {
      e.preventDefault()
      if (swipeDirectionLockRef.current === null && Math.abs(diff) > 15) swipeDirectionLockRef.current = diff > 0 ? 'right' : 'left'
      if (imageContainerRef.current) {
        imageContainerRef.current.style.transform = `translateX(${Math.min(Math.max(diff * 0.3, -80), 80)}px)`
        imageContainerRef.current.style.transition = 'none'
      }
    }
  }, [touchStart, localPost?.images])

  const handleImageTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isSwipingRef.current || touchStart === null) {
      if (imageContainerRef.current) { imageContainerRef.current.style.transform = ''; imageContainerRef.current.style.transition = '' }
      setTouchStart(null); isSwipingRef.current = false; swipeDirectionLockRef.current = null; return
    }
    const endX = e.changedTouches?.[0]?.clientX || touchStart
    const diff = endX - touchStart
    if (imageContainerRef.current) { imageContainerRef.current.style.transform = ''; imageContainerRef.current.style.transition = 'transform 0.2s ease-out' }
    if (!swipeTriggeredRef.current && !navigateLockRef.current && (Date.now() - lastSwipeTimeRef.current > 400)) {
      if (diff < -50) { swipeTriggeredRef.current = true; lastSwipeTimeRef.current = Date.now(); goToNextImage() }
      else if (diff > 50) { swipeTriggeredRef.current = true; lastSwipeTimeRef.current = Date.now(); goToPrevImage() }
    }
    setTouchStart(null); isSwipingRef.current = false; swipeDirectionLockRef.current = null
    setTimeout(() => { if (imageContainerRef.current) imageContainerRef.current.style.transition = '' }, 200)
  }, [touchStart, goToNextImage, goToPrevImage])

  const handleFollowClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault()
    const target = localPost?.username
    if (!target) return
    if (!currentUser?.username) { alert('Please log in to follow users'); router.push('/login'); return }
    if (target === currentUser.username) return
    if (localFollowLoading) return
    const wasFollowing = localIsFollowing
    setLocalIsFollowing(!wasFollowing); setLocalFollowLoading(true)
    try {
      const token = localStorage.getItem('token'); if (!token) { router.push('/login'); return }
      const action = wasFollowing ? 'unfollow' : 'follow'
      const res = await fetch(`${API_BASE_URL}/api/auth/users/${target}/${action}`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `Failed to ${action}`) }
      if (action === 'follow' && onFollow) await onFollow(target)
      else if (action === 'unfollow' && onUnfollow) await onUnfollow(target)
    } catch (error: any) { setLocalIsFollowing(wasFollowing); alert(error.message || 'Failed to follow/unfollow') }
    finally { setLocalFollowLoading(false) }
  }, [localPost?.username, currentUser, localIsFollowing, localFollowLoading, onFollow, onUnfollow, router])

  const toggleVideoPlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) { videoRef.current.pause(); setIsPlaying(false) }
      else { videoRef.current.muted = false; setIsMuted(false); videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {}) }
    }
  }, [isPlaying])

  const toggleMute = useCallback(() => {
    if (videoRef.current) { videoRef.current.muted = !isMuted; setIsMuted(!isMuted) }
  }, [isMuted])

  const handleLike = useCallback(async () => {
    if (!currentUser?.username) { alert('Please log in to like posts'); return }
    if (isProcessingLike) return
    const newLiked = !isLiked; const newCount = newLiked ? likes + 1 : likes - 1
    setIsLiked(newLiked); setLikes(newCount); setIsProcessingLike(true)
    try {
      const token = localStorage.getItem('token'); if (!token) throw new Error('Authentication required')
      const endpoint = localPost?.isPremium ? `/api/auth/premium-posts/${postId}/like` : `/api/auth/posts/${postId}/like`
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } })
      if (!res.ok) { setIsLiked(!newLiked); setLikes(newLiked ? likes : likes + 1); const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Failed to like') }
      const data = await res.json()
      if (data.likes !== undefined) {
        if (typeof data.likes === 'number') { setLikes(data.likes); setIsLiked(data.userLiked || false) }
        else if (Array.isArray(data.likes)) { setLikes(data.likes.length); setIsLiked(data.likes.includes(currentUser.username)) }
      }
    } catch (error: any) { alert(`Failed to like post: ${error.message}`) }
    finally { setIsProcessingLike(false) }
  }, [currentUser, postId, localPost?.isPremium, isLiked, likes, isProcessingLike])

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    const t = e.target as Element
    if (t.closest('button') || t.closest('a') || t.closest('textarea') || t.closest('input')) return
    const now = new Date().getTime()
    if (singleTapTimeoutRef.current) { clearTimeout(singleTapTimeoutRef.current); singleTapTimeoutRef.current = null }
    if (tapCountRef.current === 0) {
      tapCountRef.current = 1; lastTapTimeRef.current = now
      singleTapTimeoutRef.current = setTimeout(() => { tapCountRef.current = 0; lastTapTimeRef.current = 0 }, 300)
    } else if (tapCountRef.current === 1 && now - lastTapTimeRef.current < 300) {
      tapCountRef.current = 0; lastTapTimeRef.current = 0; handleLike()
      const rect = cardRef.current?.getBoundingClientRect()
      if (rect && currentUser?.username) {
        const heart = document.createElement('div'); heart.innerHTML = '❤️'
        Object.assign(heart.style, { position: 'absolute', left: `${e.clientX - rect.left}px`, top: `${e.clientY - rect.top}px`, fontSize: '50px', pointerEvents: 'none', zIndex: '100', transform: 'translate(-50%, -50%) scale(0)', transition: 'all 0.5s ease-out' })
        cardRef.current?.appendChild(heart)
        setTimeout(() => { heart.style.transform = 'translate(-50%, -50%) scale(1)' }, 10)
        setTimeout(() => { heart.style.transform = 'translate(-50%, -100px) scale(0.5)'; heart.style.opacity = '0' }, 300)
        setTimeout(() => { if (cardRef.current?.contains(heart)) cardRef.current.removeChild(heart) }, 800)
      }
    }
  }, [handleLike, currentUser?.username])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !localPost?.videos?.length) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && video.paused) { video.muted = true; setIsMuted(true); video.play().then(() => setIsPlaying(true)).catch(() => {}) }
      else if (!entry.isIntersecting && !video.paused) { video.pause(); setIsPlaying(false) }
    }, { threshold: 0.3 })
    if (cardRef.current) obs.observe(cardRef.current)
    return () => obs.disconnect()
  }, [localPost?.videos?.length])

  useEffect(() => {
    return () => {
      if (scrubTimeoutRef.current) clearTimeout(scrubTimeoutRef.current)
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current)
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current)
      if (downloadMenuTimeoutRef.current) clearTimeout(downloadMenuTimeoutRef.current)
      if (swipeTimeoutRef.current) clearTimeout(swipeTimeoutRef.current)
    }
  }, [])

  const handleDownload = useCallback(async (url: string) => {
    if (!isAdmin) return
    setIsDownloading(true)
    try { window.open(getMediaUrl(url), '_blank') } catch { alert('Failed to open media') }
    finally { setIsDownloading(false); setShowDownloadMenu(false) }
  }, [isAdmin])

  // Inner ProfilePicture component
  function ProfilePicture({ username, size = 'md', bgColor = 'bg-linear-to-r from-purple-500 to-pink-500' }: { username: string; size?: 'sm' | 'md' | 'lg'; bgColor?: string }) {
    const [imgError, setImgError] = useState(false)
    const [hovered, setHovered] = useState(false)
    const sizes = { sm: { container: 'w-8 h-8', text: 'text-sm' }, md: { container: 'w-12 h-12', text: 'text-base' }, lg: { container: 'w-16 h-16', text: 'text-lg' } }
    const { container: cs, text: ts } = sizes[size] || sizes.md
    const userProfilePic = localPost?.userProfilePicture || localPost?.user?.profilePicture || profilePicture
    const showFollowBtn = currentUser && username !== currentUser.username && !localIsFollowing
    return (
      <div className="relative flex-shrink-0">
        <Link href={`/profile/${username}`} onClick={e => e.stopPropagation()}
          className={`${cs} rounded-full overflow-hidden flex items-center justify-center shadow-md bg-gray-200 flex-shrink-0 block`}>
          {userProfilePic && !imgError ? (
            <img src={getMediaUrl(getProgressiveImageUrl(userProfilePic, 'medium', 45, 80))} alt={`${username}'s profile`}
              className="w-full h-full object-cover rounded-full" loading="eager" onError={() => setImgError(true)} />
          ) : (
            <div className={`w-full h-full rounded-full ${bgColor} flex items-center justify-center text-white font-bold ${ts}`}>
              {username?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
        </Link>
        {showFollowBtn && (
          <button onClick={handleFollowClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} disabled={localFollowLoading}
            className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 transform shadow-lg z-20 border-2 border-white ${localFollowLoading ? 'bg-gray-400 cursor-not-allowed' : hovered ? 'bg-orange-600 scale-110' : 'bg-orange-500'}`}
            aria-label={`Follow ${username}`}>
            {localFollowLoading ? <div className="animate-spin rounded-full h-2 w-2 border-2 border-white border-t-transparent" /> : <span className="text-white font-bold text-[8px] leading-none">+</span>}
          </button>
        )}
      </div>
    )
  }

  if (isDeleted) return null
  if (!localPost) return <div className="text-white">No post data</div>

  const isPostOwner = localPost.username === currentUser?.username
  const hasMedia = (localPost?.images?.length > 0) || (localPost?.videos?.length > 0)
  const canViewPremium = !localPost.isPremium || isSubscribed || isProfileOwner || isAdmin
  const formattedTimestamp = new Date(localPost.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })
  const hasMultipleMedia = (localPost?.images?.length || 0) + (localPost?.videos?.length || 0) > 1
  const getUsernameStyle = () => hasMultipleMedia ? 'text-sm font-light text-gray-300 hover:underline truncate' : 'font-bold text-lg hover:underline truncate text-white'

  return (
    <div ref={cardRef}
      className="relative w-full max-w-[350px] mx-auto bg-black text-white flex flex-col overflow-hidden rounded-lg shadow-lg cursor-pointer"
      data-post-id={postId} onClick={handleCardClick}
      style={{ touchAction: 'pan-y pinch-zoom', userSelect: 'none', WebkitUserSelect: 'none' }}>

      {giftAnimation && <GiftAnimation gift={giftAnimation} onComplete={() => setGiftAnimation(null)} />}

      {showGiftModal && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-[200] flex items-center justify-center p-4" onClick={() => setShowGiftModal(false)}>
          <div className="bg-gray-900 rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-gray-900 p-4 border-b border-gray-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Send a Gift</h3>
              <button onClick={() => setShowGiftModal(false)} className="text-gray-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4">
              <div className="mb-4 text-center">
                <p className="text-gray-300">Your Coin Balance: <span className="text-yellow-400 font-bold">{currentUser?.coinBalance || 0} coins</span></p>
                <p className="text-gray-400 text-sm mt-1">1 coin = ₦500</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {GIFT_OPTIONS.map(gift => (
                  <button key={gift.id} onClick={() => setSelectedGift(gift)}
                    className={`p-4 rounded-lg bg-linear-to-r ${gift.color} bg-opacity-20 hover:bg-opacity-30 transition-all duration-200 ${selectedGift?.id === gift.id ? 'ring-2 ring-white scale-105' : ''}`}>
                    <div className="text-4xl mb-2">{gift.icon}</div>
                    <div className="font-semibold text-white">{gift.name}</div>
                    <div className="text-yellow-400 text-sm">{gift.price} coins</div>
                  </button>
                ))}
              </div>
              {selectedGift && (
                <div className="mt-6 p-4 bg-gray-800 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{selectedGift.icon}</span>
                      <div><div className="font-bold text-white">{selectedGift.name}</div><div className="text-yellow-400 text-sm">{selectedGift.price} coins</div></div>
                    </div>
                    <div className="text-right"><div className="text-gray-400 text-xs">Your balance</div><div className="text-yellow-400 font-bold">{currentUser?.coinBalance || 0} coins</div></div>
                  </div>
                  <button onClick={() => handleSendGift(selectedGift)} disabled={isSendingGift || (currentUser?.coinBalance || 0) < selectedGift.price}
                    className={`w-full py-3 rounded-lg font-bold transition-all duration-200 ${isSendingGift || (currentUser?.coinBalance || 0) < selectedGift.price ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-linear-to-r from-yellow-500 to-orange-500 text-white hover:scale-105'}`}>
                    {isSendingGift ? <div className="flex items-center justify-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />Sending...</div> : `Send ${selectedGift.icon} ${selectedGift.name}`}
                  </button>
                  {(currentUser?.coinBalance || 0) < selectedGift.price && (
                    <p className="text-red-400 text-xs text-center mt-2">Insufficient coins. You need {selectedGift.price - (currentUser?.coinBalance || 0)} more coins.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isDeleting && (
        <div className="absolute inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mx-auto mb-4" />
            <p className="text-white font-medium">Deleting post...</p>
          </div>
        </div>
      )}

      {/* Media section */}
      <div className="relative flex-1 w-full min-h-[400px] overflow-hidden"
        onMouseMove={handleCombinedMouseMove}
        style={{ touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}>

        {!canViewPremium ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black min-h-[400px]">
            <div className="text-center p-6">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-linear-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 5.5V7H9V5.5L3 7V9L9 10.5V12.5L3 14V16L9 17.5V21H15V17.5L21 16V14L15 12.5V10.5L21 9Z" /></svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Premium Content</h3>
              <p className="text-gray-300 mb-6">Subscribe to view this post</p>
              <button onClick={handlePremiumClick} className="px-6 py-3 bg-linear-to-r from-purple-500 to-pink-500 text-white rounded-full hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg font-medium">Subscribe to View</button>
            </div>
          </div>
        ) : (
          <>
            {!localPost.videos?.length && !localPost.images?.length && (
              <div className="w-full h-full bg-black flex items-center justify-center min-h-[400px]">
                <div className="text-center text-gray-400"><p className="text-lg">Text post</p></div>
              </div>
            )}

            {allMedia.length > 0 && (
              <div
                className="relative w-full h-full min-h-[400px] overflow-hidden"
                ref={node => { if (node) sliderContainerW.current = node.offsetWidth }}
                onTouchStart={e => { if (allMedia.length > 1) sliderStart(e.touches[0].clientX, e.touches[0].clientY, (e.currentTarget as HTMLElement).offsetWidth) }}
                onTouchMove={e => { sliderMove(e.touches[0].clientX, e.touches[0].clientY) }}
                onTouchEnd={e => { sliderEnd(e.changedTouches[0].clientX) }}
                onMouseDown={e => { if (allMedia.length > 1 && e.button === 0) sliderStart(e.clientX, e.clientY, (e.currentTarget as HTMLElement).offsetWidth) }}
                onMouseMove={e => { if (e.buttons === 1) sliderMove(e.clientX, e.clientY) }}
                onMouseUp={e => { sliderEnd(e.clientX) }}
                onMouseLeave={e => { if (e.buttons === 1) sliderEnd(e.clientX) }}
                style={{ touchAction: 'pan-y', cursor: allMedia.length > 1 ? (isSliding ? 'grabbing' : 'grab') : 'default' }}
              >
                {/* Slider track */}
                <div style={{
                  display: 'flex',
                  width: `${allMedia.length * 100}%`,
                  minHeight: 400,
                  transform: allMedia.length > 1
                    ? `translateX(calc(${-mediaIndex * (100 / allMedia.length)}% + ${sliderOffset}px))`
                    : undefined,
                  transition: isSliding ? 'none' : 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
                  willChange: 'transform',
                }}>
                  {allMedia.map((item, i) => (
                    <div key={`${item.type}-${item.idx}-${i}`}
                      style={{ width: `${100 / allMedia.length}%`, flexShrink: 0, minHeight: 400, position: 'relative' }}>
                      {item.type === 'video' ? (
                        <div
                          ref={i === mediaIndex ? videoContainerRef : undefined}
                          className="absolute inset-0 w-full"
                          style={{ minHeight: 400 }}
                          onMouseDown={e => { e.stopPropagation(); handleMouseDown(e) }}
                          onMouseUp={e => { e.stopPropagation(); handleMouseUp(e) }}
                          onMouseLeave={e => { e.stopPropagation(); handleMouseLeave(e) }}
                          onTouchStart={e => { e.stopPropagation(); handleTouchStart(e) }}
                          onTouchMove={e => { e.stopPropagation(); handleTouchMove(e) }}
                          onTouchEnd={e => { e.stopPropagation(); handleTouchEnd(e) }}
                        >
                          <OptimizedVideo
                            key={`video-${item.idx}-${i}`}
                            ref={i === mediaIndex ? videoRef : undefined}
                            src={item.url} index={item.idx} currentIndex={i === mediaIndex ? mediaIndex : -1}
                            className="w-full h-full object-cover" loop muted={isMuted} playsInline autoPlay={false}
                            onLoadedData={handleLoadedMetadata} onTimeUpdate={handleTimeUpdate} onError={() => setVideoError(true)}
                            onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
                          />
                          {i === mediaIndex && (
                            <>
                              {(showScrubber || isScrubbing) && duration > 0 && (
                                <div className="absolute bottom-0 left-0 right-0 h-2 bg-gray-600 bg-opacity-50 z-30">
                                  <div className="h-full bg-linear-to-r from-purple-500 to-pink-500 relative"
                                    style={{ width: `${isScrubbing ? scrubPosition * 100 : (currentTime / duration) * 100}%` }}>
                                    <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg" style={{ right: '-6px' }} />
                                  </div>
                                  {isScrubbing && (
                                    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-80 text-white px-3 py-1 rounded-lg text-sm font-medium">
                                      {formatTime(scrubPreviewTime)} / {formatTime(duration)}
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                {!isPlaying && (
                                  <div className="w-10 h-10 rounded-full bg-black bg-opacity-50 flex items-center justify-center pointer-events-auto cursor-pointer"
                                    onClick={e => { e.stopPropagation(); toggleVideoPlay() }}>
                                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="absolute inset-0 w-full" style={{ minHeight: 400 }}>
                          <OptimizedImage
                            key={`img-${item.idx}-${i}`}
                            ref={i === mediaIndex ? imageRef : undefined}
                            src={item.url} index={item.idx} currentIndex={i}
                            priority={i === 0} alt={`Post image ${i + 1}`}
                            className="w-full h-full object-cover pointer-events-none"
                            onError={() => setImageError(true)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Prev arrow */}
                {allMedia.length > 1 && mediaIndex > 0 && (
                  <button onClick={e => { e.stopPropagation(); e.preventDefault(); sliderGoTo(mediaIndex - 1) }}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black/90 backdrop-blur-sm text-white rounded-full z-40 w-7 h-7 flex items-center justify-center shadow-lg"
                    aria-label="Previous">
                    <ChevronLeftIcon />
                  </button>
                )}

                {/* Next arrow */}
                {allMedia.length > 1 && mediaIndex < allMedia.length - 1 && (
                  <button onClick={e => { e.stopPropagation(); e.preventDefault(); sliderGoTo(mediaIndex + 1) }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black/90 backdrop-blur-sm text-white rounded-full z-40 w-7 h-7 flex items-center justify-center shadow-lg"
                    aria-label="Next">
                    <ChevronRightIcon />
                  </button>
                )}

                {/* Dot indicators */}
                {allMedia.length > 1 && (
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-20 pointer-events-none">
                    {allMedia.map((_, i) => (
                      <span key={`dot-${postId}-${i}`}
                        className="rounded-full transition-all duration-200 pointer-events-auto cursor-pointer"
                        style={{ width: i === mediaIndex ? 16 : 6, height: 6, backgroundColor: i === mediaIndex ? 'white' : 'rgba(255,255,255,0.45)' }}
                        onClick={e => { e.stopPropagation(); sliderGoTo(i) }}
                      />
                    ))}
                  </div>
                )}

                {/* Counter + type badge */}
                {allMedia.length > 1 && (
                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full z-20 font-medium">
                    {mediaIndex + 1} / {allMedia.length}
                  </div>
                )}
                {allMedia[mediaIndex]?.type === 'video' && allMedia.length > 1 && (
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full z-20 flex items-center gap-1">
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    VIDEO
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Overlay bar */}
      <div className="absolute bottom-0 left-0 right-0 px-2 pb-10 bg-linear-to-t from-black to-transparent z-10">
        <div className="mb-1 mt-20 flex items-start">
          <div className="flex flex-col items-center pr-1 relative">
            <div className="mb-1"><ProfilePicture username={localPost.username} size="md" /></div>
            <div className="flex flex-col items-center space-y-1">

              {/* Like */}
              <div className="flex flex-col items-center">
                <button onClick={e => { e.stopPropagation(); handleLike() }} disabled={isProcessingLike || isDeleting}
                  className={`w-7 h-7 rounded-full bg-black bg-opacity-30 flex items-center justify-center hover:bg-opacity-50 transition-all duration-200 cursor-pointer pointer-events-auto z-10 ${isProcessingLike || isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <svg className="w-3.5 h-3.5" fill={isLiked ? '#FF2D55' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>
                <span className="text-white text-[9px] mt-0.5 font-medium">{likes}</span>
              </div>

              {/* Comment */}
              <div className="flex flex-col items-center">
                <button onClick={e => { e.stopPropagation(); setShowComments(!showComments) }} disabled={isDeleting}
                  className="w-7 h-7 rounded-full bg-black bg-opacity-30 flex items-center justify-center hover:bg-opacity-50 transition-all cursor-pointer pointer-events-auto z-10 text-white">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </button>
                <span className="text-white text-[9px] mt-0.5 font-medium">{comments.length}</span>
              </div>

              {/* Gift */}
              <div className="flex flex-col items-center">
                <button onClick={e => {
                  e.stopPropagation()
                  if (!currentUser?.username) { alert('Please log in to send gifts'); router.push('/login'); return }
                  if (currentUser.username === localPost?.username) { alert('You cannot send gifts to yourself'); return }
                  setShowGiftModal(true)
                }} disabled={isDeleting}
                  className="w-7 h-7 rounded-full bg-linear-to-r from-pink-500 to-purple-600 flex items-center justify-center hover:shadow-lg transition-all cursor-pointer pointer-events-auto z-10 text-white"
                  title="Send a gift">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                </button>
                <span className="text-white text-[9px] mt-0.5 font-medium">Gift</span>
              </div>

              {/* Mute (video only) */}
              {localPost.videos?.length > 0 && (
                <div className="flex flex-col items-center">
                  <button onClick={e => { e.stopPropagation(); toggleMute() }}
                    className="w-7 h-7 rounded-full bg-black bg-opacity-30 flex items-center justify-center hover:bg-opacity-50 transition-all cursor-pointer pointer-events-auto z-10 text-white">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {isMuted
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" />
                      }
                    </svg>
                  </button>
                  <span className="text-white text-[9px] mt-0.5 font-medium">{isMuted ? 'Mute' : 'Sound'}</span>
                </div>
              )}

              {/* Share */}
              <div className="flex flex-col items-center">
                <button onClick={e => { e.stopPropagation(); handleCopyLink() }}
                  className="w-7 h-7 rounded-full bg-black bg-opacity-30 flex items-center justify-center hover:bg-opacity-50 transition-all cursor-pointer relative pointer-events-auto z-10 text-white">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {copySuccess && <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-1.5 py-0.5 rounded text-[9px] whitespace-nowrap">Copied!</span>}
                </button>
                <span className="text-white text-[9px] mt-0.5 font-medium">Share</span>
              </div>

              {/* Boost (own posts only) */}
              {showBoostButton && currentUser && localPost?.username === currentUser.username && (
                <div className="flex flex-col items-center">
                  <button onClick={handleBoostClick}
                    className="w-7 h-7 rounded-full bg-linear-to-r from-yellow-500 to-orange-500 flex items-center justify-center hover:shadow-lg transition-all cursor-pointer pointer-events-auto z-10 text-white hover:scale-110"
                    title="Boost this post">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.5 12L4.5 10L6.5 12L4.5 14L2.5 12Z M9.5 5L12.5 2L15.5 5L12.5 8L9.5 5Z M17.5 4L19.5 6L17.5 8L15.5 6L17.5 4Z M19.5 14L21.5 12L23.5 14L21.5 16L19.5 14Z M12.5 14L14.5 12L16.5 14L14.5 16L12.5 14Z" />
                    </svg>
                  </button>
                  <span className="text-white text-[9px] mt-0.5 font-medium">Boost</span>
                </div>
              )}

              {/* Download (admin only) */}
              {isAdmin && hasMedia && (
                <div className="flex flex-col items-center relative"
                  onMouseEnter={() => setShowDownloadMenu(true)}
                  onMouseLeave={() => { downloadMenuTimeoutRef.current = setTimeout(() => setShowDownloadMenu(false), 300) }}>
                  <button onClick={e => { e.stopPropagation(); setShowDownloadMenu(!showDownloadMenu) }} disabled={isDownloading}
                    className="w-7 h-7 rounded-full bg-purple-600 bg-opacity-80 flex items-center justify-center hover:bg-opacity-100 transition-all cursor-pointer pointer-events-auto z-10 text-white">
                    {isDownloading ? <div className="animate-spin rounded-full h-2.5 w-2.5 border-2 border-white border-t-transparent" /> : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    )}
                  </button>
                  <span className="text-white text-[9px] mt-0.5 font-medium">DL</span>
                  {showDownloadMenu && (
                    <div className="absolute bottom-full left-0 mb-1 bg-gray-800 rounded-lg shadow-xl z-50 min-w-[110px] border border-gray-700"
                      onMouseEnter={() => { if (downloadMenuTimeoutRef.current) clearTimeout(downloadMenuTimeoutRef.current) }}
                      onMouseLeave={() => { downloadMenuTimeoutRef.current = setTimeout(() => setShowDownloadMenu(false), 300) }}>
                      <div className="py-1">
                        {localPost?.images?.map((imgUrl: string, idx: number) => (
                          <button key={`dl-img-${idx}`} onClick={e => { e.stopPropagation(); handleDownload(imgUrl) }}
                            className="block w-full text-left text-white text-[10px] py-1 px-2 hover:bg-purple-600 transition">📸 Image {idx + 1}</button>
                        ))}
                        {localPost?.videos?.map((vidUrl: string, idx: number) => (
                          <button key={`dl-vid-${idx}`} onClick={e => { e.stopPropagation(); handleDownload(vidUrl) }}
                            className="block w-full text-left text-white text-[10px] py-1 px-2 hover:bg-purple-600 transition">🎬 Video {idx + 1}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Edit/Delete (own posts) */}
              {isPostOwner && (
                <>
                  {isEditing ? (
                    <>
                      <div className="flex flex-col items-center">
                        <button onClick={e => { e.stopPropagation(); handleSaveEdit() }} disabled={isSavingEdit || isDeleting}
                          className="w-7 h-7 rounded-full bg-green-500 bg-opacity-80 flex items-center justify-center hover:bg-opacity-100 transition-all cursor-pointer pointer-events-auto z-10 text-white">
                          {isSavingEdit ? <div className="animate-spin rounded-full h-2.5 w-2.5 border-2 border-white border-t-transparent" /> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>}
                        </button>
                        <span className="text-white text-[9px] mt-0.5 font-medium">Save</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <button onClick={e => { e.stopPropagation(); handleCancelEdit() }}
                          className="w-7 h-7 rounded-full bg-red-500 bg-opacity-80 flex items-center justify-center hover:bg-opacity-100 transition-all cursor-pointer pointer-events-auto z-10 text-white">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <span className="text-white text-[9px] mt-0.5 font-medium">Cancel</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col items-center">
                        <button onClick={e => { e.stopPropagation(); handleEditClick() }}
                          className="w-7 h-7 rounded-full bg-black bg-opacity-30 flex items-center justify-center hover:bg-opacity-50 transition-all cursor-pointer pointer-events-auto z-10 text-white">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <span className="text-white text-[9px] mt-0.5 font-medium">Edit</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <button onClick={e => { e.stopPropagation(); handleDeleteClick() }}
                          className="w-7 h-7 rounded-full bg-black bg-opacity-30 flex items-center justify-center hover:bg-opacity-50 transition-all cursor-pointer pointer-events-auto z-10 text-white">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                        <span className="text-white text-[9px] mt-0.5 font-medium">Delete</span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Post info */}
          <div className="flex-1 min-w-0 pt-1 ml-1">
            <div className="flex items-center gap-1 mb-1 flex-wrap">
              {isBoosted && (
                <span className="inline-flex items-center gap-0.5 bg-linear-to-r from-yellow-500 to-orange-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-full shadow-md animate-pulse">
                  <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24"><path d="M2.5 12L4.5 10L6.5 12L4.5 14L2.5 12Z M9.5 5L12.5 2L15.5 5L12.5 8L9.5 5Z" /></svg>
                  PROMOTED
                </span>
              )}
              {localPost.isPremium && !isBoosted && (
                <span className="inline-flex items-center gap-0.5 bg-linear-to-r from-purple-600 to-pink-600 text-white text-[8px] font-bold px-1 py-0.5 rounded-full shadow-md">
                  <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L15 9H22L16 14L19 21L12 16.5L5 21L8 14L2 9H9L12 2Z" /></svg>
                  PREMIUM
                </span>
              )}
              {!localPost.isPremium && !isBoosted && (
                <span className="inline-flex items-center gap-0.5 bg-green-600 text-white text-[8px] font-bold px-1 py-0.5 rounded-full shadow-md">FREE</span>
              )}
              {localPost.isAdminPost && (
                <span className="inline-flex items-center gap-0.5 bg-yellow-500 text-black text-[8px] font-bold px-1 py-0.5 rounded-full shadow-md">
                  <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V5L12 1Z" /></svg>
                  ADMIN
                </span>
              )}
            </div>

            <Link href={`/profile/${localPost.username}`} className={`${getUsernameStyle()} mb-1 text-xs`} onClick={e => e.stopPropagation()}>
              @{localPost.username || 'unknown'}
            </Link>

            {giftsReceived.length > 0 && totalGiftsValue > 0 && (
              <div className="flex items-center gap-1 mb-1 flex-wrap">
                <div className="flex items-center gap-0.5 bg-yellow-500 bg-opacity-20 rounded-full px-1 py-0.5">
                  <span className="text-yellow-400 text-[9px]">🎁</span>
                  <span className="text-yellow-400 text-[9px] font-medium">{totalGiftsValue} coins</span>
                </div>
                {giftsReceived.slice(0, 3).map((g: any, i: number) => (
                  <span key={i} className="text-[10px]" title={`${g.giftName} from @${g.senderUsername}`}>{g.giftIcon}</span>
                ))}
                {giftsReceived.length > 3 && <span className="text-gray-400 text-[9px]">+{giftsReceived.length - 3}</span>}
              </div>
            )}

            {locationDisplay && (
              <div className="flex items-center gap-0.5 mb-1">
                <svg className="w-2 h-2 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-gray-400 text-[9px] truncate">{locationDisplay}</span>
              </div>
            )}

            <div className="mb-1 text-[10px] max-w-full">
              {!canViewPremium ? (
                <p className="text-gray-400 italic text-[9px]">Premium content - Subscribe to view this post</p>
              ) : isEditing ? (
                <div className="mb-1">
                  <textarea ref={textareaRef} value={editedText} onChange={e => setEditedText(e.target.value)}
                    className="w-full p-1 bg-gray-800 text-white rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-[10px]"
                    rows={2} placeholder="Edit your post..." onClick={e => e.stopPropagation()} disabled={isSavingEdit || isDeleting} />
                  <div className="flex space-x-1 mt-1">
                    <button onClick={handleSaveEdit} disabled={isSavingEdit || !editedText.trim() || isDeleting}
                      className="px-1.5 py-0.5 bg-green-600 text-white rounded text-[9px] hover:bg-green-700 disabled:opacity-50">
                      {isSavingEdit ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={handleCancelEdit} disabled={isSavingEdit || isDeleting}
                      className="px-1.5 py-0.5 bg-gray-600 text-white rounded text-[9px] hover:bg-gray-700">Cancel</button>
                  </div>
                </div>
              ) : localPost.text ? (
                <div className="text-white text-[10px]">
                  <div className={!isWriteUpExpanded ? 'line-clamp-2' : ''}>
                    {renderTextWithHashtags
                      ? renderTextWithHashtags(localPost.text)
                      : renderTextWithHashtagsAndMentions(localPost.text, router)}
                    {localPost.text.length > 60 && !isWriteUpExpanded && (
                      <button onClick={e => { e.stopPropagation(); e.preventDefault(); setIsWriteUpExpanded(true) }}
                        className="text-blue-400 hover:text-blue-300 hover:underline ml-1 text-[9px] font-medium">see more</button>
                    )}
                    {isWriteUpExpanded && (
                      <button onClick={e => { e.stopPropagation(); e.preventDefault(); setIsWriteUpExpanded(false) }}
                        className="text-blue-400 hover:text-blue-300 hover:underline ml-1 text-[9px] font-medium">Show less</button>
                    )}
                  </div>
                </div>
              ) : (
                <span className="text-gray-400 italic text-[9px]">No content</span>
              )}
            </div>

            <div className="flex items-center space-x-1.5 text-[9px] text-gray-300">
              <span>{formattedTimestamp}</span>
              <span>•</span>
              <span>{views} Views</span>
              {localPost.videos?.length > 0 && duration > 0 && (
                <><span>•</span><span>{formatTime(currentTime)} / {formatTime(duration)}</span></>
              )}
              {isBoosted && <><span>•</span><span className="text-yellow-500 text-[8px] font-medium">⭐ Boosted</span></>}
            </div>
          </div>
        </div>
      </div>

      {/* Comments overlay */}
      {showComments && (
        <div className="absolute inset-0 bg-black bg-opacity-90 z-20 flex flex-col">
          <div className="p-2 border-b border-gray-800 flex justify-between items-center">
            <h3 className="text-sm font-bold text-white">{comments.length} Comments</h3>
            <button onClick={() => setShowComments(false)} className="text-gray-400 hover:text-white">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {comments.length > 0 ? (
              [...comments].reverse().map((comment: any, i: number) => (
                <div key={`${postId}-c-${comment.id || comment.timestamp || i}`} className="mb-2 p-1.5 bg-gray-900 rounded-lg">
                  <div className="flex items-start space-x-1.5">
                    <ProfilePicture username={comment.username} size="sm" bgColor="bg-blue-500" />
                    <div className="flex-1">
                      <div className="flex items-center space-x-1">
                        <Link href={`/profile/${comment.username}`} className="font-bold text-[10px] hover:underline text-white" onClick={e => e.stopPropagation()}>@{comment.username}</Link>
                        <span className="text-gray-400 text-[9px]">{new Date(comment.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-[10px] mt-0.5 text-white">{comment.text}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-gray-400">
                <p className="text-xs">No comments yet.</p>
                <p className="text-[9px] mt-0.5">Be the first to comment!</p>
              </div>
            )}
          </div>
          <div className="p-2 border-t border-gray-800">
            <form onSubmit={handleCommentSubmit} className="flex space-x-1">
              <div className="flex-1 relative">
                <textarea ref={textareaRef} value={newComment} onChange={handleCommentChange}
                  placeholder={currentUser?.username ? 'Add a comment...' : 'Please log in to comment'}
                  disabled={isProcessingComment || !currentUser?.username || isDeleting}
                  className="w-full p-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none text-[10px]"
                  rows={1} onClick={e => e.stopPropagation()} />
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="absolute z-10 bottom-full mb-1 bg-gray-800 border border-gray-700 rounded-md max-h-28 overflow-y-auto w-full">
                    {suggestions.map((s: any, i: number) => (
                      <li key={i} className="px-1.5 py-1 hover:bg-gray-700 cursor-pointer text-white text-[10px]" onClick={() => handleSuggestionClick(s)}>
                        <span className="text-blue-500">#{s.hashtag}</span>
                        <span className="text-gray-400 ml-0.5 text-[9px]">({s.count} users)</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button type="submit" disabled={!newComment.trim() || isProcessingComment || !currentUser?.username || isDeleting}
                className={`px-2 py-1 rounded-lg transition-all cursor-pointer font-medium text-[10px] ${newComment.trim() && !isProcessingComment && currentUser?.username ? 'bg-purple-500 text-white hover:bg-purple-600' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
                {isProcessingComment ? '...' : 'Post'}
              </button>
            </form>
            {!currentUser?.username && <p className="text-center mt-1 text-gray-400 text-[9px]">Log in to comment on posts</p>}
          </div>
        </div>
      )}
    </div>
  )
}

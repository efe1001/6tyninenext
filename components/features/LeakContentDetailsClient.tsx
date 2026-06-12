'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getMediaUrl } from '@/lib/firebase'

const API_BASE_URL = ''
const CACHE_DURATION = 10 * 60 * 1000

// ==================== VIDEO PLAYER ====================
const VideoPlayer = React.memo(({ video, onNext, onPrev, hasNext, hasPrev, isPlaying: externalPlaying, onPlayStateChange }: {
  video: any
  onNext: () => void
  onPrev: () => void
  hasNext: boolean
  hasPrev: boolean
  isPlaying: boolean
  onPlayStateChange: (playing: boolean) => void
}) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const isMounted = useRef(true)
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2]

  const formatTime = useCallback((time: number) => {
    if (!time || isNaN(time)) return '0:00'
    const hours = Math.floor(time / 3600)
    const minutes = Math.floor((time % 3600) / 60)
    const seconds = Math.floor(time % 60)
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [])

  const togglePlay = useCallback(() => {
    if (videoRef.current && isMounted.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play().catch(() => {})
      }
      setIsPlaying(!isPlaying)
      onPlayStateChange(!isPlaying)
    }
  }, [isPlaying, onPlayStateChange])

  const toggleMute = useCallback(() => {
    if (videoRef.current && isMounted.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }, [isMuted])

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (videoRef.current && isMounted.current) {
      videoRef.current.volume = newVolume
      videoRef.current.muted = false
      setIsMuted(false)
    }
  }, [])

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    if (videoRef.current && duration && isMounted.current) {
      videoRef.current.currentTime = percentage * duration
    }
  }, [duration])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && isMounted.current) {
      setCurrentTime(videoRef.current.currentTime)
      setDuration(videoRef.current.duration)
    }
  }, [])

  const handleFullscreen = useCallback(() => {
    if (videoRef.current && isMounted.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        videoRef.current.requestFullscreen()
      }
    }
  }, [])

  const changeSpeed = useCallback((speed: number) => {
    if (videoRef.current && isMounted.current) {
      videoRef.current.playbackRate = speed
      setPlaybackSpeed(speed)
      setShowSpeedMenu(false)
    }
  }, [])

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && isMounted.current) setShowControls(false)
    }, 2000)
  }, [isPlaying])

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Space') { e.preventDefault(); togglePlay() }
      if (e.key === 'ArrowLeft' && hasPrev && onPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext && onNext) onNext()
      if (e.key === 'f') handleFullscreen()
      if (e.key === 'm') toggleMute()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, hasPrev, hasNext, onPrev, onNext, handleFullscreen, toggleMute])

  useEffect(() => {
    if (videoRef.current && isMounted.current && externalPlaying) {
      videoRef.current.play().catch(() => {})
      setIsPlaying(true)
    }
  }, [video?.url, externalPlaying])

  const videoUrl = useMemo(() => getMediaUrl(video?.url), [video?.url])
  const progressStyle = useMemo(() => ({ width: `${(currentTime / duration) * 100}%` }), [currentTime, duration])

  return (
    <div
      className="relative bg-black rounded-2xl overflow-hidden group shadow-2xl"
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full max-h-[70vh] object-contain"
        controlsList="nodownload"
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={togglePlay}
        playsInline
        preload="auto"
        autoPlay
      />
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/90 via-black/50 to-transparent backdrop-blur-sm p-4 transition-all duration-300">
          <div className="w-full h-1.5 bg-white/20 rounded-full mb-4 cursor-pointer group/progress relative" onClick={handleSeek}>
            <div className="h-full bg-linear-to-r from-orange-400 to-rose-500 rounded-full relative" style={progressStyle}>
              <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-orange-400 rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={togglePlay} className="text-white hover:text-orange-400 transition transform hover:scale-110">
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
                ) : (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              <span className="text-white text-sm font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
              <div className="flex items-center gap-2 group/volume">
                <button onClick={toggleMute} className="text-white hover:text-orange-400 transition">
                  {isMuted || volume === 0 ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                    </svg>
                  )}
                </button>
                <div className="w-0 overflow-hidden group-hover/volume:w-24 transition-all duration-300">
                  <input type="range" min="0" max="1" step="0.01" value={volume} onChange={handleVolumeChange} className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer" />
                </div>
              </div>
              <div className="relative">
                <button onClick={() => setShowSpeedMenu(!showSpeedMenu)} className="text-white hover:text-orange-400 transition text-sm font-medium px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20">
                  {playbackSpeed}x
                </button>
                {showSpeedMenu && (
                  <div className="absolute bottom-full left-0 mb-2 bg-gray-800/95 backdrop-blur-sm rounded-xl overflow-hidden shadow-xl border border-gray-700 z-20">
                    {speeds.map(speed => (
                      <button key={speed} onClick={() => changeSpeed(speed)} className={`block w-full px-4 py-2 text-sm transition-colors ${playbackSpeed === speed ? 'text-orange-400 bg-white/10' : 'text-white hover:bg-white/10'}`}>
                        {speed}x
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {hasPrev && (
                <button onClick={onPrev} className="text-white hover:text-orange-400 transition transform hover:scale-110" title="Previous Video">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M11 18V6l-7 6 7 6zm8 0V6l-7 6 7 6z" /></svg>
                </button>
              )}
              {hasNext && (
                <button onClick={onNext} className="text-white hover:text-orange-400 transition transform hover:scale-110" title="Next Video">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M5 18l7-6-7-6v12zm8-12v12l7-6-7-6z" /></svg>
                </button>
              )}
              <button onClick={handleFullscreen} className="text-white hover:text-orange-400 transition transform hover:scale-110">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
VideoPlayer.displayName = 'VideoPlayer'

// ==================== VIDEO LIST SIDEBAR ====================
const VideoListSidebar = React.memo(({ videos, currentIndex, onSelectVideo, leakTitle }: {
  videos: any[]
  currentIndex: number
  onSelectVideo: (i: number) => void
  leakTitle: string
}) => {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredVideos = useMemo(() => {
    if (!searchTerm) return videos
    return videos.filter(v => v.title?.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [videos, searchTerm])

  const getThumbnailUrl = useCallback((thumbnail: string) => {
    if (!thumbnail) return null
    return getMediaUrl(thumbnail)
  }, [])

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl overflow-hidden border border-gray-700/50 shadow-xl">
      <div className="p-4 border-b border-gray-700/50 bg-linear-to-r from-gray-800/80 to-gray-800/40">
        <h3 className="text-white font-bold text-lg">Video Playlist</h3>
        <p className="text-gray-400 text-xs mt-1">{leakTitle}</p>
        <div className="relative mt-3">
          <input
            type="text"
            placeholder="Search videos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition"
          />
          <svg className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
      <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
        {filteredVideos?.map((video, index) => (
          <button
            key={video.id || index}
            onClick={() => onSelectVideo(index)}
            className={`w-full p-3 text-left transition-all duration-200 flex items-center gap-3 ${index === currentIndex ? 'bg-linear-to-r from-orange-500/20 to-transparent border-l-4 border-orange-500' : 'hover:bg-gray-700/50'}`}
          >
            <div className="w-16 h-12 bg-gray-900 rounded-lg overflow-hidden flex-shrink-0 relative">
              {video.thumbnail ? (
                <img src={getThumbnailUrl(video.thumbnail) || ''} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </div>
              )}
              {index === currentIndex && (
                <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${index === currentIndex ? 'text-orange-400' : 'text-white'}`}>
                {video.title || `Video ${index + 1}`}
              </p>
              <p className="text-gray-500 text-xs">Chapter {index + 1}</p>
            </div>
            {index === currentIndex && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />}
          </button>
        ))}
        {filteredVideos?.length === 0 && <div className="text-center py-8 text-gray-500">No videos found</div>}
      </div>
      <div className="p-3 border-t border-gray-700/50 bg-gray-800/30">
        <div className="flex justify-between text-xs text-gray-500">
          <span>{videos?.length || 0} videos total</span>
          <span>{currentIndex + 1} of {videos?.length || 0} playing</span>
        </div>
      </div>
    </div>
  )
})
VideoListSidebar.displayName = 'VideoListSidebar'

// ==================== PURCHASE MODAL ====================
const PurchaseModal = ({ leak, onClose, onConfirm, isProcessing }: {
  leak: any
  onClose: () => void
  onConfirm: () => void
  isProcessing: boolean
}) => {
  const formatPrice = (price: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(price)

  return (
    <div className="fixed inset-0 z-[200] bg-black bg-opacity-80 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl max-w-md w-full p-4 sm:p-6 mx-3 sm:mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-4 sm:mb-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-linear-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-white text-lg sm:text-xl font-bold mb-2">Purchase Content</h3>
          <p className="text-gray-300 text-sm sm:text-base mb-3 sm:mb-4">
            Unlock "{leak.title?.length > 30 ? leak.title.slice(0, 30) + '...' : leak.title}" for {formatPrice(leak.price)}
          </p>
          <div className="bg-gray-700 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex justify-between mb-2 text-sm sm:text-base">
              <span className="text-gray-400">Price:</span>
              <span className="text-white font-bold">{formatPrice(leak.price)}</span>
            </div>
            <div className="flex justify-between text-sm sm:text-base">
              <span className="text-gray-400">Your Balance:</span>
              <span className="text-green-400 font-bold">{formatPrice(leak.userBalance || 0)}</span>
            </div>
          </div>
          {(leak.userBalance || 0) < leak.price && (
            <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-2 sm:p-3 mb-3 sm:mb-4">
              <p className="text-yellow-400 text-xs sm:text-sm">Insufficient balance. Please add funds to your wallet.</p>
              <Link href="/payment" className="text-orange-400 text-xs sm:text-sm hover:underline mt-1 inline-block">Go to Wallet →</Link>
            </div>
          )}
        </div>
        <div className="flex gap-2 sm:gap-3">
          <button onClick={onClose} className="flex-1 px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition active:scale-95 text-sm sm:text-base">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={isProcessing || (leak.userBalance || 0) < leak.price}
            className="flex-1 px-3 py-1.5 sm:px-4 sm:py-2 bg-linear-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-sm sm:text-base"
          >
            {isProcessing ? (
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-2 border-white border-t-transparent"></div>
                Processing...
              </div>
            ) : 'Confirm Purchase'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== SIMILAR LEAKS SECTION ====================
const SimilarLeaksSection = React.memo(({ leaks, onSelectLeak, currentLeakId, onPurchase, userBalance }: {
  leaks: any[]
  onSelectLeak: (leak: any) => void
  currentLeakId: string
  onPurchase: (leak: any) => void
  userBalance: number
}) => {
  const similarLeaks = useMemo(() => {
    if (!leaks || leaks.length === 0) return []
    return leaks.filter(leak => leak.id !== currentLeakId).slice(0, 4)
  }, [leaks, currentLeakId])

  const formatPrice = (price: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(price)
  const getThumbnailUrl = useCallback((thumbnail: string) => thumbnail ? getMediaUrl(thumbnail) : null, [])

  if (similarLeaks.length === 0) return null

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-white text-xl font-bold bg-linear-to-r from-white to-gray-400 bg-clip-text text-transparent">You Might Also Like</h3>
        <div className="w-20 h-0.5 bg-linear-to-r from-orange-500 to-transparent rounded-full" />
      </div>
      <div className="flex flex-col items-center space-y-4">
        {similarLeaks.map(leak => (
          <div key={leak.id} className="relative w-full max-w-[350px] mx-auto bg-gray-800/50 backdrop-blur-sm rounded-xl overflow-hidden border border-gray-700/50 shadow-lg transition-all duration-300 hover:scale-105">
            <div
              className="aspect-video bg-linear-to-br from-purple-900/80 to-pink-900/80 relative overflow-hidden cursor-pointer"
              onClick={() => leak.isFree ? onSelectLeak(leak) : onPurchase(leak)}
            >
              {leak.thumbnail ? (
                <img src={getThumbnailUrl(leak.thumbnail) || ''} alt={leak.title} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-4xl">🔞</span>
                </div>
              )}
              <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
              {!leak.isFree && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300">
                  <div className="text-center">
                    <svg className="w-8 h-8 text-orange-400 mx-auto mb-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-white text-xs font-bold">Tap to Purchase</span>
                  </div>
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="text-white text-sm font-medium truncate">{leak.title}</p>
              <div className="flex items-center justify-between mt-1">
                {leak.isFree ? (
                  <span className="text-green-400 text-xs font-bold px-2 py-0.5 bg-green-500/20 rounded-full">FREE</span>
                ) : (
                  <div className="flex flex-col items-start">
                    <span className="text-orange-400 text-sm font-bold">{formatPrice(leak.price)}</span>
                    <button onClick={(e) => { e.stopPropagation(); onPurchase(leak) }} className="mt-1 px-2 py-0.5 bg-linear-to-r from-orange-500 to-red-500 text-white text-xs rounded-lg hover:shadow-lg transition">Buy Now</button>
                  </div>
                )}
                <span className="text-gray-500 text-xs">{leak.views?.toLocaleString()} views</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})
SimilarLeaksSection.displayName = 'SimilarLeaksSection'

// ==================== MAIN COMPONENT ====================
interface Props {
  leakId: string
}

export default function LeakContentDetailsClient({ leakId }: Props) {
  const router = useRouter()
  const { user: currentUser } = useAuth()

  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(true)
  const [purchased, setPurchased] = useState(false)
  const [isFree, setIsFree] = useState(false)
  const [leak, setLeak] = useState<any>(null)
  const [videos, setVideos] = useState<any[]>([])
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [userBalance, setUserBalance] = useState(0)
  const [similarLeaks, setSimilarLeaks] = useState<any[]>([])
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [isPlaying, setIsPlaying] = useState(true)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [selectedLeakForPurchase, setSelectedLeakForPurchase] = useState<any>(null)
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false)

  const hasFetched = useRef(false)
  const abortController = useRef<AbortController | null>(null)

  const getCachedPurchased = useCallback((): string[] => {
    if (!currentUser?.username) return []
    try {
      const key = `purchased_leaks_${currentUser.username}`
      const cached = localStorage.getItem(key)
      const timestamp = localStorage.getItem(`${key}_timestamp`)
      if (cached && timestamp && (Date.now() - parseInt(timestamp)) < CACHE_DURATION) {
        return JSON.parse(cached)
      }
    } catch {}
    return []
  }, [currentUser])

  const addToPurchasedCache = useCallback((id: string) => {
    if (!currentUser?.username) return
    const key = `purchased_leaks_${currentUser.username}`
    const existing = getCachedPurchased()
    if (!existing.includes(id)) {
      existing.push(id)
      localStorage.setItem(key, JSON.stringify(existing))
      localStorage.setItem(`${key}_timestamp`, Date.now().toString())
    }
  }, [currentUser, getCachedPurchased])

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true
    if (abortController.current) abortController.current.abort()
    abortController.current = new AbortController()

    const fetchData = async () => {
      setLoading(true)
      setChecking(true)
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const authHdr = token ? { 'Authorization': `Bearer ${token}` } : {}
        const signal = abortController.current!.signal

        const purchasedIds = getCachedPurchased()
        const isCachedPurchased = purchasedIds.includes(leakId)
        if (isCachedPurchased) { setPurchased(true); setChecking(false) }

        // Fetch leak + balance + purchase check all in parallel
        const [leakRes, balanceRes, purchaseRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/auth/leaks/${leakId}`, { headers: authHdr, signal }),
          token ? fetch(`${API_BASE_URL}/api/auth/me`, { headers: authHdr, signal }).catch(() => null) : Promise.resolve(null),
          (token && !isCachedPurchased)
            ? fetch(`${API_BASE_URL}/api/auth/leaks/${leakId}/purchased`, { headers: authHdr, signal }).catch(() => null)
            : Promise.resolve(null),
        ])

        if (!leakRes.ok) {
          if (leakRes.status === 404) throw new Error('Leak not found')
          if (leakRes.status === 403) throw new Error('Purchase required')
          throw new Error('Failed to load')
        }
        const leakData = await leakRes.json()
        const currentLeak = leakData.leak
        const isFreeContent = currentLeak?.isFree === true
        setIsFree(isFreeContent)
        setLeak(currentLeak)
        setVideos(currentLeak?.videos || [])

        if (balanceRes?.ok) { const d = await balanceRes.json(); setUserBalance(d.balance || 0) }

        let isPurchasedFlag = isFreeContent || isCachedPurchased
        if (!isFreeContent && !isCachedPurchased && purchaseRes?.ok) {
          const checkData = await purchaseRes.json()
          isPurchasedFlag = checkData.purchased === true
          if (isPurchasedFlag) addToPurchasedCache(leakId)
        }
        setPurchased(isPurchasedFlag)
        setChecking(false)
        setLoading(false)

        if (currentLeak?.category) {
          fetch(`${API_BASE_URL}/api/auth/leaks?category=${encodeURIComponent(currentLeak.category)}&limit=6`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
          }).then(res => res.ok ? res.json() : null).then(data => {
            if (data?.leaks) setSimilarLeaks(data.leaks)
          }).catch(() => {})
        }

        if (isPurchasedFlag && !isFreeContent && token) {
          fetch(`${API_BASE_URL}/api/auth/leaks/${leakId}/view`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => {})
        }

      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setLoading(false)
          setChecking(false)
        }
      }
    }
    fetchData()
    return () => { if (abortController.current) abortController.current.abort() }
  }, [leakId, currentUser, getCachedPurchased, addToPurchasedCache])

  const handleNextVideo = useCallback(() => {
    setCurrentVideoIndex(prev => prev < videos.length - 1 ? prev + 1 : prev)
    setIsPlaying(true)
  }, [videos.length])

  const handlePrevVideo = useCallback(() => {
    setCurrentVideoIndex(prev => prev > 0 ? prev - 1 : prev)
    setIsPlaying(true)
  }, [])

  const handleSelectVideo = useCallback((index: number) => {
    setCurrentVideoIndex(index)
    setIsPlaying(true)
  }, [])

  const handleBack = useCallback(() => { router.push('/leaks') }, [router])

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({ title: leak?.title, url: window.location.href }).catch(() => {})
    } else {
      navigator.clipboard.writeText(window.location.href)
      alert('Link copied!')
    }
    setShowShareMenu(false)
  }, [leak])

  const handlePurchaseClick = useCallback((leakToPurchase: any) => {
    if (!currentUser?.username) {
      alert('Please login first')
      router.push('/login')
      return
    }
    setSelectedLeakForPurchase({ ...leakToPurchase, userBalance })
    setShowPurchaseModal(true)
  }, [currentUser, router, userBalance])

  const confirmPurchase = useCallback(async () => {
    if (!selectedLeakForPurchase) return
    setIsProcessingPurchase(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) throw new Error('Auth required')
      const res = await fetch(`${API_BASE_URL}/api/auth/leaks/${selectedLeakForPurchase.id}/purchase`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      })
      const data = await res.json()
      if (!res.ok && !data.alreadyPurchased) throw new Error(data.message || 'Purchase failed')
      addToPurchasedCache(selectedLeakForPurchase.id)
      try {
        const balanceRes = await fetch(`${API_BASE_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } })
        if (balanceRes.ok) { const d = await balanceRes.json(); setUserBalance(d.balance || 0) }
      } catch {}
      setShowPurchaseModal(false)
      alert('Purchase successful!')
      if (selectedLeakForPurchase.id === leakId) {
        setPurchased(true)
      } else {
        router.push(`/leak/${selectedLeakForPurchase.id}`)
      }
      setSelectedLeakForPurchase(null)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsProcessingPurchase(false)
    }
  }, [selectedLeakForPurchase, addToPurchasedCache, leakId, router])

  const currentVideo = useMemo(() => videos[currentVideoIndex] || { url: '', title: '' }, [videos, currentVideoIndex])
  const hasNext = currentVideoIndex < videos.length - 1
  const hasPrev = currentVideoIndex > 0

  const formatPrice = (price: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(price)

  if (checking || (loading && !leak)) {
    return (
      <div className="w-full max-w-3xl mx-auto min-h-screen flex items-center justify-center pt-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!purchased && !isFree && !checking && !loading) {
    return (
      <div className="w-full max-w-3xl mx-auto min-h-screen flex items-center justify-center pt-20 p-4">
        <div className="text-center max-w-md backdrop-blur-sm bg-gray-800/30 p-8 rounded-2xl border border-gray-700">
          <div className="text-orange-500 text-6xl mb-4">🔒</div>
          <h2 className="text-white text-2xl font-bold mb-2">Purchase Required</h2>
          <p className="text-gray-400 mb-4">Purchase this content to view it.</p>
          <p className="text-orange-400 text-2xl font-bold mb-6">{formatPrice(leak?.price)}</p>
          <div className="bg-gray-700 rounded-lg p-4 mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-gray-400">Price:</span>
              <span className="text-white font-bold">{formatPrice(leak?.price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Your Balance:</span>
              <span className="text-green-400 font-bold">{formatPrice(userBalance)}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleBack} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg">Browse Leaks</button>
            <button
              onClick={() => handlePurchaseClick(leak)}
              disabled={userBalance < (leak?.price || 0)}
              className="flex-1 px-4 py-2 bg-linear-to-r from-orange-500 to-red-500 text-white rounded-lg disabled:opacity-50"
            >
              Purchase Now
            </button>
          </div>
          <button
            onClick={() => {
              const key = `purchased_leaks_${currentUser?.username}`
              localStorage.removeItem(key)
              localStorage.removeItem(`${key}_timestamp`)
              window.location.reload()
            }}
            className="mt-4 text-xs text-gray-500 hover:text-gray-400"
          >
            Reset Purchase Cache
          </button>
        </div>
      </div>
    )
  }

  if (error && !leak) {
    return (
      <div className="w-full max-w-3xl mx-auto min-h-screen flex items-center justify-center pt-20 p-4">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-white text-2xl font-bold mb-2">Error</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button onClick={handleBack} className="px-6 py-2 bg-orange-500 text-white rounded-lg">Go Back</button>
        </div>
      </div>
    )
  }

  if (!leak) {
    return (
      <div className="w-full max-w-3xl mx-auto min-h-screen flex items-center justify-center pt-20">
        <p className="text-gray-400">Content not found</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 relative pt-20 pb-12">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(31, 41, 55, 0.5); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: linear-gradient(to bottom, #f97316, #ef4444); border-radius: 10px; }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <button onClick={handleBack} className="flex items-center gap-2 text-gray-400 hover:text-white transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Leaks
        </button>
        <div className="flex items-center gap-3">
          <div className="bg-gray-800/50 rounded-xl px-3 py-1.5">
            <span className="text-green-400 font-bold">₦{userBalance.toLocaleString()}</span>
          </div>
          <div className="relative">
            <button onClick={() => setShowShareMenu(!showShareMenu)} className="px-4 py-2 rounded-xl bg-gray-800/50 text-gray-300 hover:text-white">
              Share
            </button>
            {showShareMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-xl shadow-xl border border-gray-700 z-20">
                <button onClick={handleShare} className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700">Copy Link</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isFree && (
        <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-4 text-center">
          <p className="text-green-400">🎁 FREE content - no purchase required!</p>
        </div>
      )}

      <VideoPlayer
        video={currentVideo}
        onNext={handleNextVideo}
        onPrev={handlePrevVideo}
        hasNext={hasNext}
        hasPrev={hasPrev}
        isPlaying={isPlaying}
        onPlayStateChange={setIsPlaying}
      />

      <div className="bg-gray-800/30 rounded-2xl p-6 border border-gray-700/50">
        <h1 className="text-white text-2xl md:text-3xl font-bold mb-3">{leak.title}</h1>
        <p className="text-gray-400 leading-relaxed mb-4">{leak.description}</p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-gray-500">{leak.views?.toLocaleString() || 0} views</span>
          <span className="text-gray-600">•</span>
          <span className="text-gray-500">Added {new Date(leak.createdAt).toLocaleDateString()}</span>
          {leak.tags?.length > 0 && (
            <>
              <span className="text-gray-600">•</span>
              <div className="flex gap-2">
                {leak.tags.slice(0, 4).map((tag: string) => (
                  <span key={tag} className="text-orange-400 text-xs bg-orange-500/10 px-2 py-1 rounded-full">#{tag}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <VideoListSidebar
        videos={videos}
        currentIndex={currentVideoIndex}
        onSelectVideo={handleSelectVideo}
        leakTitle={leak.title}
      />

      <SimilarLeaksSection
        leaks={similarLeaks}
        onSelectLeak={(l) => router.push(`/leak/${l.id}`)}
        currentLeakId={leak.id}
        onPurchase={handlePurchaseClick}
        userBalance={userBalance}
      />

      {showPurchaseModal && selectedLeakForPurchase && (
        <PurchaseModal
          leak={selectedLeakForPurchase}
          onClose={() => setShowPurchaseModal(false)}
          onConfirm={confirmPurchase}
          isProcessing={isProcessingPurchase}
        />
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import Card from '@/components/features/Card'

const API_BASE_URL = ''
const HARDCODED_ADMIN_USERNAMES = ['6tynine', 'ppp']
const POSTS_PER_PAGE = 20
const LOAD_MORE_INCREMENT = 10
const LS_POSTS = 'homepage_posts'
const LS_ADMIN_POSTS = 'homepage_admin_posts'

function isPostBoosted(post: any) {
  if (!post || post.isBoosted !== true) return false
  if (post.boostExpiresAt && new Date(post.boostExpiresAt) < new Date()) return false
  return true
}

function extractHashtags(text: string) {
  if (!text) return []
  return [...new Set((text.match(/#[\w]+/gi) || []).map(t => t.toLowerCase()))]
}

export default function HomepageClient() {
  const router = useRouter()
  const { currentUser, isLoggedIn } = useAuth()

  const [allPosts, setAllPosts] = useState<any[]>([])
  const [adminPosts, setAdminPosts] = useState<any[]>([])
  const [visiblePosts, setVisiblePosts] = useState<any[]>([])
  const [filteredPosts, setFilteredPosts] = useState<any[]>([])
  const [visibleCount, setVisibleCount] = useState(POSTS_PER_PAGE)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)

  const [typeFilter, setTypeFilter] = useState<'all' | 'users'>('all')
  const [sortFilter, setSortFilter] = useState<'all' | 'following'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const isMounted = useRef(true)
  const filterTimeoutRef = useRef<any>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const fetchAllPosts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const headers: any = { 'Content-Type': 'application/json' }
      if (token && isLoggedIn) headers['Authorization'] = `Bearer ${token}`
      const endpoint = isLoggedIn && token
        ? `${API_BASE_URL}/api/auth/posts?limit=200`
        : `${API_BASE_URL}/api/auth/public/posts?limit=200`
      const res = await fetch(endpoint, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const posts: any[] = Array.isArray(data) ? data : (data.posts || data.data || [])
      return posts.map(p => ({
        ...p,
        id: p.id || p._id,
        hashtags: p.hashtags || extractHashtags(p.text || ''),
        likes: p.likes || [],
        comments: p.comments || [],
        views: p.views || 0,
        images: p.images || [],
        videos: p.videos || [],
        timestamp: p.timestamp || p.createdAt || new Date().toISOString(),
      }))
    } catch { return [] }
  }, [isLoggedIn])

  const fetchAdminPosts = useCallback(async () => {
    const results: any[] = []
    for (const adminUsername of HARDCODED_ADMIN_USERNAMES) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/public/posts?limit=200`)
        if (res.ok) {
          const data = await res.json()
          const all: any[] = Array.isArray(data) ? data : (data.posts || [])
          const adminOnly = all
            .filter(p => p.username?.toLowerCase() === adminUsername.toLowerCase())
            .map(p => ({ ...p, id: p.id || p._id, isAdminPost: true, hasGoldenBadge: true }))
          results.push(...adminOnly)
        }
      } catch {}
    }
    const seen = new Set<string>()
    return results.filter(p => {
      const id = p.id || p._id
      if (!id || seen.has(id)) return false
      seen.add(id); return true
    })
  }, [])

  const loadFeed = useCallback(async () => {
    try {
      const cached = localStorage.getItem(LS_POSTS)
      const cachedAdmin = localStorage.getItem(LS_ADMIN_POSTS)
      if (cached) { setAllPosts(JSON.parse(cached)); setHasInitialized(true) }
      if (cachedAdmin) setAdminPosts(JSON.parse(cachedAdmin))
      if (!cached) setLoading(true) // Only show spinner if no cache at all
    } catch { setLoading(true) }
    const [posts, admin] = await Promise.all([fetchAllPosts(), fetchAdminPosts()])
    if (!isMounted.current) return
    setAllPosts(posts)
    setAdminPosts(admin)
    try { localStorage.setItem(LS_POSTS, JSON.stringify(posts)) } catch {}
    try { localStorage.setItem(LS_ADMIN_POSTS, JSON.stringify(admin)) } catch {}
    setHasInitialized(true)
    setLoading(false)
  }, [fetchAllPosts, fetchAdminPosts])

  useEffect(() => { loadFeed() }, [loadFeed, isLoggedIn])

  // Build feed whenever data or filters change
  useEffect(() => {
    if (!hasInitialized) return
    if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current)
    filterTimeoutRef.current = setTimeout(() => {
      let combined = [...allPosts, ...adminPosts]

      // Deduplicate
      const seen = new Set<string>()
      combined = combined.filter(p => {
        const id = String(p._id || p.id || '')
        if (!id || seen.has(id)) return false
        seen.add(id); return true
      })

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        combined = combined.filter(p =>
          p.text?.toLowerCase().includes(q) ||
          p.username?.toLowerCase().includes(q) ||
          (p.hashtags || []).some((h: string) => h.includes(q.replace('#', '')))
        )
      }

      // Following filter
      if (sortFilter === 'following' && isLoggedIn && currentUser?.following) {
        const followSet = new Set((currentUser.following as any[]).map(f => f.username || f))
        combined = combined.filter(p => followSet.has(p.username))
      }

      // Sort: boosted first, then newest
      const boosted = combined.filter(isPostBoosted)
      const rest = combined.filter(p => !isPostBoosted(p))
      boosted.sort((a, b) => (b.boostPriority || 0) - (a.boostPriority || 0))
      rest.sort((a, b) => new Date(b.timestamp || b.createdAt || 0).getTime() - new Date(a.timestamp || a.createdAt || 0).getTime())

      const final = [...boosted, ...rest]
      setFilteredPosts(final)
      setVisibleCount(POSTS_PER_PAGE)
      setVisiblePosts(final.slice(0, POSTS_PER_PAGE))
      setLoading(false)
    }, 250)
    return () => { if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current) }
  }, [allPosts, adminPosts, hasInitialized, typeFilter, sortFilter, searchQuery, isLoggedIn, currentUser])

  // Infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && !loadingMore && visibleCount < filteredPosts.length) {
        setLoadingMore(true)
        setTimeout(() => {
          if (!isMounted.current) return
          const next = Math.min(visibleCount + LOAD_MORE_INCREMENT, filteredPosts.length)
          setVisibleCount(next)
          setVisiblePosts(filteredPosts.slice(0, next))
          setLoadingMore(false)
        }, 300)
      }
    }, { threshold: 0.1 })
    obs.observe(loadMoreRef.current)
    return () => obs.disconnect()
  }, [visibleCount, filteredPosts, loadingMore])

  const handlePostChange = useCallback((updatedPost: any, replaceTempId?: string) => {
    const isAdmin = HARDCODED_ADMIN_USERNAMES.includes(updatedPost.username?.toLowerCase())
    if (isAdmin) {
      setAdminPosts(prev => {
        const idx = prev.findIndex(p => p.id === updatedPost.id)
        return idx >= 0 ? prev.map((p, i) => i === idx ? { ...p, ...updatedPost } : p) : [...prev, updatedPost]
      })
    } else {
      setAllPosts(prev => {
        if (replaceTempId) {
          const ti = prev.findIndex(p => p.id === replaceTempId)
          return ti >= 0 ? prev.map((p, i) => i === ti ? updatedPost : p) : [...prev, updatedPost]
        }
        const idx = prev.findIndex(p => p.id === updatedPost.id)
        return idx >= 0 ? prev.map((p, i) => i === idx ? { ...p, ...updatedPost } : p) : [...prev, updatedPost]
      })
    }
  }, [])

  const handleReset = () => {
    setTypeFilter('all')
    setSortFilter('all')
    setSearchQuery('')
  }

  const handleRefresh = () => {
    localStorage.removeItem(LS_POSTS)
    localStorage.removeItem(LS_ADMIN_POSTS)
    loadFeed()
  }

  const boostedCount = filteredPosts.filter(isPostBoosted).length
  const hasMore = visibleCount < filteredPosts.length

  return (
    <div className="w-full min-h-screen bg-[#0f1219] text-white pb-20">
      <div className="w-full max-w-2xl mx-auto">

        {/* Action bar */}
        <div className="px-3 pt-3 pb-2 flex items-center gap-2 flex-wrap">
          <Link
            href="/leaks"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-linear-to-r from-orange-500 to-pink-600 rounded-full text-xs font-bold text-white whitespace-nowrap shadow-lg"
          >
            🔥 CLICK TO GET WET
          </Link>
          <Link
            href="/boost"
            className="flex items-center gap-1 px-3 py-1.5 bg-[#1e2533] border border-gray-700 hover:border-orange-500/50 text-gray-300 hover:text-white rounded-full text-xs transition-all whitespace-nowrap"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
            Boost
          </Link>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#1e2533] border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white rounded-full text-xs transition-all whitespace-nowrap"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Reset
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#1e2533] border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white rounded-full text-xs transition-all whitespace-nowrap"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Refresh
          </button>
        </div>

        {/* Search bar */}
        <div className="px-3 pb-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search countries, #hashtags, @users, cities, states, or locations..."
              className="w-full bg-[#1e2533] border border-gray-700 text-gray-300 placeholder-gray-600 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-orange-500/60 transition-colors"
            />
          </div>
        </div>

        {/* Filter row */}
        <div className="px-3 pb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${typeFilter === 'all' ? 'bg-orange-500 text-white' : 'bg-[#1e2533] text-gray-400 hover:text-white border border-gray-700'}`}
            >
              All
            </button>
            <button
              onClick={() => setTypeFilter('users')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${typeFilter === 'users' ? 'bg-orange-500 text-white' : 'bg-transparent text-gray-400 hover:text-white'}`}
            >
              Users
            </button>
          </div>
          <select
            value={sortFilter}
            onChange={e => setSortFilter(e.target.value as any)}
            className="bg-[#1e2533] border border-gray-700 text-gray-400 text-xs rounded-md px-2 py-1 focus:outline-none focus:border-orange-500/60"
          >
            <option value="all">All</option>
            <option value="following">Following</option>
          </select>
        </div>

        {/* Login prompt */}
        {!isLoggedIn && (
          <div className="mx-3 mb-3 bg-[#1a1f2e] border border-gray-700/50 rounded-lg px-4 py-3 text-sm text-gray-300">
            Please{' '}
            <Link href="/login" className="text-orange-400 hover:text-orange-300 font-medium transition-colors">
              log in
            </Link>
            {' '}to create a post, chat, make payments, and access additional features!
          </div>
        )}

        {/* Boosted banner */}
        {boostedCount > 0 && (
          <div className="mx-3 mb-3">
            <div className="bg-[#2d2800] border border-yellow-800/40 text-yellow-400 text-xs py-2 px-4 rounded-full text-center font-medium">
              ⭐ {boostedCount} Boosted post{boostedCount > 1 ? 's' : ''} at the top of your feed!
            </div>
          </div>
        )}

        {/* Feed */}
        <div className="flex flex-col items-center gap-4 px-3">
          {loading ? (
            Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="w-full max-w-[420px] bg-[#1a1f2e] rounded-xl overflow-hidden animate-pulse">
                <div className="h-80 bg-[#252b3b]" />
                <div className="p-4 space-y-2">
                  <div className="h-3.5 bg-[#252b3b] rounded w-1/3" />
                  <div className="h-3 bg-[#252b3b] rounded w-2/3" />
                </div>
              </div>
            ))
          ) : visiblePosts.length > 0 ? (
            <>
              {visiblePosts.map(post => (
                <Card
                  key={post._id || String(post.id)}
                  post={post}
                  currentUser={currentUser}
                  isAdmin={HARDCODED_ADMIN_USERNAMES.includes(currentUser?.username?.toLowerCase())}
                  onPostUpdate={(id, data) => handlePostChange({ ...post, id, ...data })}
                  setPosts={handlePostChange}
                />
              ))}
              <div ref={loadMoreRef} className="w-full py-4 text-center">
                {loadingMore ? (
                  <div className="flex items-center justify-center gap-2 text-gray-500 text-xs">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-orange-500 border-t-transparent" />
                    Loading more...
                  </div>
                ) : hasMore ? (
                  <button
                    onClick={() => {
                      const next = Math.min(visibleCount + LOAD_MORE_INCREMENT, filteredPosts.length)
                      setVisibleCount(next)
                      setVisiblePosts(filteredPosts.slice(0, next))
                    }}
                    className="px-5 py-2 bg-[#1e2533] border border-gray-700 text-gray-400 rounded-full text-xs hover:border-orange-500/50 hover:text-white transition-all"
                  >
                    Load more ({filteredPosts.length - visibleCount} remaining)
                  </button>
                ) : (
                  <p className="text-gray-700 text-xs">You've seen all {filteredPosts.length} posts</p>
                )}
              </div>
            </>
          ) : (
            <div className="w-full text-center py-16 px-6">
              <div className="text-5xl mb-4">✨</div>
              <h3 className="text-white text-lg font-bold mb-2">No posts yet</h3>
              <p className="text-gray-500 text-sm mb-6">
                {searchQuery ? 'No results for your search.' : 'Be the first to share something!'}
              </p>
              {searchQuery ? (
                <button onClick={handleReset} className="px-5 py-2.5 bg-orange-500 text-white rounded-full text-sm font-medium">
                  Clear Search
                </button>
              ) : !isLoggedIn ? (
                <Link href="/register" className="inline-block px-6 py-2.5 bg-linear-to-r from-orange-500 to-red-500 text-white rounded-full font-medium text-sm">
                  Join 6tyNine
                </Link>
              ) : null}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

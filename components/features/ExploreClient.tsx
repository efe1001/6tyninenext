'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getMediaUrl } from '@/lib/firebase'

const API_BASE_URL = ''

type UserType = 'all' | 'content_creator' | 'escort' | 'both'
type SearchTab = 'creators' | 'posts'

interface Creator {
  _id?: string
  username: string
  profilePicture?: string
  firstName?: string
  lastName?: string
  name?: string
  displayName?: string
  bio?: string
  userType?: string
  location?: string
  city?: string
  country?: string
  followers?: any[]
  following?: any[]
  subscribers?: any[]
}

interface Post {
  _id: string
  username: string
  text?: string
  mediaUrls?: string[]
  timestamp?: string
  likes?: any[]
  comments?: any[]
  hashtags?: string[]
}

export default function ExploreClient() {
  const router = useRouter()
  const { user: currentUser } = useAuth()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<SearchTab>('creators')
  const [userTypeFilter, setUserTypeFilter] = useState<UserType>('all')

  const [creators, setCreators] = useState<Creator[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [suggestedCreators, setSuggestedCreators] = useState<Creator[]>([])

  const [loading, setLoading] = useState(false)
  const [loadingSuggested, setLoadingSuggested] = useState(true)
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({})
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({})

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasFetchedSuggested = useRef(false)

  // Fetch suggested creators on mount
  useEffect(() => {
    if (hasFetchedSuggested.current) return
    hasFetchedSuggested.current = true

    const fetchSuggested = async () => {
      setLoadingSuggested(true)
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const res = await fetch(`${API_BASE_URL}/api/auth/public/users?limit=20`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        })
        if (res.ok) {
          const data = await res.json()
          setSuggestedCreators(Array.isArray(data) ? data : data.users || [])
        }
      } catch {}
      finally { setLoadingSuggested(false) }
    }
    fetchSuggested()
  }, [])

  // Load following state
  useEffect(() => {
    if (!currentUser?.following) return
    const map: Record<string, boolean> = {}
    currentUser.following.forEach((f: any) => {
      const username = typeof f === 'string' ? f : f.username
      if (username) map[username] = true
    })
    setFollowingMap(map)
  }, [currentUser])

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!searchQuery.trim()) {
      setCreators([])
      setPosts([])
      return
    }
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchQuery.trim())
    }, 400)
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [searchQuery])

  const performSearch = async (query: string) => {
    setLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const endpoint = token
        ? `/api/auth/search/comprehensive?q=${encodeURIComponent(query)}&limit=50`
        : `/api/auth/public/search/comprehensive?q=${encodeURIComponent(query)}&limit=50`
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      if (res.ok) {
        const data = await res.json()
        setCreators(data.users || [])
        setPosts(data.posts || [])
      }
    } catch {}
    finally { setLoading(false) }
  }

  const handleFollow = useCallback(async (username: string) => {
    if (!currentUser) { router.push('/login'); return }
    const isFollowing = followingMap[username]
    setFollowingMap(prev => ({ ...prev, [username]: !isFollowing }))
    setFollowLoading(prev => ({ ...prev, [username]: true }))
    try {
      const token = localStorage.getItem('token')
      await fetch(`${API_BASE_URL}/api/auth/users/${username}/${isFollowing ? 'unfollow' : 'follow'}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token || ''}`, 'Content-Type': 'application/json' }
      })
    } catch {
      setFollowingMap(prev => ({ ...prev, [username]: isFollowing }))
    } finally {
      setFollowLoading(prev => ({ ...prev, [username]: false }))
    }
  }, [currentUser, followingMap, router])

  const getAvatarUrl = useCallback((pic?: string) => {
    if (!pic) return null
    return getMediaUrl(pic)
  }, [])

  const filteredCreators = useMemo(() => {
    const list = searchQuery.trim() ? creators : suggestedCreators
    if (userTypeFilter === 'all') return list
    return list.filter(c => c.userType === userTypeFilter)
  }, [creators, suggestedCreators, searchQuery, userTypeFilter])

  const getUserTypeBadge = (userType?: string) => {
    switch (userType) {
      case 'escort': return { label: 'Escort', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' }
      case 'both': return { label: 'Creator & Escort', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' }
      default: return { label: 'Creator', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' }
    }
  }

  const getDisplayName = (c: Creator) => c.displayName || c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.username
  const getFollowerCount = (c: Creator) => c.followers?.length || 0
  const getPostMediaUrl = (url: string) => getMediaUrl(url)

  const isSearchMode = searchQuery.trim().length > 0

  return (
    <div className="w-full max-w-2xl mx-auto pb-20 pt-4">
      {/* Search Bar */}
      <div className="px-4 mb-6">
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search creators, escorts, posts..."
            className="w-full bg-gray-800/70 border border-gray-700 rounded-2xl pl-12 pr-12 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition text-base"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* User Type Filter */}
      <div className="px-4 mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {(['all', 'content_creator', 'escort', 'both'] as UserType[]).map(type => (
          <button
            key={type}
            onClick={() => setUserTypeFilter(type)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition border ${
              userTypeFilter === type
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-gray-800/50 text-gray-400 border-gray-700 hover:border-gray-500'
            }`}
          >
            {type === 'all' ? 'All' : type === 'content_creator' ? 'Creators' : type === 'escort' ? 'Escorts' : 'Both'}
          </button>
        ))}
      </div>

      {/* Search Tabs (only shown when searching) */}
      {isSearchMode && (
        <div className="px-4 mb-4 flex gap-4 border-b border-gray-800">
          <button
            onClick={() => setActiveTab('creators')}
            className={`pb-3 text-sm font-medium transition border-b-2 -mb-px ${activeTab === 'creators' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
          >
            Creators {creators.length > 0 && <span className="ml-1 text-xs bg-gray-700 px-1.5 py-0.5 rounded-full">{creators.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab('posts')}
            className={`pb-3 text-sm font-medium transition border-b-2 -mb-px ${activeTab === 'posts' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
          >
            Posts {posts.length > 0 && <span className="ml-1 text-xs bg-gray-700 px-1.5 py-0.5 rounded-full">{posts.length}</span>}
          </button>
        </div>
      )}

      {/* Loading */}
      {(loading || (loadingSuggested && !isSearchMode)) && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
        </div>
      )}

      {/* Creator Cards */}
      {!loading && (!isSearchMode || activeTab === 'creators') && (
        <div className="px-4">
          {!isSearchMode && (
            <h2 className="text-white font-bold text-lg mb-4">
              {userTypeFilter === 'all' ? 'Discover Creators' : userTypeFilter === 'escort' ? 'Escorts' : userTypeFilter === 'both' ? 'Creators & Escorts' : 'Content Creators'}
            </h2>
          )}

          {filteredCreators.length === 0 && !loadingSuggested ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">ðŸ”</div>
              <p className="text-gray-400">
                {isSearchMode ? `No creators found for "${searchQuery}"` : 'No creators found'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCreators.map((creator) => {
                const badge = getUserTypeBadge(creator.userType)
                const displayName = getDisplayName(creator)
                const avatarUrl = getAvatarUrl(creator.profilePicture)
                const followerCount = getFollowerCount(creator)
                const isFollowing = followingMap[creator.username]
                const isSelf = currentUser?.username === creator.username

                return (
                  <div key={creator._id || creator.username} className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-4 border border-gray-700/50 flex items-center gap-4 hover:border-gray-600 transition">
                    <Link href={`/profile/${creator.username}`} className="shrink-0">
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-linear-to-br from-orange-500 to-red-600 flex items-center justify-center">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <span className="text-white text-xl font-bold">{displayName.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                    </Link>

                    <div className="flex-1 min-w-0">
                      <Link href={`/profile/${creator.username}`} className="block">
                        <p className="text-white font-semibold truncate hover:text-orange-400 transition">{displayName}</p>
                        <p className="text-gray-500 text-sm">@{creator.username}</p>
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.color}`}>{badge.label}</span>
                        {followerCount > 0 && (
                          <span className="text-gray-500 text-xs">{followerCount.toLocaleString()} followers</span>
                        )}
                      </div>
                      {creator.bio && (
                        <p className="text-gray-400 text-xs mt-1 truncate">{creator.bio}</p>
                      )}
                      {(creator.city || creator.country) && (
                        <p className="text-gray-600 text-xs mt-0.5">
                          ðŸ“ {[creator.city, creator.country].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>

                    {!isSelf && (
                      <button
                        onClick={() => handleFollow(creator.username)}
                        disabled={followLoading[creator.username]}
                        className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition border ${
                          isFollowing
                            ? 'bg-transparent border-gray-600 text-gray-400 hover:border-red-500 hover:text-red-400'
                            : 'bg-orange-500 border-orange-500 text-white hover:bg-orange-600'
                        } disabled:opacity-50`}
                      >
                        {followLoading[creator.username] ? (
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-current border-t-transparent" />
                        ) : isFollowing ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Post Results */}
      {!loading && isSearchMode && activeTab === 'posts' && (
        <div className="px-4">
          {posts.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">ðŸ“</div>
              <p className="text-gray-400">No posts found for "{searchQuery}"</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {posts.map((post) => {
                const firstMedia = post.mediaUrls?.[0]
                const mediaUrl = firstMedia ? getPostMediaUrl(firstMedia) : null

                return (
                  <Link key={post._id} href={`/post/${post._id}`} className="block">
                    <div className="aspect-square bg-gray-800 rounded-xl overflow-hidden relative group">
                      {mediaUrl ? (
                        <img
                          src={mediaUrl}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-3">
                          <p className="text-gray-400 text-xs text-center line-clamp-4">{post.text}</p>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-2 left-2 right-2">
                          <p className="text-white text-xs font-medium truncate">@{post.username}</p>
                          {post.likes && (
                            <p className="text-gray-300 text-xs">{post.likes.length} likes</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty search */}
      {!loading && !isSearchMode && !loadingSuggested && filteredCreators.length === 0 && (
        <div className="text-center py-16 px-4">
          <div className="text-5xl mb-4">âœ¨</div>
          <h3 className="text-white font-bold text-lg mb-2">Explore 6tyninefans</h3>
          <p className="text-gray-400 text-sm">Search for creators, escorts, and posts</p>
        </div>
      )}
    </div>
  )
}

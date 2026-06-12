'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import Card from '@/components/features/Card'

const extractHashtags = (text: string): string[] => {
  if (!text) return []
  const matches = text.match(/#[\w֐-׿Ѐ-ӿ]+/gi) || []
  return [...new Set(matches.map(tag => tag.replace(/^#/, '').toLowerCase()))]
}

const fetchAllPosts = async (): Promise<any[]> => {
  const endpoints = [
    `/api/public/posts?limit=1000`,
    `/api/auth/public/posts?limit=1000`,
    `/api/auth/posts?limit=1000`,
  ]
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        const data = await response.json()
        return Array.isArray(data) ? data : data.posts || data.data || []
      }
    } catch {}
  }
  return []
}

const fetchAllUsers = async (): Promise<any[]> => {
  const endpoints = [
    `/api/public/users?limit=500`,
    `/api/auth/public/users?limit=500`,
    `/api/auth/users?limit=500`,
  ]
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        const data = await response.json()
        return Array.isArray(data) ? data : data.users || data.data || []
      }
    } catch {}
  }
  return []
}

const searchHashtag = async (hashtag: string): Promise<any[]> => {
  const cleanHashtag = hashtag.toLowerCase().replace(/^#/, '')
  const hashtagEndpoints = [
    `/api/public/hashtag/${encodeURIComponent(cleanHashtag)}`,
    `/api/auth/public/hashtag/${encodeURIComponent(cleanHashtag)}`,
    `/api/auth/posts/hashtag/${encodeURIComponent(cleanHashtag)}`,
  ]
  for (const endpoint of hashtagEndpoints) {
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(3000),
      })
      if (response.ok) {
        const data = await response.json()
        return Array.isArray(data) ? data : data.posts || data.data || []
      }
    } catch {}
  }

  const allPosts = await fetchAllPosts()
  return allPosts.filter(post => {
    if (post.isPremium) return false
    const postText = post.text || post.content || ''
    const postHashtags = post.hashtags || extractHashtags(postText)
    if (Array.isArray(postHashtags)) {
      return postHashtags.some(
        (tag: string) => tag.toLowerCase() === cleanHashtag || tag.toLowerCase().includes(cleanHashtag)
      )
    }
    return postText.toLowerCase().includes(`#${cleanHashtag}`)
  })
}

const renderTextWithHashtags = (text: string, router: ReturnType<typeof useRouter>) => {
  if (!text) return null
  const regex = /(#[\w֐-׿Ѐ-ӿ]+)/gi
  const parts = text.split(regex)
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      const cleanHashtag = part.slice(1).toLowerCase()
      return (
        <Link
          key={index}
          href={`/hashtag/${cleanHashtag}`}
          className="text-orange-400 hover:underline font-semibold cursor-pointer"
          onClick={e => e.stopPropagation()}
        >
          {part}
        </Link>
      )
    }
    return <span key={index}>{part}</span>
  })
}

const SkeletonCard = () => (
  <div className="w-full max-w-[350px] bg-gray-800 p-4 rounded-md animate-pulse">
    <div className="flex items-center space-x-3 mb-4">
      <div className="w-10 h-10 bg-gray-700 rounded-full"></div>
      <div className="space-y-1">
        <div className="h-4 bg-gray-700 rounded w-24"></div>
        <div className="h-3 bg-gray-700 rounded w-20"></div>
      </div>
    </div>
    <div className="h-48 bg-gray-700 rounded-md mb-4"></div>
    <div className="space-y-2">
      <div className="h-4 bg-gray-700 rounded w-full"></div>
      <div className="h-3 bg-gray-700 rounded w-3/4"></div>
    </div>
  </div>
)

export default function HashtagClient() {
  const params = useParams<{ hashtag: string }>()
  const hashtag = params?.hashtag || ''
  const router = useRouter()
  const { currentUser, isLoggedIn } = useAuth()
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInfo, setSearchInfo] = useState({ method: '', count: 0 })
  const [endpointStatus, setEndpointStatus] = useState('Testing endpoints...')

  const handlePostChange = useCallback((updatedPost: any, replaceTempId?: string) => {
    setPosts(prevPosts => {
      if (!Array.isArray(prevPosts)) return prevPosts
      const updated = [...prevPosts]
      if (replaceTempId) {
        const tempIndex = updated.findIndex(p => p.id === replaceTempId)
        if (tempIndex !== -1) {
          updated[tempIndex] = updatedPost
        } else {
          updated.unshift(updatedPost)
        }
      } else {
        const existingIndex = updated.findIndex(p => p.id === updatedPost.id)
        if (existingIndex !== -1) {
          updated[existingIndex] = updatedPost
        } else {
          updated.unshift(updatedPost)
        }
      }
      return updated
    })
  }, [])

  useEffect(() => {
    const fetchPostsForHashtag = async () => {
      if (!hashtag) {
        setError('No hashtag provided')
        setLoading(false)
        return
      }

      const cleanHashtag = hashtag.replace(/^#/, '').trim().toLowerCase()
      if (!cleanHashtag) {
        setError('Invalid hashtag')
        setLoading(false)
        return
      }

      setLoading(true)
      setPosts([])
      setError(null)
      setSearchInfo({ method: '', count: 0 })

      try {
        setEndpointStatus('Searching for hashtag...')
        const matchingPosts = await searchHashtag(cleanHashtag)

        if (matchingPosts.length === 0) {
          setEndpointStatus('Performing deep search...')
          const allUsers = await fetchAllUsers()
          let userPostsFound = 0

          for (const user of allUsers.slice(0, 20)) {
            try {
              const userEndpoints = [
                `/api/public/users/${user.username}/posts`,
                `/api/auth/public/users/${user.username}/posts`,
              ]
              for (const endpoint of userEndpoints) {
                try {
                  const response = await fetch(endpoint)
                  if (response.ok) {
                    const data = await response.json()
                    const userPosts = Array.isArray(data) ? data : data.posts || data.data || []
                    const userMatchingPosts = userPosts.filter((post: any) => {
                      if (post.isPremium) return false
                      const postText = post.text || post.content || ''
                      return postText.toLowerCase().includes(`#${cleanHashtag}`)
                    })
                    if (userMatchingPosts.length > 0) {
                      matchingPosts.push(...userMatchingPosts)
                      userPostsFound += userMatchingPosts.length
                    }
                    break
                  }
                } catch {}
              }
            } catch {}
          }

          if (userPostsFound > 0) {
            setSearchInfo({ method: `Deep search (${userPostsFound} from users)`, count: userPostsFound })
          }
        } else {
          setSearchInfo({ method: 'Hashtag search', count: matchingPosts.length })
        }

        const processedPosts = matchingPosts.map((post: any) => ({
          ...post,
          id: post.id || post._id || `temp-${Date.now()}-${Math.random()}`,
          hashtags: post.hashtags || extractHashtags(post.text || post.content || ''),
          likes: post.likes || [],
          comments: post.comments || [],
          views: post.views || 0,
          images: post.images || [],
          videos: post.videos || [],
          isPremium: post.isPremium || false,
          timestamp: post.timestamp || post.createdAt || new Date().toISOString(),
          username: post.username || 'unknown',
        }))

        const uniquePosts: any[] = []
        const seenIds = new Set<string>()
        for (const post of processedPosts) {
          if (!seenIds.has(post.id)) {
            seenIds.add(post.id)
            uniquePosts.push(post)
          }
        }

        const sortedPosts = uniquePosts.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )

        setPosts(sortedPosts)
        setEndpointStatus(`Found ${sortedPosts.length} posts`)

        if (sortedPosts.length === 0) {
          setError(
            `No public posts found for #${hashtag}. Try logging in to see premium posts.`
          )
        }
      } catch (err: any) {
        setError(`Failed to search for #${hashtag}. Please try again later.`)
        setEndpointStatus('Search failed')
      } finally {
        setLoading(false)
      }
    }

    fetchPostsForHashtag()
  }, [hashtag, isLoggedIn])

  const visiblePosts = useMemo(() => (Array.isArray(posts) ? posts : []), [posts])
  const cleanHashtag = hashtag.replace(/^#/, '').trim()
  const postCount = visiblePosts.length

  if (loading) {
    return (
      <div className="w-full max-w-3xl space-y-6 relative" style={{ paddingTop: '100px' }}>
        <div className="flex flex-col items-center justify-center mb-6 px-4">
          <h2 className="text-white text-xl font-semibold mb-2">Searching for #{hashtag}...</h2>
          <p className="text-gray-400 text-sm">{endpointStatus}</p>
          {!isLoggedIn && (
            <p className="text-yellow-400 text-xs mt-2">
              Viewing public posts only. Login to see premium content.
            </p>
          )}
        </div>
        <div className="flex flex-col items-center space-y-6">
          {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl space-y-6 relative" style={{ paddingTop: '100px' }}>
      <div className="flex items-center justify-between mb-6 px-4">
        <div>
          <h2 className="text-white text-xl font-semibold">
            #{cleanHashtag} <span className="text-gray-400">({postCount} posts)</span>
          </h2>
          {searchInfo.method && (
            <p className="text-gray-400 text-sm mt-1">{searchInfo.method}</p>
          )}
          {!isLoggedIn && postCount > 0 && (
            <p className="text-yellow-400 text-xs mt-1">
              Showing public posts only. Login to see premium content with this hashtag.
            </p>
          )}
        </div>
        <Link href="/" className="text-orange-500 hover:underline text-sm">
          Back to Home
        </Link>
      </div>

      {error ? (
        <div className="text-white text-center bg-gray-800 p-8 rounded-xl border border-gray-700 space-y-6">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-xl font-bold">#{cleanHashtag}</h3>
          <p className="text-gray-400">{error}</p>
          <div className="space-y-4">
            {!isLoggedIn && (
              <div className="bg-gray-900 p-4 rounded-lg">
                <p className="text-yellow-400 text-sm mb-2">ℹ️ Login for more content</p>
                <p className="text-gray-400 text-xs">
                  Some posts with #{cleanHashtag} might be premium content. Login or create an account to see all posts.
                </p>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/" className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium transition-colors">
                ← Back to Home
              </Link>
              {!isLoggedIn && (
                <Link href="/login" className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium transition-colors">
                  Login to See More
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : postCount > 0 ? (
        <>
          <div className="flex flex-col items-center space-y-6">
            {visiblePosts.map(post => (
              <Card
                key={post.id || post._id}
                post={post}
                currentUser={currentUser}
                setPosts={handlePostChange}
                renderTextWithHashtags={(text: string) => renderTextWithHashtags(text, router)}
              />
            ))}
          </div>
          <div className="text-center py-8 border-t border-gray-700 mt-8">
            <div className="inline-block bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400 text-lg mb-2">
                {postCount === 1 ? 'Found 1 post' : `Found ${postCount} posts`} for #{cleanHashtag}
              </p>
              {!isLoggedIn && (
                <div className="mt-4 p-3 bg-gray-900 rounded-lg">
                  <p className="text-yellow-400 text-sm">Want to see all posts with #{cleanHashtag}?</p>
                  <Link href="/login" className="inline-block mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">
                    Login to View Premium Content
                  </Link>
                </div>
              )}
              <div className="mt-6">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-linear-to-r from-gray-700 to-gray-800 text-white rounded-lg hover:from-gray-600 hover:to-gray-700 font-medium transition-all"
                >
                  ← Back to Home
                </Link>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-white text-center bg-gray-800 p-8 rounded-xl border border-gray-700 space-y-6">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-xl font-bold">#{cleanHashtag}</h3>
          <p className="text-gray-400">No posts found with this hashtag</p>
          <div className="space-y-4">
            {!isLoggedIn && (
              <div className="bg-gray-900 p-4 rounded-lg">
                <p className="text-yellow-400 text-sm mb-2">ℹ️ Login for more content</p>
                <p className="text-gray-400 text-xs">
                  Some posts with #{cleanHashtag} might be premium content. Login or create an account to see all posts.
                </p>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/" className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium transition-colors">
                ← Back to Home
              </Link>
              {!isLoggedIn && (
                <>
                  <Link href="/login" className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium transition-colors">
                    Login
                  </Link>
                  <Link href="/register" className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium transition-colors">
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

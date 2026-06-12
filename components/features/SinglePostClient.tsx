'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import Card from '@/components/features/Card'

export default function SinglePostClient() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { currentUser } = useAuth()
  const [post, setPost] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isProfileOwner, setIsProfileOwner] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    const fetchPost = async () => {
      if (!id) {
        setError('Post ID is required')
        setLoading(false)
        return
      }

      try {
        const token = localStorage.getItem('token')
        let fetchedPost: any = null
        let isPremiumPost = false

        try {
          const findResponse = await fetch(`/api/auth/find-post/${id}`)
          if (findResponse.ok) {
            const findData = await findResponse.json()
            fetchedPost = findData
            isPremiumPost = findData.isPremium || false
          }
        } catch {}

        if (!fetchedPost) {
          try {
            const publicResponse = await fetch(`/api/auth/public/posts/${id}`)
            if (publicResponse.ok) {
              fetchedPost = await publicResponse.json()
            }
          } catch {}

          if (!fetchedPost) {
            try {
              const publicPremiumResponse = await fetch(`/api/auth/public/premium-posts/${id}`)
              if (publicPremiumResponse.ok) {
                fetchedPost = await publicPremiumResponse.json()
                isPremiumPost = true
              }
            } catch {}
          }
        }

        if (!fetchedPost && !token) {
          try {
            const publicPremiumResponse = await fetch(`/api/premium-posts/${id}`)
            if (publicPremiumResponse.ok) {
              fetchedPost = await publicPremiumResponse.json()
              if (fetchedPost) {
                isPremiumPost = true
                fetchedPost.isPremium = true
              }
            }
          } catch {}
        }

        if (!fetchedPost) {
          throw new Error(`Post with ID ${id} not found`)
        }

        setPost(fetchedPost)

        const isOwner = fetchedPost.username === currentUser?.username
        setIsProfileOwner(isOwner)

        if (isPremiumPost && fetchedPost.username && !isOwner && token) {
          try {
            const subResponse = await fetch(`/api/auth/users/${fetchedPost.username}/subscription`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            })
            if (subResponse.ok) {
              const subData = await subResponse.json()
              setIsSubscribed(subData.isSubscribed || false)
            } else {
              setIsSubscribed(false)
            }
          } catch {
            setIsSubscribed(false)
          }
        } else if (isPremiumPost && !token) {
          setIsSubscribed(false)
        } else {
          setIsSubscribed(true)
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load post')
      } finally {
        setLoading(false)
      }
    }

    fetchPost()
  }, [id, currentUser])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <h1 className="text-2xl font-bold mb-4">Post Not Found</h1>
        <p className="text-gray-400 mb-4">{error || 'Post could not be loaded'}</p>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          Back to Home
        </button>
      </div>
    )
  }

  if (post.isPremium && !isProfileOwner && !isSubscribed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="text-center p-6 max-w-md">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-linear-to-r from-purple-500 to-pink-500 flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 5.5V7H9V5.5L3 7V9L9 10.5V12.5L3 14V16L9 17.5V21H15V17.5L21 16V14L15 12.5V10.5L21 9Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Premium Content</h1>
          <p className="text-gray-300 mb-6">
            Subscribe to {post.username} to view this exclusive content.
          </p>

          {currentUser ? (
            <button
              onClick={() => router.push(`/profile/${post.username}?tab=premium&action=subscribe`)}
              className="px-6 py-3 bg-linear-to-r from-purple-500 to-pink-500 text-white rounded-full hover:from-purple-600 hover:to-pink-600 transition-all duration-200 cursor-pointer shadow-lg font-medium mb-4"
            >
              Subscribe to {post.username}
            </button>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-3 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-all duration-200 cursor-pointer shadow-lg font-medium mb-4"
            >
              Log In to Subscribe
            </button>
          )}

          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.push('/')}
          className="mb-4 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Feed
        </button>

        <div className="flex justify-center">
          <Card
            post={post}
            currentUser={currentUser}
            isProfileOwner={isProfileOwner}
            isSubscribed={isSubscribed}
            handlePremiumPostClick={() => {}}
            handleEditPost={() => {}}
            handleEditPremiumPost={() => {}}
            handleDeletePost={() => {}}
            handleDeletePremiumPost={() => {}}
          />
        </div>
      </div>
    </div>
  )
}

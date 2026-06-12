import { useState, useCallback } from 'react'

const SEEN_POSTS_KEY = 'seen_posts'

const markPostSeen = (postId: string) => {
  try {
    const raw = localStorage.getItem(SEEN_POSTS_KEY)
    const seen: string[] = raw ? JSON.parse(raw) : []
    if (!seen.includes(postId)) {
      seen.push(postId)
      if (seen.length > 2000) seen.splice(0, seen.length - 2000)
      localStorage.setItem(SEEN_POSTS_KEY, JSON.stringify(seen))
    }
  } catch {}
}

export const usePostInteraction = () => {
  const [interactionState, setInteractionState] = useState({
    viewedPosts: new Set<string>(),
    likedPosts: new Set<string>(),
    commentedPosts: new Set<string>(),
  })

  const trackPostView = useCallback((postId: string) => {
    if (!postId) return
    setInteractionState(prev => ({ ...prev, viewedPosts: new Set(prev.viewedPosts).add(postId) }))
    markPostSeen(postId)
  }, [])

  const trackPostLike = useCallback((postId: string) => {
    if (!postId) return
    setInteractionState(prev => ({ ...prev, likedPosts: new Set(prev.likedPosts).add(postId) }))
  }, [])

  const trackPostComment = useCallback((postId: string) => {
    if (!postId) return
    setInteractionState(prev => ({ ...prev, commentedPosts: new Set(prev.commentedPosts).add(postId) }))
  }, [])

  const hasInteractedWithPost = useCallback((postId: string, interactionType: 'viewed' | 'liked' | 'commented' | 'any' = 'any'): boolean => {
    if (!postId) return false
    const { viewedPosts, likedPosts, commentedPosts } = interactionState
    switch (interactionType) {
      case 'viewed': return viewedPosts.has(postId)
      case 'liked': return likedPosts.has(postId)
      case 'commented': return commentedPosts.has(postId)
      default: return viewedPosts.has(postId) || likedPosts.has(postId) || commentedPosts.has(postId)
    }
  }, [interactionState])

  const getSeenPosts = useCallback((): string[] => {
    try {
      const raw = localStorage.getItem(SEEN_POSTS_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }, [])

  const clearSeenPosts = useCallback(() => {
    localStorage.removeItem(SEEN_POSTS_KEY)
    setInteractionState({ viewedPosts: new Set(), likedPosts: new Set(), commentedPosts: new Set() })
  }, [])

  return {
    interactionState,
    trackPostView,
    trackPostLike,
    trackPostComment,
    hasInteractedWithPost,
    getSeenPosts,
    clearSeenPosts,
  }
}

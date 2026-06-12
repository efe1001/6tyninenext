'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import Card from '@/components/features/Card'

const API_BASE = ''
const KORA_PUBLIC_KEY = 'pk_live_d2iNTQyBXJVkaHmS2YkMUcg5WQzWfBs1cWJxg9zu'

const getAuthToken = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  if (!token) return null
  if (token.split('.').length !== 3) { localStorage.removeItem('token'); return null }
  return token
}

const isTokenValid = (token: string) => {
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp > Date.now() / 1000
  } catch { return false }
}

const userTypeOptions = [
  { value: 'content_creator', label: 'Content Creator' },
  { value: 'escort', label: 'Escort' },
  { value: 'both', label: 'Content Creator & Escort' },
]

const numbersVisibilityOptions = [
  { value: 'all_users', label: 'All Users' },
  { value: 'followers_only', label: 'Followers Only' },
  { value: 'subscribers_only', label: 'Subscribers Only' },
  { value: 'non', label: 'Hidden' },
]

interface Props {
  username: string
  initialProfile: any
}

export default function ProfileClient({ username: userId, initialProfile }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentUser, setCurrentUser, isLoggedIn } = useAuth()

  const [profileUser, setProfileUser] = useState<any>(initialProfile || null)
  const [activeTab, setActiveTab] = useState('posts')
  const [isFollowing, setIsFollowing] = useState(false)
  const [localPosts, setLocalPosts] = useState<any[]>([])
  const [displayedPosts, setDisplayedPosts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(!initialProfile)
  const [error, setError] = useState<string | null>(null)
  const [postsPage, setPostsPage] = useState(1)
  const [hasMorePosts, setHasMorePosts] = useState(false)
  const [hasPremiumContent, setHasPremiumContent] = useState(false)

  // Subscription state
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [subscriptionExpiry, setSubscriptionExpiry] = useState<string | null>(null)
  const [subscriptionDaysRemaining, setSubscriptionDaysRemaining] = useState(0)
  const [isSubscribedChecked, setIsSubscribedChecked] = useState(false)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [subscriptionReason, setSubscriptionReason] = useState<string | null>(null)
  const [useWalletForSubscription, setUseWalletForSubscription] = useState(false)
  const [subscriptionPlan, setSubscriptionPlan] = useState<any>(null)
  const [koraLoaded, setKoraLoaded] = useState(false)
  const [koraProcessing, setKoraProcessing] = useState(false)
  const [showPremiumLoginModal, setShowPremiumLoginModal] = useState(false)
  const [selectedPremiumPost, setSelectedPremiumPost] = useState<any>(null)

  // Profile edit state
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState<any>({
    username: '', email: '', name: '', firstName: '', lastName: '', bio: '',
    location: '', website: '', socialLinks: { twitter: '', instagram: '', youtube: '' },
    profilePicture: null, premiumPricing: { weekly: 0, monthly: 0, yearly: 0 },
    bankName: '', accountNumber: '', phoneNumber: '', messagesFromPremiumOnly: false,
    numbersVisibility: 'subscribers_only', userType: 'content_creator',
  })
  const [isProfileOwner, setIsProfileOwner] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Post creation
  const [showPostForm, setShowPostForm] = useState(false)
  const [postFormData, setPostFormData] = useState({ text: '', images: [] as File[], videos: [] as File[] })
  const [showPremiumPostForm, setShowPremiumPostForm] = useState(false)
  const [premiumPostFormData, setPremiumPostFormData] = useState({ text: '', images: [] as File[], videos: [] as File[] })
  const [postError, setPostError] = useState<string | null>(null)
  const [premiumPostError, setPremiumPostError] = useState<string | null>(null)
  const [isPostingVideo, setIsPostingVideo] = useState(false)

  // Financial
  const [showPayoutForm, setShowPayoutForm] = useState(false)
  const [showTransactions, setShowTransactions] = useState(false)
  const [showPayoutRequests, setShowPayoutRequests] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [payoutRequests, setPayoutRequests] = useState<any[]>([])
  const [payoutFormData, setPayoutFormData] = useState({ amount: '' })
  const [totalEarnings, setTotalEarnings] = useState(0)

  // Social dropdown
  const [showSocialDropdown, setShowSocialDropdown] = useState(false)
  const [socialTab, setSocialTab] = useState<'followers'|'following'|'subscribers'>('followers')
  const [socialUsers, setSocialUsers] = useState<any[]>([])
  const [socialLoading, setSocialLoading] = useState(false)

  // Misc
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0)
  const [copySuccess, setCopySuccess] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [localFollowersCount, setLocalFollowersCount] = useState(0)

  const initialLimit = 10
  const loadMoreLimit = 5
  const fetchRef = useRef(0)
  const isLoadedRef = useRef(false)

  // Kora SDK loader
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Korapay?.initialize) { setKoraLoaded(true); return }
    const script = document.createElement('script')
    script.src = 'https://korablobstorage.blob.core.windows.net/modal-bucket/korapay-collections.min.js'
    script.async = true
    script.onload = () => {
      const check = setInterval(() => {
        if ((window as any).Korapay?.initialize) { clearInterval(check); setKoraLoaded(true) }
      }, 100)
    }
    document.body.appendChild(script)
    return () => { if (document.body.contains(script)) document.body.removeChild(script) }
  }, [])

  const getPostsForTab = useCallback((posts: any[], tab: string) => {
    if (tab === 'premium') return posts.filter(p => p.isPremium)
    return posts.filter(p => !p.isPremium)
  }, [])

  const fetchUserData = useCallback(async (page = 1, limit = initialLimit) => {
    const fetchId = ++fetchRef.current
    // Only show spinner if we have no profile data — don't wipe an already-visible profile
    if (!initialProfile) setIsLoading(true)
    try {
      setError(null)
      if (!userId) { setError('Invalid profile URL'); setIsLoading(false); return }
      const validToken = getAuthToken()
      const tokenOk = !!(validToken && isTokenValid(validToken))
      const isOwner = currentUser?.username === userId
      const authHdr = tokenOk ? { 'Authorization': `Bearer ${validToken}` } : undefined

      // All three fetches in parallel
      const [userRes, postsRes, subRes] = await Promise.all([
        fetch(
          tokenOk ? `${API_BASE}/api/auth/users/${userId}` : `${API_BASE}/api/auth/public/users/${userId}`,
          authHdr ? { headers: authHdr } : undefined
        ).catch(() => null),
        fetch(
          tokenOk
            ? `${API_BASE}/api/auth/users/${userId}/posts?page=${page}&limit=${limit * 2}`
            : `${API_BASE}/api/auth/public/users/${userId}/posts?page=${page}&limit=${limit * 2}`,
          authHdr ? { headers: authHdr } : undefined
        ).catch(() => null),
        // Subscription check runs in parallel — only when needed
        (!isOwner && !currentUser?.isAdmin && tokenOk && currentUser?.username)
          ? fetch(`${API_BASE}/api/auth/subscriptions/check/${userId}`, { headers: authHdr! }).catch(() => null)
          : Promise.resolve(null),
      ])

      let userData: any = null, regularPosts: any[] = [], premiumPosts: any[] = [], subChecked = false

      if (userRes?.ok) userData = await userRes.json()
      if (!userData) userData = initialProfile || { username: userId, name: userId, followers: [], following: [], subscribers: 0, userType: 'content_creator', bio: '', createdAt: new Date().toISOString() }

      if (postsRes?.ok) {
        const pj = await postsRes.json()
        regularPosts = Array.isArray(pj) ? pj : (pj.posts || [])
      }

      // Premium posts from user response — no extra API call
      if (userData.premiumContent && Array.isArray(userData.premiumContent)) {
        premiumPosts = userData.premiumContent.map((p: any) => ({ ...p, isPremium: true, likes: p.likes || [], comments: p.comments || [], views: p.views || 0 }))
      }

      if (subRes?.ok) { const sd = await subRes.json(); subChecked = sd.isSubscribed === true }

      if (fetchId !== fetchRef.current) { setIsLoading(false); return }

      let allPosts = [...regularPosts, ...premiumPosts].filter(p => (p?.username || p?.user?.username) === userId)
      if (!isOwner && !currentUser?.isAdmin && !subChecked) allPosts = allPosts.filter(p => !p.isPremium)

      const seen = new Set<string>()
      const unique = allPosts.filter(p => { const id = p?.id || p?._id; if (!id || seen.has(id)) return false; seen.add(id); return true })
      unique.sort((a, b) => new Date(b?.timestamp || b?.createdAt || 0).getTime() - new Date(a?.timestamp || a?.createdAt || 0).getTime())

      setProfileUser(userData)
      setLocalPosts(unique)
      setDisplayedPosts(unique.slice(0, limit))
      setIsFollowing(currentUser?.following?.includes(userId) || false)
      setIsProfileOwner(isOwner)
      setHasPremiumContent(unique.some(p => p?.isPremium === true))
      setLocalFollowersCount(userData.followers?.length || 0)
      setFormData({
        username: userData.username || '', email: userData.email || '', name: userData.name || '',
        firstName: userData.firstName || '', lastName: userData.lastName || '', bio: userData.bio || '',
        location: userData.location || '', website: typeof userData.website === 'string' ? userData.website : '',
        socialLinks: userData.socialLinks || { twitter: '', instagram: '', youtube: '' },
        profilePicture: userData.profilePicture || null,
        premiumPricing: userData.premiumPricing || { weekly: 0, monthly: 0, yearly: 0 },
        bankName: userData.bankName || '', accountNumber: userData.accountNumber || '',
        phoneNumber: userData.phoneNumber || '', messagesFromPremiumOnly: userData.messagesFromPremiumOnly || false,
        numbersVisibility: userData.numbersVisibility || 'subscribers_only', userType: userData.userType || 'content_creator',
      })
      setHasMorePosts(unique.length > limit)
      setIsSubscribedChecked(subChecked)
      isLoadedRef.current = true
    } catch (err: any) {
      if (fetchId !== fetchRef.current) return
      setError(`Failed to load profile: ${err.message}`)
    } finally { setIsLoading(false) }
  }, [userId, currentUser, initialLimit, initialProfile])

  const fetchUserSubscription = useCallback(async () => {
    if (!currentUser?.username || !userId || userId === currentUser.username) return
    const token = getAuthToken(); if (!token) return
    const subKey = `sub_${currentUser.username}_${userId}`
    const cached = localStorage.getItem(subKey)
    if (cached) {
      try {
        const d = JSON.parse(cached)
        if (d.expiryDate && new Date(d.expiryDate) > new Date()) {
          setIsSubscribed(true); setSubscriptionDaysRemaining(d.daysRemaining); setSubscriptionExpiry(d.expiryDate); setIsSubscribedChecked(true); return
        } else { localStorage.removeItem(subKey) }
      } catch {}
    }
    try {
      const res = await fetch(`${API_BASE}/api/auth/subscriptions/check/${userId}`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const d = await res.json()
        setIsSubscribed(d.isSubscribed === true)
        if (d.subscription?.expiresAt) {
          const exp = new Date(d.subscription.expiresAt)
          const days = Math.ceil((exp.getTime() - Date.now()) / 86400000)
          setSubscriptionDaysRemaining(days > 0 ? days : 0)
          setSubscriptionExpiry(d.subscription.expiresAt)
          if (d.isSubscribed && days > 0) localStorage.setItem(subKey, JSON.stringify({ isSubscribed: true, daysRemaining: days, expiryDate: d.subscription.expiresAt }))
        }
      } else { setIsSubscribed(false) }
      setIsSubscribedChecked(true)
    } catch { setIsSubscribed(false); setIsSubscribedChecked(true) }
  }, [currentUser, userId])

  // Initial load
  useEffect(() => {
    isLoadedRef.current = false; fetchRef.current++; setIsSubscribedChecked(false)
    if (userId) { setProfileUser(initialProfile || null); setLocalPosts([]); setDisplayedPosts([]); setIsProfileOwner(false) }
  }, [userId])

  useEffect(() => {
    if (userId && !isLoadedRef.current) fetchUserData()
    return () => { fetchRef.current++ }
  }, [fetchUserData, userId])

  useEffect(() => {
    if (currentUser?.username && userId && !isSubscribedChecked) fetchUserSubscription()
  }, [currentUser?.username, userId, isSubscribedChecked, fetchUserSubscription])

  // Post tab switching
  useEffect(() => {
    const filtered = getPostsForTab(localPosts, activeTab)
    setDisplayedPosts(filtered.slice(0, initialLimit))
    setPostsPage(1); setHasMorePosts(filtered.length > initialLimit)
  }, [activeTab, localPosts, initialLimit, getPostsForTab])

  useEffect(() => {
    if (currentUser && profileUser) setIsFollowing(currentUser.following?.includes(profileUser.username) || false)
  }, [currentUser, profileUser])

  // Unread messages
  useEffect(() => {
    if (!currentUser) return
    const fetch_ = async () => {
      try {
        const token = getAuthToken(); if (!token) return
        const res = await fetch(`${API_BASE}/api/auth/messages/unread-count`, { headers: { 'Authorization': `Bearer ${token}` } })
        if (res.ok) { const d = await res.json(); setUnreadMessagesCount(d.count || 0) }
      } catch {}
    }
    fetch_()
    const iv = setInterval(fetch_, 30000)
    return () => clearInterval(iv)
  }, [currentUser])

  // URL params: subscribe action
  useEffect(() => {
    const tab = searchParams.get('tab'), action = searchParams.get('action')
    if (tab === 'premium' && action === 'subscribe' && profileUser && !isSubscribed && !isProfileOwner && !currentUser?.isAdmin) {
      setSubscriptionReason('content'); setActiveTab('premium'); setShowSubscriptionModal(true)
    }
  }, [searchParams, profileUser, isSubscribed, isProfileOwner, currentUser?.isAdmin])

  // Transactions
  useEffect(() => {
    if (transactions.length > 0) setTotalEarnings(transactions.filter(t => t.type === 'earning' && t.status === 'completed').reduce((s, t) => s + t.amount, 0))
    else setTotalEarnings(0)
  }, [transactions])

  const subscriptionOptions = useMemo(() => [
    { interval: 'Weekly', amount: profileUser?.premiumPricing?.weekly || 0, planCode: 'PLN_weekly_default' },
    { interval: 'Monthly', amount: profileUser?.premiumPricing?.monthly || 0, planCode: 'PLN_monthly_default' },
    { interval: 'Yearly', amount: profileUser?.premiumPricing?.yearly || 0, planCode: 'PLN_yearly_default' },
  ].filter(o => o.amount > 0), [profileUser])

  const shouldShowPhoneNumber = useCallback(() => {
    if (!profileUser?.phoneNumber) return false
    const vis = profileUser.numbersVisibility
    if (vis === 'non') return false
    if (vis === 'all_users') return true
    if (!currentUser) return false
    if (vis === 'followers_only') return profileUser.followers?.includes(currentUser.username) || false
    if (vis === 'subscribers_only') return isSubscribed || isProfileOwner
    return false
  }, [profileUser, currentUser, isSubscribed, isProfileOwner])

  const handleFollow = useCallback(async (targetUsername = userId) => {
    if (!currentUser?.username) { alert('Please log in to follow users'); router.push('/login'); return }
    const token = getAuthToken(); if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/${targetUsername}/follow`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) throw new Error('Follow failed')
      if (setCurrentUser) setCurrentUser((prev: any) => ({ ...prev, following: [...(prev.following || []), targetUsername] }))
      if (targetUsername === userId) {
        setIsFollowing(true); setLocalFollowersCount(p => p + 1)
        setProfileUser((prev: any) => prev ? ({ ...prev, followers: [...(prev.followers || []), currentUser.username] }) : prev)
      }
    } catch (err: any) { alert(err.message || 'Action failed') }
  }, [currentUser, userId, router, setCurrentUser])

  const handleUnfollow = useCallback(async (targetUsername = userId) => {
    if (!currentUser?.username) return
    const token = getAuthToken(); if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/${targetUsername}/unfollow`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) throw new Error('Unfollow failed')
      if (setCurrentUser) setCurrentUser((prev: any) => ({ ...prev, following: (prev.following || []).filter((f: string) => f !== targetUsername) }))
      if (targetUsername === userId) {
        setIsFollowing(false); setLocalFollowersCount(p => Math.max(0, p - 1))
        setProfileUser((prev: any) => prev ? ({ ...prev, followers: (prev.followers || []).filter((f: string) => f !== currentUser.username) }) : prev)
      }
    } catch (err: any) { alert(err.message || 'Action failed') }
  }, [currentUser, userId, setCurrentUser])

  const handleFollowToggle = useCallback(async () => {
    if (followLoading) return; setFollowLoading(true)
    try { isFollowing ? await handleUnfollow() : await handleFollow() }
    finally { setFollowLoading(false) }
  }, [followLoading, isFollowing, handleFollow, handleUnfollow])

  const handleSubscribe = useCallback(async (plan: any) => {
    if (!currentUser?.username) { alert('Please log in to subscribe'); router.push('/login'); return }
    if (isSubscribed) { alert(`You already have an active subscription! Expires in ${subscriptionDaysRemaining} days.`); setShowSubscriptionModal(false); return }
    const token = getAuthToken(); if (!token) return
    setSubscriptionPlan(plan)
    const amountInNaira = plan.amount
    try {
      if (useWalletForSubscription) {
        if ((currentUser?.balance || 0) < amountInNaira) { setError(`Insufficient wallet balance. Required: ₦${amountInNaira.toLocaleString()}`); return }
        const subRes = await fetch(`${API_BASE}/api/auth/subscribe/${profileUser.username}`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ planCode: plan.planCode, recurring: 'recurring', schedule: 'immediate', useWallet: true }),
        })
        if (!subRes.ok) { const e = await subRes.json(); throw new Error(e.message || 'Subscription failed') }
        const result = await subRes.json()
        const days = plan.interval === 'Weekly' ? 7 : plan.interval === 'Monthly' ? 30 : 365
        const expiryDate = new Date(); expiryDate.setDate(expiryDate.getDate() + days)
        setIsSubscribed(true); setSubscriptionDaysRemaining(days); setSubscriptionExpiry(expiryDate.toISOString())
        if (setCurrentUser) setCurrentUser((prev: any) => ({ ...prev, balance: result.newBalance }))
        setProfileUser((prev: any) => ({ ...prev, subscribers: (prev.subscribers || 0) + 1 }))
        localStorage.setItem(`sub_${currentUser.username}_${profileUser.username}`, JSON.stringify({ isSubscribed: true, daysRemaining: days, expiryDate: expiryDate.toISOString() }))
        setShowSubscriptionModal(false); setSubscriptionReason(null); setIsSubscribedChecked(true)
        alert(`Subscription successful! ${days} days access. New balance: ₦${result.newBalance?.toLocaleString()}`)
      } else {
        if (!(window as any).Korapay?.initialize) { alert('Payment service unavailable. Please try again.'); return }
        const reference = `SUB_${currentUser.username}_${profileUser.username}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_')
        const customerEmail = currentUser.email || `${currentUser.username}@example.com`
        setKoraProcessing(true)
        const instance = (window as any).Korapay.initialize({
          key: KORA_PUBLIC_KEY, reference, amount: amountInNaira, currency: 'NGN',
          customer: { name: currentUser.name || currentUser.username, email: customerEmail },
          metadata: { plan_interval: plan.interval, creator_username: profileUser.username, subscriber_username: currentUser.username },
          onSuccess: async (data: any) => {
            instance?.close?.(); setKoraProcessing(false)
            try {
              const subRes = await fetch(`${API_BASE}/api/auth/subscribe/${profileUser.username}`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ planCode: plan.planCode, reference: data.transaction_id || reference, recurring: 'recurring', schedule: 'immediate', paymentGateway: 'kora', amount: amountInNaira, currency: 'NGN' }),
              })
              if (!subRes.ok) { const e = await subRes.json(); throw new Error(e.message || 'Subscription failed') }
              const days = plan.interval === 'Weekly' ? 7 : plan.interval === 'Monthly' ? 30 : 365
              const expiryDate = new Date(); expiryDate.setDate(expiryDate.getDate() + days)
              setIsSubscribed(true); setSubscriptionDaysRemaining(days); setSubscriptionExpiry(expiryDate.toISOString())
              setProfileUser((prev: any) => ({ ...prev, subscribers: (prev.subscribers || 0) + 1 }))
              localStorage.setItem(`sub_${currentUser.username}_${profileUser.username}`, JSON.stringify({ isSubscribed: true, daysRemaining: days, expiryDate: expiryDate.toISOString() }))
              setShowSubscriptionModal(false); setSubscriptionReason(null); setIsSubscribedChecked(true); setActiveTab('premium')
              alert(`Subscription successful! ${days} days access.`)
            } catch (err: any) { alert(`Subscription failed: ${err.message}`) }
          },
          onClose: () => setKoraProcessing(false),
          onError: (err: any) => { setKoraProcessing(false); instance?.close?.(); alert(`Payment error: ${err?.message || 'Unknown error'}`) },
        })
        instance.setup()
      }
    } catch (err: any) { setError(`Payment failed: ${err.message}`); setKoraProcessing(false) }
  }, [currentUser, profileUser, isSubscribed, subscriptionDaysRemaining, useWalletForSubscription, router, setCurrentUser])

  const uploadFilesWithProgress = useCallback(async (files: File[], pathPrefix: string, username: string) => {
    const urls: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.split('.').pop()
      const fileRef = storageRef(storage, `${pathPrefix}/${username}_${Date.now()}_${i}.${ext}`)
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(fileRef, file)
        task.on('state_changed', snap => setUploadProgress(Math.round((i + snap.bytesTransferred / snap.totalBytes) / files.length * 100)), reject, async () => {
          urls.push(await getDownloadURL(task.snapshot.ref)); resolve()
        })
      })
    }
    return urls
  }, [])

  const handleCreatePost = useCallback(async (e: React.FormEvent, isPremium = false) => {
    e.preventDefault()
    const data = isPremium ? premiumPostFormData : postFormData
    const setErr = isPremium ? setPremiumPostError : setPostError
    if (!data.text.trim() && data.images.length === 0 && data.videos.length === 0) { setErr('Please add text or media'); return }
    if (!currentUser) { router.push('/login'); return }
    const token = getAuthToken(); if (!token) { setErr('Authentication required'); return }
    setErr(null); setUploadProgress(0)
    try {
      const imageUrls = data.images.length > 0 ? await uploadFilesWithProgress(data.images, 'posts/images', currentUser.username) : []
      const videoUrls = data.videos.length > 0 ? await uploadFilesWithProgress(data.videos, 'posts/videos', currentUser.username) : []
      const endpoint = isPremium ? `${API_BASE}/api/auth/premium-posts` : `${API_BASE}/api/auth/posts`
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: data.text.trim(), images: imageUrls, videos: videoUrls, username: currentUser.username, isPremium, timestamp: new Date().toISOString() }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Failed to create post') }
      const newPost = await res.json()
      const postData = { ...newPost, isPremium, likes: [], comments: [], views: 0, images: imageUrls, videos: videoUrls }
      const updated = [postData, ...localPosts]
      setLocalPosts(updated)
      setDisplayedPosts(getPostsForTab(updated, activeTab).slice(0, initialLimit))
      if (isPremium) { setHasPremiumContent(true); setPremiumPostFormData({ text: '', images: [], videos: [] }); setShowPremiumPostForm(false) }
      else { setPostFormData({ text: '', images: [], videos: [] }); setShowPostForm(false) }
      setUploadProgress(0)
    } catch (err: any) { setErr(err.message || 'Failed to create post') }
  }, [postFormData, premiumPostFormData, currentUser, localPosts, activeTab, initialLimit, router, uploadFilesWithProgress, getPostsForTab])

  const handleDeletePost = useCallback(async (postId: string, isPremium = false) => {
    if (!confirm('Delete this post?')) return
    const token = getAuthToken(); if (!token) return
    try {
      const endpoint = isPremium ? `${API_BASE}/api/auth/premium-posts/${postId}` : `${API_BASE}/api/auth/posts/${postId}`
      await fetch(endpoint, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
      const updated = localPosts.filter(p => (p.id || p._id) !== postId)
      setLocalPosts(updated); setDisplayedPosts(getPostsForTab(updated, activeTab).slice(0, displayedPosts.length))
    } catch {}
  }, [localPosts, displayedPosts, activeTab, getPostsForTab])

  const handlePostUpdate = useCallback((id: string, data: any) => {
    setLocalPosts(prev => { const idx = prev.findIndex(p => (p.id || p._id) === id); return idx >= 0 ? prev.map((p, i) => i === idx ? { ...p, ...data } : p) : prev })
  }, [])

  const handleSaveProfile = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getAuthToken(); if (!token) return
    try {
      let picUrl = formData.profilePicture
      if (formData.profilePicture instanceof File) {
        const fileRef = storageRef(storage, `profile-pictures/${currentUser?.username}_${Date.now()}.jpg`)
        const task = uploadBytesResumable(fileRef, formData.profilePicture)
        await task; picUrl = await getDownloadURL(task.snapshot.ref)
      }
      const res = await fetch(`${API_BASE}/api/auth/users/${userId}`, {
        method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, profilePicture: picUrl }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Update failed') }
      const updated = await res.json()
      setProfileUser((prev: any) => ({ ...prev, ...updated }))
      if (setCurrentUser) setCurrentUser((prev: any) => ({ ...prev, ...updated }))
      setEditMode(false)
    } catch (err: any) { setError(err.message) }
  }, [formData, userId, currentUser, setCurrentUser])

  const handleRequestPayout = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getAuthToken(); if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/auth/payout-request`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(payoutFormData.amount), bankName: formData.bankName, accountNumber: formData.accountNumber }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Payout request failed') }
      alert('Payout request submitted!')
      setShowPayoutForm(false); setPayoutFormData({ amount: '' })
    } catch (err: any) { setError(err.message) }
  }, [payoutFormData, formData])

  const loadMorePosts = useCallback(async () => {
    const token = getAuthToken()
    const nextPage = postsPage + 1
    let additionalPosts: any[] = []
    try {
      if (token && isTokenValid(token)) {
        const res = await fetch(`${API_BASE}/api/auth/users/${userId}/posts?page=${nextPage}&limit=${loadMoreLimit}`, { headers: { 'Authorization': `Bearer ${token}` } })
        if (res.ok) { const d = await res.json(); additionalPosts = d.posts || [] }
      } else {
        const res = await fetch(`${API_BASE}/api/auth/public/posts?username=${userId}&limit=${loadMoreLimit}&skip=${(nextPage - 1) * loadMoreLimit}`)
        if (res.ok) { const d = await res.json(); additionalPosts = (Array.isArray(d) ? d : d.posts || []).filter((p: any) => !p.isPremium) }
      }
    } catch {}
    if (additionalPosts.length === 0) { setHasMorePosts(false); return }
    const combined = [...localPosts, ...additionalPosts].sort((a, b) => new Date(b.timestamp || b.createdAt || 0).getTime() - new Date(a.timestamp || a.createdAt || 0).getTime())
    setLocalPosts(combined)
    const currentCount = initialLimit + (nextPage - 1) * loadMoreLimit
    setDisplayedPosts(getPostsForTab(combined, activeTab).slice(0, currentCount))
    setHasMorePosts(getPostsForTab(combined, activeTab).length > currentCount)
    setPostsPage(nextPage)
  }, [postsPage, localPosts, userId, initialLimit, loadMoreLimit, activeTab, getPostsForTab])

  const fetchSocialUsers = useCallback(async (tab: string) => {
    if (!profileUser) return
    setSocialLoading(true); setSocialUsers([])
    try {
      const token = getAuthToken()
      const headers: any = token ? { 'Authorization': `Bearer ${token}` } : {}
      let names: string[] = []
      if (tab === 'followers') names = profileUser.followers || []
      else if (tab === 'following') names = profileUser.following || []
      else if (tab === 'subscribers') {
        const res = await fetch(`${API_BASE}/api/auth/subscribers/${profileUser.username}`, { headers })
        if (res.ok) { const d = await res.json(); names = d.subscribers || d || [] }
      }
      const users = await Promise.all((Array.isArray(names) ? names : []).slice(0, 50).map(async (n: string) => {
        try {
          const res = await fetch(`${API_BASE}/api/auth/public/users/${n}`)
          if (res.ok) return await res.json()
        } catch {}
        return { username: n }
      }))
      setSocialUsers(users.filter(Boolean))
    } catch {} finally { setSocialLoading(false) }
  }, [profileUser])

  const handleStatClick = useCallback((tab: 'followers' | 'following' | 'subscribers') => {
    setSocialTab(tab); setShowSocialDropdown(true); fetchSocialUsers(tab)
  }, [fetchSocialUsers])

  if (error && !profileUser) {
    return (
      <div className="flex-1 flex items-center justify-center py-6 mt-16">
        <div className="w-full max-w-[600px] text-white">
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-6 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold mb-2">Error Loading Profile</h2>
            <p className="text-gray-300 mb-4">{error}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => { isLoadedRef.current = false; fetchUserData() }} className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition">🔄 Try Again</button>
              <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition">🏠 Go Home</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading || !profileUser) {
    return (
      <div className="flex-1 flex items-center justify-center py-6 mt-16">
        <div className="w-full max-w-[600px] text-white">
          <div className="flex items-center space-x-3">
            <div className="w-14 h-14 rounded-full bg-gray-700 animate-pulse" />
            <div className="flex-1">
              <div className="h-5 bg-gray-700 rounded w-32 mb-2 animate-pulse" />
              <div className="h-3 bg-gray-700 rounded w-24 animate-pulse" />
            </div>
          </div>
          <div className="mt-4 h-20 bg-gray-700 rounded animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center py-6 mt-16 relative">
      <div className="w-full max-w-[600px] text-white">
        <article itemScope itemType="https://schema.org/Person">
          {/* Profile Header */}
          <header className="flex justify-between items-start mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 bg-gray-700">
                {profileUser.profilePicture ? (
                  <img src={profileUser.profilePicture} alt={`${profileUser.username}'s profile`} className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).src = '/fallback-image.png' }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white font-bold text-2xl">
                    {profileUser.username?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center space-x-1">
                  <h1 itemProp="name" className="font-bold text-[16px]">{profileUser.username || 'Unknown'}</h1>
                  {profileUser.isAdmin && <span className="bg-yellow-500 text-black px-2 py-0.5 rounded text-xs font-bold">🏅 ADMIN</span>}
                  <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.5l-5-5 1.41-1.41L11 14.67l6.59-6.59L19 9.5l-8 8z"/></svg>
                </div>
                <span className="text-gray-400 text-[13px]">@{profileUser.username}</span>
                <span className="text-gray-400 text-[12px] block">{new Date(profileUser.createdAt || Date.now()).toLocaleDateString()}</span>
                <div className="mt-1">
                  <span className="bg-purple-500 px-2 py-0.5 rounded text-xs">{userTypeOptions.find(o => o.value === profileUser.userType)?.label || 'Content Creator'}</span>
                </div>
                {isSubscribed && !isProfileOwner && subscriptionDaysRemaining > 0 && (
                  <div className="text-green-400 text-[12px] mt-1">✅ Active Subscription - {subscriptionDaysRemaining} day{subscriptionDaysRemaining !== 1 ? 's' : ''} remaining</div>
                )}
                {profileUser.bio && <p itemProp="description" className="text-gray-300 text-[13px] mt-1">{profileUser.bio}</p>}
                {profileUser.location && <p className="text-gray-300 text-[13px] mt-1">📍 {profileUser.location}</p>}
                {profileUser.country && <p className="text-gray-300 text-[13px] mt-1">🌍 {profileUser.country}</p>}
                {profileUser.state && <p className="text-gray-300 text-[13px] mt-1">🏛️ {profileUser.state}</p>}
                {profileUser.city && <p className="text-gray-300 text-[13px] mt-1">🏙️ {profileUser.city}</p>}
                {typeof profileUser.website === 'string' && profileUser.website && (
                  <p className="text-orange-500 text-[13px] mt-1">
                    <a href={profileUser.website} target="_blank" rel="noopener noreferrer" itemProp="url">{profileUser.website}</a>
                  </p>
                )}
                {profileUser.socialLinks && typeof profileUser.socialLinks === 'object' && (
                  <div className="text-orange-500 text-[13px] mt-1 flex space-x-2">
                    {typeof profileUser.socialLinks.twitter === 'string' && profileUser.socialLinks.twitter && <a href={profileUser.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="hover:underline" itemProp="sameAs">Twitter</a>}
                    {typeof profileUser.socialLinks.instagram === 'string' && profileUser.socialLinks.instagram && <a href={profileUser.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="hover:underline" itemProp="sameAs">Instagram</a>}
                    {typeof profileUser.socialLinks.youtube === 'string' && profileUser.socialLinks.youtube && <a href={profileUser.socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="hover:underline" itemProp="sameAs">YouTube</a>}
                  </div>
                )}

                {/* Phone */}
                {shouldShowPhoneNumber() && profileUser.phoneNumber ? (
                  <p className="text-gray-300 text-[13px] mt-1">📱 {profileUser.phoneNumber}</p>
                ) : profileUser.phoneNumber && profileUser.numbersVisibility !== 'non' ? (
                  <p className="text-gray-400 text-[12px] mt-1">📱 Phone: {profileUser.numbersVisibility === 'all_users' ? profileUser.phoneNumber : '🔒 Restricted'}</p>
                ) : null}

                {/* Social stats */}
                <div className="text-gray-300 text-[13px] mt-2 flex gap-1 flex-wrap">
                  <button onClick={() => handleStatClick('followers')} className="hover:text-orange-500 transition">{localFollowersCount} Followers</button>
                  <span>•</span>
                  <button onClick={() => handleStatClick('following')} className="hover:text-orange-500 transition">{profileUser.following?.length || 0} Following</button>
                  <span>•</span>
                  <button onClick={() => handleStatClick('subscribers')} className="hover:text-orange-500 transition">{profileUser.subscribers || 0} Subscribers</button>
                </div>

                {/* Follow button for non-owner */}
                {currentUser && currentUser.username !== profileUser.username && (
                  <button onClick={handleFollowToggle} disabled={followLoading}
                    className={`mt-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${isFollowing ? 'bg-gray-600 text-white hover:bg-red-600' : 'bg-orange-500 text-white hover:bg-orange-600'} disabled:opacity-50`}>
                    {followLoading ? <span className="flex items-center gap-1"><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />{isFollowing ? 'Unfollowing...' : 'Following...'}</span> : isFollowing ? 'Unfollow' : 'Follow'}
                  </button>
                )}
              </div>
            </div>

            <div className="text-right flex-shrink-0 ml-3">
              {currentUser?.username === profileUser.username && (
                <>
                  <p className="text-gray-300 text-[13px] font-semibold">Total Earnings: ₦{totalEarnings.toLocaleString()}</p>
                  <p className="text-gray-300 text-[13px] font-semibold">Balance: ₦{((currentUser?.balance) || 0).toLocaleString()}</p>
                </>
              )}
              <p className="text-gray-400 text-[12px]">Subscribers: {(profileUser.subscribers || 0).toLocaleString()}</p>

              {/* Messages button */}
              <div className="relative inline-block mt-2">
                <button onClick={() => router.push(`/chat/${profileUser.username}`)} className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-[16px] px-2 py-1 rounded-md bg-blue-900/20">
                  💬 Messages
                </button>
                {unreadMessagesCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}</span>
                )}
              </div>

              {currentUser?.isAdmin && (
                <button onClick={() => setShowAdminPanel(true)} className="inline-flex items-center gap-1 text-yellow-400 hover:text-yellow-300 text-[14px] px-2 py-1 rounded-md bg-yellow-900/20 mt-2 block">
                  🛠️ Admin Panel
                </button>
              )}

              <a href="https://wa.me/2349121226191?text=Hello, I need help with the app." target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-green-400 hover:text-green-300 text-[12px] mt-3 block">
                📞 Contact Admin
              </a>

              <div className="mt-4 space-y-2">
                <Link href="/blog" className="flex items-center gap-1 text-blue-400 hover:underline text-[12px]">📝 Visit our Blog</Link>
                <Link href="/faq" className="flex items-center gap-1 text-green-400 hover:underline text-[12px]">❓ FAQ</Link>
                {currentUser?.isAdmin && (
                  <Link href="/admin/blog" className="flex items-center gap-1 text-purple-400 hover:underline text-[12px]">📋 Blog Management</Link>
                )}
              </div>
            </div>
          </header>

          {/* Action buttons for profile owner */}
          {currentUser?.username === profileUser.username && (
            <div className="mt-3 flex gap-2 flex-wrap">
              <button onClick={() => setEditMode(!editMode)} className="flex-1 py-2 rounded-md text-[14px] font-semibold bg-orange-500 text-white hover:bg-orange-600 transition">
                {editMode ? 'Cancel Edit' : 'Edit Profile'}
              </button>
              <button onClick={() => setShowPostForm(!showPostForm)} className="flex-1 py-2 rounded-md text-[14px] font-semibold bg-orange-500 text-white hover:bg-orange-600 transition">
                {showPostForm ? 'Cancel Post' : '+ New Post'}
              </button>
              <button onClick={() => setShowPremiumPostForm(!showPremiumPostForm)} className="flex-1 py-2 rounded-md text-[14px] font-semibold bg-purple-500 text-white hover:bg-purple-600 transition">
                {showPremiumPostForm ? 'Cancel' : '+ Premium Post'}
              </button>
              <button onClick={() => { setShowPayoutForm(!showPayoutForm); if (!showTransactions) { const t = getAuthToken(); if (t) fetch(`${API_BASE}/api/auth/transactions`, { headers: { 'Authorization': `Bearer ${t}` } }).then(r => r.json()).then(d => setTransactions(d.transactions || [])).catch(() => {}) } }} className="flex-1 py-2 rounded-md text-[14px] font-semibold bg-green-600 text-white hover:bg-green-700 transition">
                💰 Payout
              </button>
              <button onClick={() => { setShowTransactions(!showTransactions); const t = getAuthToken(); if (t) { fetch(`${API_BASE}/api/auth/transactions`, { headers: { 'Authorization': `Bearer ${t}` } }).then(r => r.json()).then(d => setTransactions(d.transactions || [])).catch(() => {}) } }} className="flex-1 py-2 rounded-md text-[14px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition">
                📊 Transactions
              </button>
              <button onClick={async () => { const u = `${typeof window !== 'undefined' ? window.location.origin : ''}/profile/${profileUser.username}`; await navigator.clipboard?.writeText(u).catch(() => {}); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000) }} className="flex-1 py-2 rounded-md text-[14px] font-semibold bg-gray-600 text-white hover:bg-gray-700 transition">
                {copySuccess ? '✅ Copied!' : '🔗 Share Profile'}
              </button>
            </div>
          )}

          {/* Subscribe button for non-owners who aren't subscribed */}
          {currentUser && currentUser.username !== profileUser.username && !isSubscribed && subscriptionOptions.length > 0 && (
            <div className="mt-3">
              <button onClick={() => { setSubscriptionReason('content'); setShowSubscriptionModal(true) }}
                className="w-full py-3 rounded-md text-[14px] font-semibold bg-linear-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 transition">
                👑 Subscribe to Premium ({subscriptionOptions[0] ? `₦${subscriptionOptions[0].amount.toLocaleString()}/wk` : ''})
              </button>
            </div>
          )}

          {/* Edit Profile Form */}
          {editMode && (
            <form onSubmit={handleSaveProfile} className="mt-4 bg-gray-800 p-4 rounded-md space-y-3">
              <h3 className="text-white text-[14px] font-semibold">Edit Profile</h3>
              {[
                { label: 'Name', key: 'name', type: 'text' }, { label: 'Bio', key: 'bio', type: 'textarea' },
                { label: 'Location', key: 'location', type: 'text' }, { label: 'Website', key: 'website', type: 'url' },
                { label: 'Phone Number', key: 'phoneNumber', type: 'tel' }, { label: 'Bank Name', key: 'bankName', type: 'text' },
                { label: 'Account Number', key: 'accountNumber', type: 'text' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="text-gray-300 text-[12px] block mb-1">{label}</label>
                  {type === 'textarea' ? (
                    <textarea value={formData[key] || ''} onChange={e => setFormData((p: any) => ({ ...p, [key]: e.target.value }))} rows={3} className="w-full p-2 rounded-md bg-gray-700 text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  ) : (
                    <input type={type} value={formData[key] || ''} onChange={e => setFormData((p: any) => ({ ...p, [key]: e.target.value }))} className="w-full p-2 rounded-md bg-gray-700 text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  )}
                </div>
              ))}
              <div>
                <label className="text-gray-300 text-[12px] block mb-1">User Type</label>
                <select value={formData.userType} onChange={e => setFormData((p: any) => ({ ...p, userType: e.target.value }))} className="w-full p-2 rounded-md bg-gray-700 text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {userTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-300 text-[12px] block mb-1">Phone Number Visibility</label>
                <select value={formData.numbersVisibility} onChange={e => setFormData((p: any) => ({ ...p, numbersVisibility: e.target.value }))} className="w-full p-2 rounded-md bg-gray-700 text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {numbersVisibilityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-300 text-[12px] block mb-1">Premium Pricing (₦)</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['weekly', 'monthly', 'yearly'] as const).map(period => (
                    <div key={period}>
                      <label className="text-gray-400 text-[11px] capitalize">{period}</label>
                      <input type="number" value={formData.premiumPricing?.[period] || 0} onChange={e => setFormData((p: any) => ({ ...p, premiumPricing: { ...p.premiumPricing, [period]: parseFloat(e.target.value) || 0 } }))} className="w-full p-2 rounded-md bg-gray-700 text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-gray-300 text-[12px] block mb-1">Profile Picture</label>
                <input type="file" accept="image/*" onChange={e => { if (e.target.files?.[0]) setFormData((p: any) => ({ ...p, profilePicture: e.target.files![0] })) }} className="w-full p-2 rounded-md bg-gray-700 text-white text-[13px]" />
              </div>
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="h-1.5 bg-gray-700 rounded-full"><div className="h-full bg-orange-500 rounded-full" style={{ width: `${uploadProgress}%` }} /></div>
              )}
              {error && <p className="text-red-400 text-[12px]">{error}</p>}
              <button type="submit" className="w-full py-2 rounded-md text-[14px] font-semibold bg-orange-500 text-white hover:bg-orange-600 transition">Save Changes</button>
            </form>
          )}

          {/* Create Post Form */}
          {showPostForm && (
            <form onSubmit={e => handleCreatePost(e, false)} className="mt-4 bg-gray-800 p-4 rounded-md space-y-3">
              <h3 className="text-white text-[14px] font-semibold">New Post</h3>
              <textarea value={postFormData.text} onChange={e => setPostFormData(p => ({ ...p, text: e.target.value }))} rows={3} placeholder="What's on your mind?" className="w-full p-2 rounded-md bg-gray-700 text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
              <input type="file" accept="image/*,video/*" multiple onChange={e => { if (e.target.files) { const imgs = Array.from(e.target.files).filter(f => f.type.startsWith('image/')); const vids = Array.from(e.target.files).filter(f => f.type.startsWith('video/')); setPostFormData(p => ({ ...p, images: [...p.images, ...imgs], videos: [...p.videos, ...vids] })) } }} className="w-full p-1 text-gray-400 text-[12px]" />
              {postError && <p className="text-red-400 text-[12px]">{postError}</p>}
              {uploadProgress > 0 && uploadProgress < 100 && <div className="h-1.5 bg-gray-700 rounded-full"><div className="h-full bg-orange-500 rounded-full" style={{ width: `${uploadProgress}%` }} /></div>}
              <button type="submit" className="w-full py-2 rounded-md text-[14px] font-semibold bg-orange-500 text-white hover:bg-orange-600 transition">Post</button>
            </form>
          )}

          {/* Create Premium Post Form */}
          {showPremiumPostForm && (
            <form onSubmit={e => handleCreatePost(e, true)} className="mt-4 bg-purple-900/30 border border-purple-500 p-4 rounded-md space-y-3">
              <h3 className="text-white text-[14px] font-semibold">👑 New Premium Post</h3>
              <textarea value={premiumPostFormData.text} onChange={e => setPremiumPostFormData(p => ({ ...p, text: e.target.value }))} rows={3} placeholder="Premium content description..." className="w-full p-2 rounded-md bg-gray-700 text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
              <input type="file" accept="image/*,video/*" multiple onChange={e => { if (e.target.files) { const imgs = Array.from(e.target.files).filter(f => f.type.startsWith('image/')); const vids = Array.from(e.target.files).filter(f => f.type.startsWith('video/')); setPremiumPostFormData(p => ({ ...p, images: [...p.images, ...imgs], videos: [...p.videos, ...vids] })) } }} className="w-full p-1 text-gray-400 text-[12px]" />
              {premiumPostError && <p className="text-red-400 text-[12px]">{premiumPostError}</p>}
              {uploadProgress > 0 && uploadProgress < 100 && <div className="h-1.5 bg-gray-700 rounded-full"><div className="h-full bg-purple-500 rounded-full" style={{ width: `${uploadProgress}%` }} /></div>}
              <button type="submit" className="w-full py-2 rounded-md text-[14px] font-semibold bg-purple-500 text-white hover:bg-purple-600 transition">Post Premium Content</button>
            </form>
          )}

          {/* Payout Form */}
          {showPayoutForm && (
            <form onSubmit={handleRequestPayout} className="mt-4 bg-gray-800 p-4 rounded-md space-y-3">
              <h3 className="text-white text-[14px] font-semibold">Request Payout</h3>
              <p className="text-gray-300 text-[13px]">Balance: ₦{((currentUser?.balance) || 0).toLocaleString()}</p>
              <input type="number" value={payoutFormData.amount} onChange={e => setPayoutFormData(p => ({ ...p, amount: e.target.value }))} placeholder="Amount (₦)" className="w-full p-2 rounded-md bg-gray-700 text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-green-500" />
              <input type="text" value={formData.bankName} onChange={e => setFormData((p: any) => ({ ...p, bankName: e.target.value }))} placeholder="Bank Name" className="w-full p-2 rounded-md bg-gray-700 text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-green-500" />
              <input type="text" value={formData.accountNumber} onChange={e => setFormData((p: any) => ({ ...p, accountNumber: e.target.value }))} placeholder="Account Number" className="w-full p-2 rounded-md bg-gray-700 text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-green-500" />
              <button type="submit" className="w-full py-2 rounded-md text-[14px] font-semibold bg-green-600 text-white hover:bg-green-700 transition">Request Payout</button>
            </form>
          )}

          {/* Transactions */}
          {showTransactions && (
            <div className="mt-4 bg-gray-800 p-4 rounded-md">
              <h3 className="text-white text-[14px] font-semibold mb-2">Transactions</h3>
              {transactions.length > 0 ? (
                <div className="space-y-2">
                  {transactions.map((t: any, i: number) => (
                    <div key={t.id || i} className="bg-gray-700 p-3 rounded-md">
                      <p className="text-gray-300 text-[13px]">Type: {t.type}</p>
                      <p className="text-gray-300 text-[13px]">Amount: ₦{t.amount?.toLocaleString()}</p>
                      <p className="text-gray-300 text-[13px]">Status: {t.status}</p>
                      <p className="text-gray-300 text-[13px]">Date: {new Date(t.createdAt).toLocaleDateString()}</p>
                      {t.reference && <p className="text-gray-400 text-[12px]">Ref: {t.reference}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-gray-400 text-[13px]">No transactions found.</p>}
            </div>
          )}

          {/* Posts Tabs */}
          <section aria-label={`${profileUser.username}'s posts`} className="mt-6">
            <div className="flex border-b border-gray-700">
              <button onClick={() => setActiveTab('posts')} className={`flex-1 py-2 text-[14px] font-semibold text-center transition ${activeTab === 'posts' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-300'}`}>Posts</button>
              {(hasPremiumContent || profileUser?.premiumPricing) && (
                <button onClick={() => {
                  if (!currentUser?.username) { setShowPremiumLoginModal(true); return }
                  const isOwn = currentUser.username === profileUser.username
                  if (isOwn || isSubscribed || currentUser?.isAdmin) setActiveTab('premium')
                  else { setSubscriptionReason('content'); setShowSubscriptionModal(true) }
                }} className={`flex-1 py-2 text-[14px] font-semibold text-center transition ${activeTab === 'premium' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-300'}`}>
                  Premium {!currentUser && '🔒'}{isSubscribed && !isProfileOwner && <span className="ml-1 text-green-400 text-[10px]">✓</span>}
                </button>
              )}
            </div>

            <div className="mt-4">
              {displayedPosts.length > 0 ? (
                <>
                  {displayedPosts.map(post => {
                    const isOwn = currentUser?.username === profileUser?.username
                    const showTeaser = activeTab === 'premium' && post.isPremium && !isSubscribed && !isOwn && !currentUser?.isAdmin
                    if (showTeaser) {
                      return (
                        <div key={post.id || post._id} className="bg-gray-800 p-4 rounded-md mb-4 w-full max-w-[350px]">
                          <div className="relative">
                            <div className="blur-sm pointer-events-none">
                              <p className="text-gray-300 mb-3 line-clamp-2">{post.text || 'Premium content'}</p>
                              {post.images?.[0] && <img src={post.images[0]} alt="" className="w-full h-40 object-cover rounded-md opacity-50" />}
                            </div>
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-60 rounded-md p-4 text-center">
                              <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-3">👑</div>
                              <h3 className="text-white font-semibold text-lg mb-2">Premium Content</h3>
                              <p className="text-gray-300 text-sm mb-4">Subscribe to unlock</p>
                              <button onClick={() => { setSubscriptionReason('content'); setShowSubscriptionModal(true) }} className="w-full py-3 bg-linear-to-r from-purple-500 to-pink-500 text-white rounded-md font-semibold hover:from-purple-600 hover:to-pink-600 transition">
                                Subscribe Now {subscriptionOptions[0] ? `• ₦${subscriptionOptions[0].amount.toLocaleString()}` : ''}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={post.id || post._id} className="relative">
                        <Card post={post} currentUser={currentUser} isAdmin={currentUser?.isAdmin || false} onPostUpdate={(id, data) => handlePostUpdate(id, data)} setPosts={(updated: any) => { if (typeof updated === 'function') return; handlePostUpdate(updated.id || updated._id, updated) }} />
                        {isProfileOwner && (
                          <button onClick={() => handleDeletePost(post.id || post._id, post.isPremium)} className="absolute top-2 right-2 text-red-400 hover:text-red-300 text-xs bg-gray-800/80 px-2 py-1 rounded">🗑️ Delete</button>
                        )}
                      </div>
                    )
                  })}
                  {hasMorePosts && (
                    <button onClick={loadMorePosts} className="w-full py-3 mt-4 rounded-md text-[14px] font-semibold bg-gray-700 text-white hover:bg-gray-600 transition">Load More Posts</button>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">{activeTab === 'premium' ? '👑' : '📭'}</div>
                  <p className="text-gray-400">{activeTab === 'premium' ? 'No premium posts yet' : 'No posts yet'}</p>
                  {isProfileOwner && <p className="text-gray-500 text-sm mt-1">Use the buttons above to create your first post</p>}
                </div>
              )}
            </div>
          </section>
        </article>
      </div>

      {/* Social Dropdown Modal */}
      {showSocialDropdown && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowSocialDropdown(false)}>
          <div className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-white font-bold text-lg">{profileUser.username}'s Network</h3>
            </div>
            <div className="flex border-b border-gray-700">
              {(['followers', 'following', 'subscribers'] as const).map(tab => (
                <button key={tab} onClick={() => { setSocialTab(tab); fetchSocialUsers(tab) }}
                  className={`flex-1 py-2 text-sm font-medium transition ${socialTab === tab ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-400'}`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)} ({tab === 'followers' ? localFollowersCount : tab === 'following' ? (profileUser.following?.length || 0) : (profileUser.subscribers || 0)})
                </button>
              ))}
            </div>
            <div className="max-h-[400px] overflow-y-auto p-2">
              {socialLoading ? (
                <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" /></div>
              ) : socialUsers.length > 0 ? (
                socialUsers.map((u, i) => (
                  <div key={u.username || i} className="flex items-center justify-between p-3 hover:bg-gray-700 rounded-lg transition">
                    <Link href={`/profile/${u.username}`} className="flex items-center space-x-3 flex-1 min-w-0" onClick={() => setShowSocialDropdown(false)}>
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gray-600">
                        {u.profilePicture ? <img src={u.profilePicture} alt={u.username} className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center text-white font-bold">{u.username?.[0]?.toUpperCase() || '?'}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">@{u.username}</p>
                        {u.bio && <p className="text-gray-400 text-xs truncate">{u.bio.substring(0, 50)}</p>}
                        <p className="text-gray-500 text-xs">{u.followers?.length || 0} followers</p>
                      </div>
                    </Link>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <div className="text-4xl mb-3">👥</div>
                  <p className="text-gray-400 text-sm">No {socialTab} yet</p>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-700">
              <button onClick={() => setShowSocialDropdown(false)} className="w-full py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-md text-white transition">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Modal */}
      {showSubscriptionModal && !isSubscribed && !isProfileOwner && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-md max-w-[350px] w-full">
            <h3 className="text-white text-[16px] font-semibold mb-4">
              {subscriptionReason === 'chat' ? 'Subscribe to message the creator' : subscriptionReason === 'live' ? 'Subscribe to join live streams' : 'Subscribe to view premium content'}
            </h3>
            {subscriptionOptions.length === 0 ? (
              <p className="text-gray-400 text-[13px] mb-4">No subscription plans available.</p>
            ) : (
              <>
                <div className="mb-4">
                  <p className="text-gray-300 text-[13px] mb-2">Payment Method:</p>
                  <div className="flex gap-3">
                    <label className="flex items-center text-gray-300 text-[13px] cursor-pointer">
                      <input type="radio" name="paymentMethod" checked={!useWalletForSubscription} onChange={() => setUseWalletForSubscription(false)} className="mr-2" />
                      💳 Card Payment
                    </label>
                    <label className="flex items-center text-gray-300 text-[13px] cursor-pointer">
                      <input type="radio" name="paymentMethod" checked={useWalletForSubscription} onChange={() => setUseWalletForSubscription(true)} className="mr-2" />
                      💰 Wallet (₦{(currentUser?.balance || 0).toLocaleString()})
                    </label>
                  </div>
                </div>
                <div className="mb-4">
                  <p className="text-gray-300 text-[13px] mb-2">Plans (₦ NGN):</p>
                  <div className="grid grid-cols-3 gap-2">
                    {subscriptionOptions.map(option => (
                      <button key={option.interval} onClick={() => { const plan = profileUser.premiumPlans?.find((p: any) => p.interval === option.interval.toLowerCase()); handleSubscribe({ ...(plan || option), amount: option.amount }) }} className="bg-purple-600 hover:bg-purple-700 p-3 rounded-md text-center transition cursor-pointer">
                        <p className="text-white font-semibold text-sm">{option.interval}</p>
                        <p className="text-orange-300 font-bold">₦{option.amount.toLocaleString()}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setSubscriptionReason(null); setShowSubscriptionModal(false) }} className="flex-1 py-2 rounded-md text-[14px] font-semibold bg-gray-600 text-white hover:bg-gray-700 transition">Cancel</button>
              {!currentUser && (
                <button onClick={() => { setShowSubscriptionModal(false); router.push('/login') }} className="flex-1 py-2 rounded-md text-[14px] font-semibold bg-orange-500 text-white hover:bg-orange-600 transition">Login to Subscribe</button>
              )}
            </div>
            {koraProcessing && <div className="mt-3 text-center text-gray-400 text-sm">Processing payment...</div>}
          </div>
        </div>
      )}

      {/* Premium Login Modal */}
      {showPremiumLoginModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-md max-w-[350px] w-full">
            <h3 className="text-white text-[16px] font-semibold mb-4 text-center">Login Required</h3>
            <p className="text-gray-300 text-[13px] mb-6 text-center">You need to log in to access premium features.</p>
            {subscriptionOptions.length > 0 && (
              <div className="bg-purple-900/30 p-3 rounded-md mb-4">
                <p className="text-purple-300 font-semibold mb-2 text-sm">Subscription Plans:</p>
                {subscriptionOptions.map(o => <p key={o.interval} className="text-white text-sm">{o.interval}: ₦{o.amount.toLocaleString()}</p>)}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowPremiumLoginModal(false)} className="flex-1 py-2 rounded-md text-[14px] font-semibold bg-gray-600 text-white hover:bg-gray-700 transition">Cancel</button>
              <button onClick={() => { setShowPremiumLoginModal(false); router.push('/login') }} className="flex-1 py-2 rounded-md text-[14px] font-semibold bg-orange-500 text-white hover:bg-orange-600 transition">Login</button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Premium Post Modal */}
      {selectedPremiumPost && (isSubscribed || isProfileOwner || currentUser?.isAdmin) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-md max-w-[400px] w-full">
            <h3 className="text-white text-[16px] font-semibold mb-2">Premium Content</h3>
            <p className="text-gray-300 text-[13px] mb-4">{selectedPremiumPost.text}</p>
            {selectedPremiumPost.images?.map((img: string, i: number) => <img key={i} src={img} alt="" className="w-full rounded-md mb-2" loading="lazy" />)}
            {selectedPremiumPost.videos?.map((vid: string, i: number) => <video key={i} src={vid} controls className="w-full rounded-md mb-2" />)}
            <button onClick={() => setSelectedPremiumPost(null)} className="w-full py-2 mt-2 rounded-md text-[14px] font-semibold bg-gray-600 text-white hover:bg-gray-700 transition">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

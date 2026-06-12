'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getMediaUrl } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'

const API_BASE = ''
const LEAKS_PER_PAGE = 12

const CATEGORIES = ['all', 'videos', 'photos', 'premium', 'free']

export default function LeakContentClient() {
  const router = useRouter()
  const { currentUser, isLoggedIn } = useAuth()

  const [leaks, setLeaks] = useState<any[]>([])
  const [displayedLeaks, setDisplayedLeaks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [purchasedLeaks, setPurchasedLeaks] = useState<Set<string>>(new Set())
  const [selectedLeak, setSelectedLeak] = useState<any>(null)
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false)
  const [userBalance, setUserBalance] = useState(0)
  const [visibleCount, setVisibleCount] = useState(LEAKS_PER_PAGE)

  const observerRef = useRef<HTMLDivElement>(null)
  const isMounted = useRef(true)
  useEffect(() => () => { isMounted.current = false }, [])

  // Fetch leaks with localStorage cache for instant repeat visits
  const fetchLeaks = useCallback(async () => {
    const token = localStorage.getItem('token')
    const cacheKey = `leaks_cache_${token ? 'auth' : 'guest'}`
    const cachedRaw = localStorage.getItem(cacheKey)
    const cachedTs = localStorage.getItem(`${cacheKey}_ts`)

    // Show cached data immediately — don't wait for network
    if (cachedRaw && cachedTs && Date.now() - parseInt(cachedTs) < 5 * 60 * 1000) {
      try {
        const cached = JSON.parse(cachedRaw)
        if (isMounted.current) { setLeaks(cached); setLoading(false) }
        return // Fresh enough — skip network fetch
      } catch {}
    }

    setLoading(true)
    try {
      const headers: any = {}; if (token) headers['Authorization'] = `Bearer ${token}`
      const endpoint = `${API_BASE}/api/auth/leaks?limit=100`
      const res = await fetch(endpoint, { headers })
      if (res.ok) {
        const d = await res.json()
        const all: any[] = Array.isArray(d) ? d : (d.leaks || [])
        if (isMounted.current) {
          setLeaks(all)
          localStorage.setItem(cacheKey, JSON.stringify(all))
          localStorage.setItem(`${cacheKey}_ts`, Date.now().toString())
        }
      } else { if (isMounted.current) setError('Failed to load leaks') }
    } catch (err: any) { if (isMounted.current) setError(err.message) }
    finally { if (isMounted.current) setLoading(false) }
  }, [])

  // Fetch purchased leaks + balance in parallel on mount
  useEffect(() => {
    if (!currentUser?.username) return
    const token = localStorage.getItem('token'); if (!token) return

    // Purchased leaks — with cache
    const pCacheKey = `purchased_leaks_${currentUser.username}`
    const pCached = localStorage.getItem(pCacheKey)
    const pTs = localStorage.getItem(`${pCacheKey}_ts`)
    if (pCached && pTs && Date.now() - parseInt(pTs) < 5 * 60 * 1000) {
      try { setPurchasedLeaks(new Set(JSON.parse(pCached))) } catch {}
    }

    const headers = { 'Authorization': `Bearer ${token}` }
    // Both requests in parallel
    Promise.all([
      fetch(`${API_BASE}/api/auth/leaks/purchased`, { headers }).catch(() => null),
      fetch(`${API_BASE}/api/auth/wallet/balance`, { headers }).catch(() => null),
    ]).then(async ([pRes, bRes]) => {
      if (!isMounted.current) return
      if (pRes?.ok) {
        const d = await pRes.json()
        const arr = d.purchasedLeaks || (Array.isArray(d) ? d : [])
        setPurchasedLeaks(new Set(arr))
        localStorage.setItem(pCacheKey, JSON.stringify(arr))
        localStorage.setItem(`${pCacheKey}_ts`, Date.now().toString())
      }
      if (bRes?.ok) {
        const d = await bRes.json()
        setUserBalance(d.balance || currentUser?.balance || 0)
      }
    }).catch(() => {})
  }, [currentUser])

  useEffect(() => { fetchLeaks() }, [fetchLeaks])

  // Filter/sort
  useEffect(() => {
    let filtered = [...leaks]
    if (searchTerm) { const q = searchTerm.toLowerCase(); filtered = filtered.filter(l => l.title?.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q)) }
    if (selectedCategory !== 'all') {
      if (selectedCategory === 'videos') filtered = filtered.filter(l => l.videos?.length > 0)
      else if (selectedCategory === 'photos') filtered = filtered.filter(l => l.images?.length > 0 && !l.videos?.length)
      else if (selectedCategory === 'premium') filtered = filtered.filter(l => l.isPremium)
      else if (selectedCategory === 'free') filtered = filtered.filter(l => l.isFree)
    }
    if (sortBy === 'newest') filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    else if (sortBy === 'price_asc') filtered.sort((a, b) => (a.price || 0) - (b.price || 0))
    else if (sortBy === 'price_desc') filtered.sort((a, b) => (b.price || 0) - (a.price || 0))
    else if (sortBy === 'popular') filtered.sort((a, b) => (b.views || 0) - (a.views || 0))
    setDisplayedLeaks(filtered.slice(0, visibleCount))
  }, [leaks, searchTerm, selectedCategory, sortBy, visibleCount])

  // Infinite scroll
  useEffect(() => {
    if (!observerRef.current) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && !loadingMore && displayedLeaks.length < leaks.length) {
        setLoadingMore(true)
        setTimeout(() => { setVisibleCount(p => p + LEAKS_PER_PAGE); setLoadingMore(false) }, 500)
      }
    }, { threshold: 0.1 })
    obs.observe(observerRef.current)
    return () => obs.disconnect()
  }, [displayedLeaks.length, leaks.length, loadingMore])

  const handlePurchase = useCallback(async () => {
    if (!selectedLeak) return
    if (!isLoggedIn) { router.push('/login'); return }
    if (userBalance < selectedLeak.price) { alert('Insufficient balance. Please top up your wallet.'); router.push('/payment'); return }
    const token = localStorage.getItem('token'); if (!token) return
    setIsProcessingPurchase(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/leaks/${selectedLeak.id}/purchase`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ leakId: selectedLeak.id }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Purchase failed') }
      const d = await res.json()
      setUserBalance(d.newBalance || userBalance - selectedLeak.price)
      setPurchasedLeaks(p => { const n = new Set(p); n.add(selectedLeak.id); const arr = [...n]; localStorage.setItem(`purchased_leaks_${currentUser?.username}`, JSON.stringify(arr)); localStorage.setItem(`purchased_leaks_${currentUser?.username}_ts`, Date.now().toString()); return n })
      setSelectedLeak(null)
      router.push(`/leak/${selectedLeak.id}`)
    } catch (err: any) { alert(err.message || 'Purchase failed') }
    finally { setIsProcessingPurchase(false) }
  }, [selectedLeak, isLoggedIn, userBalance, currentUser, router])

  const getThumbnailUrl = (leak: any) => {
    const thumb = leak.thumbnail || leak.thumbnailUrl || leak.thumbnail_url || (leak.videos?.[0]?.thumbnail)
    if (!thumb || thumb === 'null') return null
    return getMediaUrl(thumb)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white pb-20 pt-16">
        <div className="max-w-[600px] mx-auto px-4">
          <div className="h-8 bg-gray-800 rounded w-48 mb-6 animate-pulse" />
          <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i => <div key={i} className="bg-gray-800 rounded-xl overflow-hidden animate-pulse"><div className="aspect-[3/4] bg-gray-700" /><div className="p-3 space-y-2"><div className="h-3 bg-gray-700 rounded w-3/4" /><div className="h-3 bg-gray-700 rounded w-1/2" /></div></div>)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20 pt-16">
      <div className="max-w-[600px] mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">🔞 Exclusive Leaks</h1>
          {isLoggedIn && <p className="text-gray-400 text-sm">Balance: <span className="text-orange-400 font-bold">₦{userBalance.toLocaleString()}</span></p>}
        </div>

        {error && <div className="bg-red-900/50 border border-red-500 rounded-lg p-3 mb-4 text-red-300 text-sm">{error}</div>}

        {/* Search and filters */}
        <div className="mb-4 space-y-3">
          <input type="text" placeholder="Search leaks..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-4 py-2 rounded-xl bg-gray-900 text-white border border-gray-700 focus:outline-none focus:border-orange-500 text-sm" />
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap flex-shrink-0 font-medium transition-all ${selectedCategory === cat ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-gray-900 text-white border border-gray-700 focus:outline-none focus:border-orange-500 text-sm">
            <option value="newest">Newest First</option>
            <option value="popular">Most Viewed</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>

        {/* Leaks Grid */}
        {displayedLeaks.length === 0 ? (
          <div className="text-center py-16"><div className="text-5xl mb-4">🔞</div><p className="text-gray-400">No leaks found</p></div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {displayedLeaks.map(leak => {
              const isPurchased = purchasedLeaks.has(leak.id) || leak.isFree
              const thumbUrl = getThumbnailUrl(leak)
              return (
                <div key={leak.id} className="bg-gray-900 rounded-xl overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform active:scale-[0.98]" onClick={() => { if (isPurchased || leak.isFree) router.push(`/leak/${leak.id}`); else setSelectedLeak({ ...leak, userBalance }) }}>
                  <div className="relative aspect-[3/4] bg-linear-to-br from-purple-900 to-pink-900">
                    {thumbUrl ? <img src={thumbUrl} alt={leak.title} className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} /> : <div className="w-full h-full flex items-center justify-center text-4xl">🔞</div>}
                    <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                      {leak.isPremium && <span className="bg-linear-to-r from-purple-600 to-pink-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">PREMIUM</span>}
                      {leak.isFree && <span className="bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">FREE</span>}
                    </div>
                    {!leak.isFree && !isPurchased && leak.price > 0 && (
                      <div className="absolute top-2 right-2">
                        <span className="bg-linear-to-r from-orange-500 to-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">₦{leak.price?.toLocaleString()}</span>
                      </div>
                    )}
                    {isPurchased && !leak.isFree && <div className="absolute top-2 right-2"><span className="bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">OWNED</span></div>}
                    {leak.videoCount > 1 && <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-full">▶ {leak.videoCount} vids</div>}
                  </div>
                  <div className="p-2.5">
                    <h3 className="text-white font-bold text-xs truncate">{leak.title}</h3>
                    <p className="text-gray-400 text-[10px] truncate mt-0.5">{leak.description?.slice(0, 50) || ''}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-gray-500 text-[10px]">👁 {leak.views || 0}</span>
                      {leak.isFree || isPurchased ? (
                        <button className="px-2 py-0.5 bg-green-600 text-white rounded text-[10px] font-semibold" onClick={e => { e.stopPropagation(); router.push(`/leak/${leak.id}`) }}>Watch</button>
                      ) : (
                        <button className="px-2 py-0.5 bg-linear-to-r from-orange-500 to-red-500 text-white rounded text-[10px] font-semibold" onClick={e => { e.stopPropagation(); setSelectedLeak({ ...leak, userBalance }) }}>Buy ₦{leak.price?.toLocaleString()}</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Load more sentinel */}
        <div ref={observerRef} className="py-6 text-center">
          {loadingMore && <div className="flex items-center justify-center gap-2 text-gray-500 text-sm"><div className="animate-spin rounded-full h-5 w-5 border-2 border-orange-500 border-t-transparent" />Loading more...</div>}
          {!loadingMore && displayedLeaks.length >= leaks.length && leaks.length > 0 && <p className="text-gray-600 text-sm">All {leaks.length} leaks loaded</p>}
        </div>
      </div>

      {/* Purchase Modal */}
      {selectedLeak && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setSelectedLeak(null)}>
          <div className="bg-gray-800 rounded-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-linear-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🔒</div>
              <h3 className="text-white text-xl font-bold mb-2">Purchase Content</h3>
              <p className="text-gray-300 text-sm mb-4">Unlock "{selectedLeak.title?.slice(0, 30)}{selectedLeak.title?.length > 30 ? '...' : ''}" for <span className="text-orange-400 font-bold">₦{selectedLeak.price?.toLocaleString()}</span></p>
              <div className="bg-gray-700 rounded-lg p-4 mb-4">
                <div className="flex justify-between mb-2 text-sm"><span className="text-gray-400">Price</span><span className="text-white font-bold">₦{selectedLeak.price?.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">Your Balance</span><span className={`font-bold ${userBalance >= selectedLeak.price ? 'text-green-400' : 'text-red-400'}`}>₦{userBalance.toLocaleString()}</span></div>
              </div>
              {userBalance < selectedLeak.price && (
                <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 mb-4">
                  <p className="text-yellow-400 text-xs">⚠️ Insufficient balance. Please top up your wallet.</p>
                  <Link href="/payment" className="text-orange-400 text-xs hover:underline mt-1 inline-block">Go to Wallet →</Link>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSelectedLeak(null)} className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition">Cancel</button>
              <button onClick={handlePurchase} disabled={isProcessingPurchase || userBalance < selectedLeak.price} className="flex-1 py-3 bg-linear-to-r from-orange-500 to-red-500 text-white rounded-lg font-medium hover:from-orange-600 hover:to-red-600 transition disabled:opacity-50">
                {isProcessingPurchase ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Processing...</span> : 'Confirm Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

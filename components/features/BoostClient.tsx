'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

const API_BASE = ''
const KORA_PUBLIC_KEY = 'pk_live_d2iNTQyBXJVkaHmS2YkMUcg5WQzWfBs1cWJxg9zu'

const BOOST_DURATIONS = [
  { days: 1, price: 3000, label: 'Daily', popular: false, color: 'from-blue-500 to-blue-600', description: '24 hours of boosted visibility' },
  { days: 7, price: 7000, label: 'Weekly', popular: true, color: 'from-purple-500 to-pink-500', savings: '67%', description: 'Best value - 7 days of promotion' },
  { days: 30, price: 20000, label: 'Monthly', popular: false, color: 'from-green-500 to-teal-500', savings: '78%', description: '30 days maximum exposure' },
]

const TARGET_AUDIENCES = [
  { id: 'global', label: '🌍 Global', description: 'Reach users worldwide', multiplier: 1.0 },
  { id: 'country', label: '📍 Same Country', description: 'Reach users in your country', multiplier: 1.0 },
  { id: 'city', label: '🏙️ Same City', description: 'Focus on local audience', multiplier: 1.0 },
  { id: 'followers', label: '👥 Followers Only', description: 'Reach your followers first', multiplier: 1.0 },
]

export default function BoostClient() {
  const router = useRouter()
  const { currentUser, isLoggedIn } = useAuth()

  const [loading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [post, setPost] = useState<any>(null)
  const [selectedDuration, setSelectedDuration] = useState(BOOST_DURATIONS[1])
  const [targetAudience, setTargetAudience] = useState(TARGET_AUDIENCES[0])
  const [paymentMethod, setPaymentMethod] = useState('wallet')
  const [walletBalance, setWalletBalance] = useState(0)
  const [koraLoaded, setKoraLoaded] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [activeBoosts, setActiveBoosts] = useState<any[]>([])
  const [boostHistory, setBoostHistory] = useState<any[]>([])
  const [isWalletLoading, setIsWalletLoading] = useState(true)
  const isMounted = useRef(true)

  useEffect(() => () => { isMounted.current = false }, [])

  useEffect(() => {
    if (!isLoggedIn) { router.push('/login'); return }
  }, [isLoggedIn, router])

  // Load Kora SDK
  useEffect(() => {
    if ((window as any).Korapay?.initialize) { setKoraLoaded(true); return }
    const script = document.createElement('script')
    script.src = 'https://korablobstorage.blob.core.windows.net/modal-bucket/korapay-collections.min.js'
    script.async = true
    script.onload = () => { const iv = setInterval(() => { if ((window as any).Korapay?.initialize) { clearInterval(iv); setKoraLoaded(true) } }, 100) }
    document.body.appendChild(script)
    return () => { if (document.body.contains(script)) document.body.removeChild(script) }
  }, [])

  // Get post from localStorage
  useEffect(() => {
    const savedPost = localStorage.getItem('boost_post')
    if (savedPost) { try { setPost(JSON.parse(savedPost)) } catch {} }
    else setError('No post selected for boosting. Please go back and select a post.')
  }, [])

  useEffect(() => {
    if (currentUser?.username) { fetchWalletBalance(); fetchUserBoosts(); fetchBoostHistory() }
  }, [currentUser])

  const fetchWalletBalance = useCallback(async () => {
    setIsWalletLoading(true)
    const token = localStorage.getItem('token'); if (!token) { setIsWalletLoading(false); return }
    try {
      const res = await fetch(`${API_BASE}/api/auth/wallet/balance`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); if (isMounted.current) setWalletBalance(d.balance || currentUser?.balance || 0) }
      else if (isMounted.current) setWalletBalance(currentUser?.balance || 0)
    } catch {} finally { if (isMounted.current) setIsWalletLoading(false) }
  }, [currentUser])

  const fetchUserBoosts = useCallback(async () => {
    const token = localStorage.getItem('token'); if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/auth/boosts/active`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok && isMounted.current) { const d = await res.json(); setActiveBoosts(d.boosts || []) }
    } catch {}
  }, [])

  const fetchBoostHistory = useCallback(async () => {
    const token = localStorage.getItem('token'); if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/auth/boosts/history`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok && isMounted.current) { const d = await res.json(); setBoostHistory(d.history || []) }
    } catch {}
  }, [])

  const processWalletBoost = async () => {
    setProcessing(true); setError(null)
    const price = selectedDuration.price
    if (walletBalance < price) { setError(`Insufficient balance. Need ₦${price.toLocaleString()}, have ₦${walletBalance.toLocaleString()}.`); setProcessing(false); return }
    const token = localStorage.getItem('token'); if (!token) { setProcessing(false); return }
    try {
      const res = await fetch(`${API_BASE}/api/auth/boosts/create`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id || post._id, durationDays: selectedDuration.days, targetAudience: targetAudience.id, price, paymentMethod: 'wallet' }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Boost failed') }
      if (isMounted.current) {
        setSuccess(`Your post is now boosted for ${selectedDuration.label}!`); setShowPaymentModal(false)
        localStorage.removeItem('boost_post')
        // Background refresh — don't block redirect
        fetchWalletBalance(); fetchUserBoosts(); fetchBoostHistory()
        router.push('/')
      }
    } catch (err: any) { setError(err.message || 'Failed to boost') }
    finally { setProcessing(false) }
  }

  const processCardBoost = async () => {
    setProcessing(true); setError(null)
    const token = localStorage.getItem('token'); if (!token) { setProcessing(false); return }
    if (!(window as any).Korapay?.initialize) { setError('Payment service not ready. Please refresh.'); setProcessing(false); return }
    const price = selectedDuration.price
    const reference = `BOOST_${currentUser?.username}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_')
    const email = currentUser?.email || `${currentUser?.username}@example.com`
    const instance = (window as any).Korapay.initialize({
      key: KORA_PUBLIC_KEY, reference, amount: price, currency: 'NGN',
      customer: { name: currentUser?.name || currentUser?.username, email },
      metadata: { post_id: post?.id || post?._id, duration: selectedDuration.label, audience: targetAudience.id },
      onSuccess: async (data: any) => {
        instance?.close?.(); setProcessing(false)
        try {
          const res = await fetch(`${API_BASE}/api/auth/boosts/create`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId: post?.id || post?._id, durationDays: selectedDuration.days, targetAudience: targetAudience.id, price, paymentMethod: 'card', reference: data.transaction_id || reference }),
          })
          if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Boost failed') }
          setSuccess(`Boosted for ${selectedDuration.label}!`); setShowPaymentModal(false); localStorage.removeItem('boost_post')
          fetchUserBoosts(); fetchBoostHistory()
          router.push('/')
        } catch (err: any) { setError(err.message) }
      },
      onClose: () => setProcessing(false),
      onError: (err: any) => { setProcessing(false); instance?.close?.(); setError(err?.message || 'Payment failed') },
    })
    instance.setup()
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20 pt-16">
      <div className="max-w-[600px] mx-auto px-4">
        <h1 className="text-2xl font-bold mb-6">🚀 Boost Post</h1>

        {error && <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-4 text-red-300 text-sm">{error}</div>}
        {success && <div className="bg-green-900/50 border border-green-500 rounded-lg p-4 mb-4 text-green-300 text-sm">{success}</div>}

        {/* Post Preview */}
        {post ? (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-700 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center font-bold">{post.username?.[0]?.toUpperCase()}</div>
              <div><p className="text-white font-medium text-sm">@{post.username}</p><p className="text-gray-500 text-xs">{new Date(post.timestamp || post.createdAt || Date.now()).toLocaleDateString()}</p></div>
            </div>
            {post.text && <p className="text-gray-300 text-sm line-clamp-3 mb-2">{post.text}</p>}
            {post.images?.[0] && <img src={post.images[0]} alt="" className="w-full h-32 object-cover rounded-lg" />}
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl p-4 border border-dashed border-gray-600 mb-6 text-center text-gray-500 text-sm">No post selected. Please go back to a post and click Boost.</div>
        )}

        {/* Duration Selection */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Select Duration</h2>
          <div className="grid grid-cols-1 gap-3">
            {BOOST_DURATIONS.map(d => (
              <button key={d.days} onClick={() => setSelectedDuration(d)} className={`relative p-4 rounded-xl border-2 text-left transition-all ${selectedDuration.days === d.days ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 bg-gray-900 hover:border-gray-600'}`}>
                {d.popular && <span className="absolute top-2 right-2 bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">Most Popular</span>}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold">{d.label}</p>
                    <p className="text-gray-400 text-sm">{d.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-orange-400 font-bold text-lg">₦{d.price.toLocaleString()}</p>
                    {d.savings && <p className="text-green-400 text-xs">Save {d.savings}</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Target Audience */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Target Audience</h2>
          <div className="grid grid-cols-2 gap-2">
            {TARGET_AUDIENCES.map(a => (
              <button key={a.id} onClick={() => setTargetAudience(a)} className={`p-3 rounded-xl border-2 text-left transition-all ${targetAudience.id === a.id ? 'border-purple-500 bg-purple-500/10' : 'border-gray-700 bg-gray-900 hover:border-gray-600'}`}>
                <p className="text-white font-medium text-sm">{a.label}</p>
                <p className="text-gray-400 text-xs mt-0.5">{a.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-700 mb-6">
          <h3 className="text-white font-semibold mb-3">Boost Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Duration</span><span className="text-white">{selectedDuration.label} ({selectedDuration.days} day{selectedDuration.days > 1 ? 's' : ''})</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Audience</span><span className="text-white">{targetAudience.label}</span></div>
            <div className="flex justify-between font-bold border-t border-gray-700 pt-2 mt-2"><span className="text-white">Total</span><span className="text-orange-400">₦{selectedDuration.price.toLocaleString()}</span></div>
          </div>
        </div>

        {/* Wallet Balance */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-700 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-400 text-sm">Wallet Balance</p>
              <p className="text-white font-bold text-xl">{isWalletLoading ? '...' : `₦${walletBalance.toLocaleString()}`}</p>
            </div>
            <button onClick={fetchWalletBalance} className="text-gray-400 hover:text-white transition text-xs">🔄 Refresh</button>
          </div>
        </div>

        {/* Active Boosts */}
        {activeBoosts.length > 0 && (
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3">Active Boosts</h3>
            <div className="space-y-2">
              {activeBoosts.map((b: any, i: number) => (
                <div key={b.id || i} className="bg-gray-900 rounded-lg p-3 border border-green-800">
                  <div className="flex justify-between text-sm"><span className="text-white">{b.label || b.duration}</span><span className="text-green-400">Active</span></div>
                  <p className="text-gray-400 text-xs mt-1">Expires: {b.expiresAt ? new Date(b.expiresAt).toLocaleDateString() : 'N/A'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Boost Button */}
        <button onClick={() => { if (!post) { setError('No post selected'); return }; if (post.username !== currentUser?.username) { setError('You can only boost your own posts'); return }; setShowPaymentModal(true) }} className="w-full py-4 bg-linear-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl hover:from-orange-600 hover:to-red-600 transition-all text-lg disabled:opacity-50" disabled={!post || loading}>
          🚀 Boost Now — ₦{selectedDuration.price.toLocaleString()}
        </button>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-sm border border-gray-700">
            <h3 className="text-white font-bold text-lg mb-4">Choose Payment Method</h3>
            <div className="space-y-3 mb-6">
              <button onClick={() => setPaymentMethod('wallet')} className={`w-full p-4 rounded-xl border-2 text-left transition-all ${paymentMethod === 'wallet' ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 hover:border-gray-600'}`}>
                <p className="text-white font-medium">💰 Wallet Balance</p>
                <p className="text-gray-400 text-sm">Balance: ₦{walletBalance.toLocaleString()}</p>
                {walletBalance < selectedDuration.price && <p className="text-red-400 text-xs mt-1">Insufficient balance</p>}
              </button>
              <button onClick={() => setPaymentMethod('card')} className={`w-full p-4 rounded-xl border-2 text-left transition-all ${paymentMethod === 'card' ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 hover:border-gray-600'}`}>
                <p className="text-white font-medium">💳 Card Payment</p>
                <p className="text-gray-400 text-sm">Pay with debit/credit card via Kora</p>
              </button>
            </div>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowPaymentModal(false)} className="flex-1 py-3 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition">Cancel</button>
              <button onClick={paymentMethod === 'wallet' ? processWalletBoost : processCardBoost} disabled={processing || (paymentMethod === 'wallet' && walletBalance < selectedDuration.price) || (paymentMethod === 'card' && !koraLoaded)}
                className="flex-1 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition disabled:opacity-50 font-semibold">
                {processing ? 'Processing...' : `Pay ₦${selectedDuration.price.toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

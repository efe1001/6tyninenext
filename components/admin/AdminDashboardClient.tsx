'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const BlogManagementClient = dynamic(() => import('./BlogManagementClient'), { ssr: false })
const AdminLeakManagementClient = dynamic(() => import('./AdminLeakManagementClient'), { ssr: false })

const API_BASE_URL = ''

const BOOST_DURATIONS = [
  { days: 1, price: 3000, label: 'Daily', popular: false },
  { days: 7, price: 7000, label: 'Weekly', popular: true },
  { days: 30, price: 20000, label: 'Monthly', popular: false },
]

const TARGET_AUDIENCES = [
  { id: 'global', label: '🌍 Global' },
  { id: 'country', label: '📍 Same Country' },
  { id: 'city', label: '🏙️ Same City' },
  { id: 'followers', label: '👥 Followers Only' },
]

const MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'posts', label: 'Posts', icon: '📝' },
  { id: 'payouts', label: 'Payouts', icon: '💰' },
  { id: 'boosts', label: 'Boosts', icon: '🚀' },
  { id: 'activities', label: 'Activity Log', icon: '📋' },
  { id: 'leaks', label: 'Leak Content', icon: '🔒' },
  { id: 'blog', label: 'Blog', icon: '✍️' },
  { id: 'broadcast', label: 'Broadcast', icon: '📧' },
]

// ─── Types ────────────────────────────────────────────────────────────────────
interface AdminStats {
  totalUsers: number
  totalPosts: number
  pendingPayouts: number
  totalRevenue: number
  activeUsers: number
  newUsersToday: number
  totalSubscriptionEarnings: number
  totalSubscribers: number
  totalBlogPosts: number
}

interface User {
  id: string
  username: string
  email: string
  isVerified: boolean
  isActive: boolean
  userType: string
  walletBalance: number
  coinBalance: number
  followersCount: number
  followingCount: number
  totalSubscriptionEarnings: number
  incomingSubscriptions: any[]
  bankName?: string
  accountNumber?: string
  profilePic?: string
  bio?: string
  phoneNumber?: string
  numbersVisibility?: string
  subscriptionPrice?: number
  weeklySubscriptionPrice?: number
  yearlySubscriptionPrice?: number
  createdAt: string
}

interface Post {
  id: string
  uniqueId?: string
  username: string
  content: string
  images?: string[]
  videos?: string[]
  timestamp: string
  likes: number
  comments: number
  isPremium: boolean
  isBoosted: boolean
  views?: number
}

interface PayoutRequest {
  id: string
  username: string
  amount: number
  status: string
  createdAt: string
  adminNote: string
  bankName?: string
  accountNumber?: string
  updatedAt?: string | null
}

interface Boost {
  id: string
  username?: string
  postId?: string
  type: string
  durationDays: number
  status: string
  createdAt: string
  expiresAt: string
  price?: number
  targetAudience?: string
}

interface BoostStats {
  activeBoosts: number
  totalBoosts: number
  expiredBoosts: number
  cancelledBoosts: number
  totalRevenue: number
}

interface Activity {
  id: string
  type: string
  data: string
  timestamp: string
}

// ─── DashboardOverview ────────────────────────────────────────────────────────
function DashboardOverview({
  stats, totalUsers, allPosts, darkMode, onNavigate, boostStats, phoneCount, gmailCount,
  onFetchPhoneNumbers, onFetchGmailAddresses, onOpenBroadcast,
}: {
  stats: AdminStats; totalUsers: number; allPosts: Post[]; darkMode: boolean
  onNavigate: (s: string) => void; boostStats: BoostStats; phoneCount: number
  gmailCount: number; onFetchPhoneNumbers: () => void; onFetchGmailAddresses: () => void
  onOpenBroadcast: () => void
}) {
  const topStats = [
    { id: 1, title: 'Total Users', value: stats.totalUsers || totalUsers, icon: '👥', gradient: 'from-blue-500 to-cyan-500', desc: `${stats.activeUsers || 0} active`, nav: 'users' },
    { id: 2, title: 'Total Posts', value: allPosts.length, icon: '📝', gradient: 'from-green-500 to-emerald-500', desc: 'Content created', nav: 'posts' },
    { id: 3, title: 'Active Boosts', value: boostStats?.activeBoosts || 0, icon: '🚀', gradient: 'from-purple-500 to-pink-500', desc: 'Currently boosted', nav: 'boosts' },
    { id: 4, title: 'Pending Payouts', value: stats.pendingPayouts || 0, icon: '💰', gradient: 'from-yellow-500 to-orange-500', desc: 'Awaiting approval', nav: 'payouts' },
    { id: 5, title: 'Total Revenue', value: `₦${(stats.totalRevenue || 0).toLocaleString()}`, icon: '💳', gradient: 'from-indigo-500 to-blue-500', desc: 'Platform earnings' },
    { id: 6, title: 'New Today', value: stats.newUsersToday || 0, icon: '✨', gradient: 'from-teal-500 to-green-500', desc: 'New registrations' },
  ]

  return (
    <div className="space-y-4 pb-20">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {topStats.map(s => (
          <button
            key={s.id}
            onClick={() => s.nav && onNavigate(s.nav)}
            className={`bg-linear-to-br ${s.gradient} p-3 sm:p-4 rounded-xl shadow-lg text-left transition-transform active:scale-95`}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-white/80 text-xs sm:text-sm font-medium">{s.title}</p>
                <p className="text-xl sm:text-2xl font-bold text-white mt-0.5 break-words">{s.value}</p>
                <p className="text-white/60 text-[10px] sm:text-xs mt-1 truncate">{s.desc}</p>
              </div>
              <div className="bg-white/20 p-2 rounded-lg shrink-0 ml-2">
                <span className="text-xl sm:text-2xl">{s.icon}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className={`${darkMode ? 'bg-linear-to-r from-indigo-500/20 to-purple-500/20 border-indigo-500/30' : 'bg-white border-gray-200'} rounded-xl p-4 border`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">💰</span>
          <div>
            <h3 className="text-sm font-semibold text-white">Total Subscription Earnings</h3>
            <p className="text-2xl font-bold text-indigo-400">₦{(stats.totalSubscriptionEarnings || 0).toLocaleString()}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
          <span>Blog posts: {stats.totalBlogPosts || 0}</span>
          <span>Subscribers: {stats.totalSubscribers || 0}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button onClick={onFetchPhoneNumbers} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-3 text-center transition-colors">
          <span className="text-2xl block mb-1">📱</span>
          <p className="text-white text-xs font-medium">Phone Numbers</p>
          <p className="text-gray-400 text-[10px]">{phoneCount} found</p>
        </button>
        <button onClick={onFetchGmailAddresses} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-3 text-center transition-colors">
          <span className="text-2xl block mb-1">📧</span>
          <p className="text-white text-xs font-medium">Emails</p>
          <p className="text-gray-400 text-[10px]">{gmailCount} found</p>
        </button>
        <button onClick={onOpenBroadcast} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-3 text-center transition-colors">
          <span className="text-2xl block mb-1">📢</span>
          <p className="text-white text-xs font-medium">Broadcast</p>
          <p className="text-gray-400 text-[10px]">Send email</p>
        </button>
      </div>
    </div>
  )
}

// ─── UsersSection ─────────────────────────────────────────────────────────────
function UsersSection({
  users, searchTerm, setSearchTerm, onViewUser, onDeleteUser, onBoostUser, onAddFunds,
  onDownloadMedia, downloadProgress, totalUsers, darkMode, isLoading,
}: {
  users: User[]; searchTerm: string; setSearchTerm: (v: string) => void
  onViewUser: (u: string) => void; onDeleteUser: (u: string) => void
  onBoostUser: (u: string) => void; onAddFunds: (u: User) => void
  onDownloadMedia: (u: string) => void; downloadProgress: Record<string, any>
  totalUsers: number; darkMode: boolean; isLoading: boolean
}) {
  if (isLoading) return <div className="flex justify-center py-20"><div className="animate-spin h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent" /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Users ({totalUsers})</h2>
      </div>
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search users..."
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs border-b border-gray-700">
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left hidden sm:table-cell">Email</th>
              <th className="px-3 py-2 text-left hidden md:table-cell">Balance</th>
              <th className="px-3 py-2 text-left hidden lg:table-cell">Coins</th>
              <th className="px-3 py-2 text-left hidden lg:table-cell">Subs</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {users.map(user => {
              const prog = downloadProgress[user.username]
              return (
                <tr key={user.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs shrink-0">
                        {user.username?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white text-xs font-medium">@{user.username}</p>
                        <div className="flex gap-1 mt-0.5">
                          {user.isVerified && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1 rounded">✓</span>}
                          <span className="text-[9px] text-gray-500">{user.userType}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs hidden sm:table-cell">{user.email}</td>
                  <td className="px-3 py-2 text-green-400 text-xs hidden md:table-cell">₦{(user.walletBalance || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-yellow-400 text-xs hidden lg:table-cell">🪙 {(user.coinBalance || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-blue-400 text-xs hidden lg:table-cell">{user.incomingSubscriptions?.length || 0}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => onViewUser(user.username)} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-[10px] text-white transition-colors">View</button>
                      <button onClick={() => onBoostUser(user.username)} className="px-2 py-1 bg-linear-to-r from-orange-500 to-red-500 rounded text-[10px] text-white">🚀</button>
                      <button onClick={() => onAddFunds(user)} className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-[10px] text-white transition-colors">💰</button>
                      <button onClick={() => onDownloadMedia(user.username)} disabled={prog?.status === 'downloading'} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-[10px] text-white transition-colors">
                        {prog?.status === 'downloading' ? `${prog.progress}%` : '📥'}
                      </button>
                      <button onClick={() => { if (window.confirm(`Delete ${user.username}?`)) onDeleteUser(user.username) }} className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-[10px] text-white transition-colors">🗑️</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {users.length === 0 && !isLoading && (
          <p className="text-center text-gray-500 py-10">No users found</p>
        )}
      </div>
    </div>
  )
}

// ─── PostsSection ─────────────────────────────────────────────────────────────
function PostsSection({
  posts, searchTerm, setSearchTerm, onDelete, onBoost, darkMode, isLoading,
}: {
  posts: Post[]; searchTerm: string; setSearchTerm: (v: string) => void
  onDelete: (id: string) => void; onBoost: (post: Post) => void
  darkMode: boolean; isLoading: boolean
}) {
  if (isLoading) return <div className="flex justify-center py-20"><div className="animate-spin h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent" /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Posts ({posts.length})</h2>
      </div>
      <input
        type="text"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        placeholder="Search posts..."
        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
      />
      <div className="space-y-2">
        {posts.map(post => (
          <div key={post.uniqueId || post.id} className={`p-3 rounded-xl border transition-colors ${post.isPremium ? 'bg-yellow-900/20 border-yellow-600/30' : post.isBoosted ? 'bg-purple-900/20 border-purple-500/30' : 'bg-gray-800/50 border-gray-700'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-indigo-400 text-xs font-mono">@{post.username}</span>
                  {post.isPremium && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1 rounded">⭐ Premium</span>}
                  {post.isBoosted && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1 rounded">🚀 Boosted</span>}
                  <span className="text-[10px] text-gray-500">{new Date(post.timestamp).toLocaleDateString()}</span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed line-clamp-2">{post.content}</p>
                <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                  {post.images && post.images.length > 0 && <span>🖼️ {post.images.length}</span>}
                  {post.videos && post.videos.length > 0 && <span>🎥 {post.videos.length}</span>}
                  <span>❤️ {post.likes}</span>
                  <span>💬 {post.comments}</span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => onBoost(post)} className="px-2 py-1 bg-linear-to-r from-orange-500 to-red-500 rounded text-[10px] text-white">🚀</button>
                <button onClick={() => { if (window.confirm('Delete this post?')) onDelete(post.id) }} className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-[10px] text-white transition-colors">🗑️</button>
              </div>
            </div>
          </div>
        ))}
        {posts.length === 0 && !isLoading && <p className="text-center text-gray-500 py-10">No posts found</p>}
      </div>
    </div>
  )
}

// ─── PayoutsSection ───────────────────────────────────────────────────────────
function PayoutsSection({
  payouts, onApprove, onReject, isProcessing, darkMode,
}: {
  payouts: PayoutRequest[]; onApprove: (id: string) => void
  onReject: (id: string, reason: string) => void; isProcessing: boolean; darkMode: boolean
}) {
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({})

  const handleApprove = async (id: string) => {
    setProcessingId(id)
    await onApprove(id)
    setProcessingId(null)
  }

  const handleReject = async (id: string) => {
    const reason = rejectReason[id] || ''
    setProcessingId(id)
    await onReject(id, reason)
    setProcessingId(null)
    setRejectReason(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const pending = payouts.filter(p => p.status === 'pending')
  const others = payouts.filter(p => p.status !== 'pending')

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Payout Requests</h2>
      {pending.length > 0 && (
        <div>
          <h3 className="text-yellow-400 text-sm font-medium mb-2">⏳ Pending ({pending.length})</h3>
          <div className="space-y-2">
            {pending.map(req => (
              <div key={req.id} className="bg-gray-800 border border-yellow-600/30 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-white font-medium">@{req.username}</p>
                    <p className="text-2xl font-bold text-green-400">₦{req.amount?.toLocaleString()}</p>
                    <p className="text-gray-400 text-xs mt-1">{new Date(req.createdAt).toLocaleDateString()}</p>
                    {req.bankName && <p className="text-gray-400 text-xs">{req.bankName} • {req.accountNumber}</p>}
                  </div>
                  <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs">Pending</span>
                </div>
                <div className="mb-2">
                  <input
                    type="text"
                    placeholder="Rejection reason (optional)"
                    value={rejectReason[req.id] || ''}
                    onChange={e => setRejectReason(prev => ({ ...prev, [req.id]: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(req.id)}
                    disabled={processingId === req.id}
                    className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-white text-xs font-medium transition-colors"
                  >
                    {processingId === req.id ? '...' : '✓ Approve'}
                  </button>
                  <button
                    onClick={() => handleReject(req.id)}
                    disabled={processingId === req.id}
                    className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-white text-xs font-medium transition-colors"
                  >
                    {processingId === req.id ? '...' : '✗ Reject'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div>
          <h3 className="text-gray-400 text-sm font-medium mb-2">History ({others.length})</h3>
          <div className="space-y-2">
            {others.slice(0, 20).map(req => (
              <div key={req.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm">@{req.username}</p>
                    <p className="text-green-400 font-medium">₦{req.amount?.toLocaleString()}</p>
                    <p className="text-gray-500 text-xs">{new Date(req.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${req.status === 'approved' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {req.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                  </span>
                </div>
                {req.adminNote && <p className="text-gray-400 text-xs mt-1">Note: {req.adminNote}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {payouts.length === 0 && <p className="text-center text-gray-500 py-10">No payout requests</p>}
    </div>
  )
}

// ─── BoostsSection ────────────────────────────────────────────────────────────
function BoostsSection({
  boosts, boostStats, boostSearchTerm, setBoostSearchTerm, onUnboost, darkMode, isLoading, onRefresh,
}: {
  boosts: Boost[]; boostStats: BoostStats; boostSearchTerm: string
  setBoostSearchTerm: (v: string) => void; onUnboost: (id: string) => void
  darkMode: boolean; isLoading: boolean; onRefresh: () => void
}) {
  const getDurationLabel = (days: number) => days === 1 ? 'Daily' : days === 7 ? 'Weekly' : days === 30 ? 'Monthly' : `${days}d`

  const getStatusBadge = (status: string, expiresAt: string) => {
    if (status === 'active' && new Date(expiresAt) > new Date())
      return <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded-full text-xs">Active</span>
    if (status === 'cancelled')
      return <span className="px-2 py-0.5 bg-red-500/20 text-red-300 rounded-full text-xs">Cancelled</span>
    return <span className="px-2 py-0.5 bg-gray-500/20 text-gray-300 rounded-full text-xs">Expired</span>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active', value: boostStats.activeBoosts, icon: '🚀', col: 'from-green-500/20 to-emerald-500/20 border-green-500/30' },
          { label: 'Total', value: boostStats.totalBoosts, icon: '📊', col: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30' },
          { label: 'Expired', value: boostStats.expiredBoosts, icon: '⏰', col: 'from-yellow-500/20 to-orange-500/20 border-yellow-500/30' },
          { label: 'Revenue', value: `₦${(boostStats.totalRevenue || 0).toLocaleString()}`, icon: '💳', col: 'from-purple-500/20 to-pink-500/20 border-purple-500/30' },
        ].map(s => (
          <div key={s.label} className={`bg-linear-to-r ${s.col} rounded-xl p-3 border`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs">{s.label}</p>
                <p className="text-xl font-bold text-white">{s.value || 0}</p>
              </div>
              <span className="text-2xl">{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={boostSearchTerm}
          onChange={e => setBoostSearchTerm(e.target.value)}
          placeholder="Search boosts..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <button onClick={onRefresh} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-white text-sm transition-colors">
          🔄
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="animate-spin h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent" /></div>
      ) : (
        <div className="space-y-2">
          {boosts.map(boost => (
            <div key={boost.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {boost.username && <span className="text-indigo-400 text-xs font-mono">@{boost.username}</span>}
                    {boost.postId && <span className="text-gray-400 text-[10px]">Post #{boost.postId}</span>}
                    <span className="text-gray-500 text-[10px]">{getDurationLabel(boost.durationDays)}</span>
                    {getStatusBadge(boost.status, boost.expiresAt)}
                  </div>
                  <p className="text-gray-400 text-[10px] mt-1">
                    {new Date(boost.createdAt).toLocaleDateString()} → {new Date(boost.expiresAt).toLocaleDateString()}
                  </p>
                  {boost.targetAudience && <p className="text-gray-500 text-[10px]">Target: {boost.targetAudience}</p>}
                </div>
                {boost.status === 'active' && new Date(boost.expiresAt) > new Date() && (
                  <button
                    onClick={() => { if (window.confirm('Remove this boost?')) onUnboost(boost.id) }}
                    className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs text-white transition-colors shrink-0"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          {boosts.length === 0 && <p className="text-center text-gray-500 py-10">No boosts found</p>}
        </div>
      )}
    </div>
  )
}

// ─── ActivitiesSection ────────────────────────────────────────────────────────
function ActivitiesSection({
  activities, searchTerm, setSearchTerm, typeFilter, setTypeFilter, onRefresh, darkMode, isLoading,
}: {
  activities: Activity[]; searchTerm: string; setSearchTerm: (v: string) => void
  typeFilter: string; setTypeFilter: (v: string) => void
  onRefresh: () => void; darkMode: boolean; isLoading: boolean
}) {
  const getIcon = (type: string, data: any) => {
    const icons: Record<string, string> = {
      boost_created: '🚀', boost_removed: '🗑️🚀', boost_expired: '⏰🚀',
      post_deleted: '🗑️📝', post_edited: '✏️📝', post_created: '📝✨',
      premium_post_created: '⭐📝', user_updated: '👤✏️', user_deleted: '🗑️👤',
      user_registered: '👤✨', new_follower: '👥➕', payout_approved: '✅💰',
      payout_rejected: '❌💰', payout_requested: '📤💰', broadcast_sent: '📧📢',
      funds_added: '💰➕', subscription_created: '🔔👥', gift_sent: '🎁💝',
      payment_received: data?.status === 'failed' ? '❌💰' : '✅💰',
    }
    return icons[type] || '📋'
  }

  const getLabel = (type: string, data: any) => {
    const labels: Record<string, string> = {
      boost_created: 'Boost Created', boost_removed: 'Boost Removed', boost_expired: 'Boost Expired',
      post_deleted: 'Post Deleted', post_edited: 'Post Edited', post_created: 'Post Created',
      premium_post_created: 'Premium Post Created', user_updated: 'User Updated',
      user_deleted: 'User Deleted', user_registered: 'New User Registered',
      new_follower: 'New Follower', payout_approved: 'Payout Approved',
      payout_rejected: 'Payout Rejected', payout_requested: 'Payout Requested',
      broadcast_sent: 'Broadcast Sent', funds_added: 'Funds Added',
      subscription_created: 'Subscription Created', gift_sent: 'Gift Sent',
      payment_received: data?.status === 'failed' ? 'Payment Failed' : 'Payment Received',
    }
    return labels[type] || type
  }

  const typeOptions = [
    'all', 'boost_created', 'post_created', 'post_deleted', 'user_registered',
    'payout_approved', 'payout_rejected', 'subscription_created', 'payment_received', 'gift_sent',
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Activity Log</h2>
        <button onClick={onRefresh} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs transition-colors">
          🔄 Refresh
        </button>
      </div>
      <div className="flex gap-2 flex-col sm:flex-row">
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search activities..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
        >
          {typeOptions.map(t => (
            <option key={t} value={t}>{t === 'all' ? 'All Types' : getLabel(t, null)}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="animate-spin h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent" /></div>
      ) : (
        <div className="space-y-2">
          {activities.map(activity => {
            let actData: any = {}
            try { actData = JSON.parse(activity.data) } catch {}
            const isFailedPayment = activity.type === 'payment_received' && actData?.status === 'failed'
            return (
              <div key={activity.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">{getIcon(activity.type, actData)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={`font-semibold text-sm ${isFailedPayment || activity.type.includes('deleted') || activity.type.includes('rejected') ? 'text-red-400' : activity.type.includes('approved') || activity.type === 'payment_received' ? 'text-green-400' : 'text-white'}`}>
                        {getLabel(activity.type, actData)}
                      </span>
                      <span className="text-gray-500 text-[10px]">{new Date(activity.timestamp).toLocaleString()}</span>
                    </div>
                    {activity.type === 'payment_received' && actData.amount && (
                      <p className={`text-lg font-bold ${isFailedPayment ? 'text-red-400' : 'text-green-400'}`}>₦{actData.amount?.toLocaleString()}</p>
                    )}
                    {actData.username && <p className="text-gray-400 text-xs mt-0.5">@{actData.username}</p>}
                    {activity.type === 'subscription_created' && (
                      <p className="text-gray-400 text-xs mt-0.5">
                        @{actData.subscriber} → @{actData.creator} • {actData.planCode} • ₦{actData.amount?.toLocaleString()}
                      </p>
                    )}
                    {activity.type === 'gift_sent' && (
                      <p className="text-gray-400 text-xs mt-0.5">
                        @{actData.sender} → @{actData.recipient} • {actData.giftIcon} {actData.giftName} • {actData.price} coins
                      </p>
                    )}
                    {activity.type === 'boost_created' && (
                      <p className="text-gray-400 text-xs mt-0.5">
                        @{actData.username} • {actData.durationDays}d • {actData.targetAudience}
                      </p>
                    )}
                    {isFailedPayment && actData.failureReason && (
                      <p className="text-red-400 text-xs mt-1 bg-red-500/10 px-2 py-1 rounded">{actData.failureReason}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {activities.length === 0 && <p className="text-center text-gray-500 py-10">No activities found</p>}
        </div>
      )}
    </div>
  )
}

// ─── BroadcastSection ─────────────────────────────────────────────────────────
function BroadcastSection({
  gmailAddresses, subject, setSubject, message, setMessage,
  progress, isSending, isPaused, onSend, onPause, onResume, onStop, darkMode,
}: {
  gmailAddresses: any[]; subject: string; setSubject: (v: string) => void
  message: string; setMessage: (v: string) => void
  progress: { sent: number; total: number; failed: number; currentIndex: number }
  isSending: boolean; isPaused: boolean
  onSend: () => void; onPause: () => void; onResume: () => void; onStop: () => void
  darkMode: boolean
}) {
  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-semibold text-white">📧 Email Broadcast</h2>
      <div className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-green-400 font-medium text-sm">{gmailAddresses.length}</span>
          <span className="text-gray-400 text-sm">recipients loaded</span>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-gray-400 text-xs block mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              disabled={isSending}
              placeholder="Email subject..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              disabled={isSending}
              placeholder="Email body (supports markdown)..."
              rows={8}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50 resize-none"
            />
          </div>
        </div>
        {isSending && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
              <span>Sent: {progress.sent}/{progress.total}</span>
              <span>Failed: {progress.failed}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${progress.total ? (progress.sent / progress.total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex gap-2 mt-3">
              {!isPaused ? (
                <button onClick={onPause} className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-white text-sm font-medium transition-colors">
                  ⏸ Pause
                </button>
              ) : (
                <button onClick={onResume} className="flex-1 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm font-medium transition-colors">
                  ▶ Resume
                </button>
              )}
              <button onClick={onStop} className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white text-sm font-medium transition-colors">
                ⏹ Stop
              </button>
            </div>
          </div>
        )}
        {!isSending && (
          <button
            onClick={onSend}
            disabled={!subject.trim() || !message.trim() || gmailAddresses.length === 0}
            className="mt-4 w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg text-white font-medium text-sm transition-colors"
          >
            📤 Send to {gmailAddresses.length} recipients
          </button>
        )}
      </div>
    </div>
  )
}

// ─── UserDetailModal ──────────────────────────────────────────────────────────
function UserDetailModal({
  user, posts, isLoading, activeTab, setActiveTab, editForm, setEditForm,
  onSave, onClose, onBoostUser, onDeletePost, onAddFunds, darkMode,
}: {
  user: User | null; posts: Post[]; isLoading: boolean
  activeTab: string; setActiveTab: (v: string) => void
  editForm: Partial<User> | null; setEditForm: (v: any) => void
  onSave: () => void; onClose: () => void; onBoostUser: (u: string) => void
  onDeletePost: (id: string) => void; onAddFunds: (u: User) => void; darkMode: boolean
}) {
  if (!user && !isLoading) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <h2 className="text-lg font-bold text-white">{user ? `@${user.username}` : 'Loading...'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl p-1 transition-colors">✕</button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="animate-spin h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : user ? (
          <>
            <div className="flex border-b border-gray-700 px-4 shrink-0">
              {['profile', 'edit', 'posts', 'subscriptions'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'profile' && (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Email', value: user.email },
                      { label: 'Type', value: user.userType },
                      { label: 'Wallet', value: `₦${(user.walletBalance || 0).toLocaleString()}` },
                      { label: 'Coins', value: `🪙 ${(user.coinBalance || 0).toLocaleString()}` },
                      { label: 'Followers', value: user.followersCount },
                      { label: 'Following', value: user.followingCount },
                    ].map(item => (
                      <div key={item.label} className="bg-gray-700/50 rounded-lg p-2">
                        <p className="text-gray-400 text-[10px] mb-0.5">{item.label}</p>
                        <p className="text-white text-xs font-medium">{String(item.value ?? '—')}</p>
                      </div>
                    ))}
                  </div>
                  {user.bio && <div className="bg-gray-700/50 rounded-lg p-3"><p className="text-gray-400 text-[10px] mb-1">Bio</p><p className="text-gray-300 text-xs">{user.bio}</p></div>}
                  {user.bankName && <div className="bg-gray-700/50 rounded-lg p-2"><p className="text-gray-400 text-[10px] mb-0.5">Bank</p><p className="text-white text-xs">{user.bankName} • {user.accountNumber}</p></div>}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => onBoostUser(user.username)} className="flex-1 py-2 bg-linear-to-r from-orange-500 to-red-500 rounded-lg text-white text-sm font-medium">🚀 Boost</button>
                    <button onClick={() => onAddFunds(user)} className="flex-1 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm font-medium transition-colors">💰 Add Funds</button>
                  </div>
                </div>
              )}

              {activeTab === 'edit' && editForm && (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'email', label: 'Email', type: 'text' },
                      { key: 'bio', label: 'Bio', type: 'text' },
                      { key: 'walletBalance', label: 'Wallet Balance', type: 'number' },
                      { key: 'coinBalance', label: 'Coin Balance', type: 'number' },
                      { key: 'subscriptionPrice', label: 'Monthly Sub Price', type: 'number' },
                    ].map(field => (
                      <div key={field.key}>
                        <label className="text-gray-400 text-xs block mb-1">{field.label}</label>
                        <input
                          type={field.type}
                          value={(editForm as any)[field.key] || ''}
                          onChange={e => setEditForm((prev: any) => ({ ...prev, [field.key]: field.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    ))}
                    <div>
                      <label className="text-gray-400 text-xs block mb-1">User Type</label>
                      <select
                        value={(editForm as any).userType || 'content_creator'}
                        onChange={e => setEditForm((prev: any) => ({ ...prev, userType: e.target.value }))}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                      >
                        <option value="content_creator">Content Creator</option>
                        <option value="escort">Escort</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!(editForm as any).isVerified} onChange={e => setEditForm((prev: any) => ({ ...prev, isVerified: e.target.checked }))} className="text-indigo-600" />
                      <span className="text-gray-300 text-xs">Verified</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!(editForm as any).isActive} onChange={e => setEditForm((prev: any) => ({ ...prev, isActive: e.target.checked }))} className="text-indigo-600" />
                      <span className="text-gray-300 text-xs">Active</span>
                    </label>
                  </div>
                  <button onClick={onSave} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white text-sm font-medium transition-colors">
                    Save Changes
                  </button>
                </div>
              )}

              {activeTab === 'posts' && (
                <div className="space-y-2">
                  {posts.map(post => (
                    <div key={post.uniqueId || post.id} className="bg-gray-700/50 rounded-lg p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-300 text-xs line-clamp-2">{post.content}</p>
                          <p className="text-gray-500 text-[10px] mt-0.5">{new Date(post.timestamp).toLocaleDateString()} • {post.likes} likes</p>
                        </div>
                        <button onClick={() => { if (window.confirm('Delete post?')) onDeletePost(post.id) }} className="text-red-400 hover:text-red-300 text-xs shrink-0 transition-colors">🗑️</button>
                      </div>
                    </div>
                  ))}
                  {posts.length === 0 && <p className="text-center text-gray-500 py-6 text-sm">No posts</p>}
                </div>
              )}

              {activeTab === 'subscriptions' && (
                <div className="space-y-2">
                  <p className="text-gray-400 text-xs mb-2">Subscribers: {user.incomingSubscriptions?.length || 0}</p>
                  <p className="text-green-400 text-sm font-medium">Earnings: ₦{(user.totalSubscriptionEarnings || 0).toLocaleString()}</p>
                  {(user.incomingSubscriptions || []).slice(0, 20).map((sub: any, i: number) => (
                    <div key={i} className="bg-gray-700/50 rounded-lg p-2 text-xs">
                      <p className="text-white">@{sub.subscriber || sub.username}</p>
                      <p className="text-gray-400">{sub.planCode} • ₦{sub.amount}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ─── BoostCreationModal ───────────────────────────────────────────────────────
function BoostCreationModal({
  onClose, targetUsername, targetPostId, duration, setDuration, targetAudience, setTargetAudience, onCreate, isCreating, darkMode,
}: {
  onClose: () => void; targetUsername: string | null; targetPostId: string | null
  duration: number; setDuration: (v: number) => void
  targetAudience: string; setTargetAudience: (v: string) => void
  onCreate: () => void; isCreating: boolean; darkMode: boolean
}) {
  const selected = BOOST_DURATIONS.find(d => d.days === duration)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="bg-gray-800 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">🚀 Create Boost</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl p-1 transition-colors">✕</button>
        </div>
        <div className="p-4 space-y-4">
          {targetUsername && <p className="text-gray-300 text-sm">Boosting user: <span className="text-indigo-400 font-mono">@{targetUsername}</span></p>}
          {targetPostId && <p className="text-gray-300 text-sm">Boosting post: <span className="text-indigo-400 font-mono">#{targetPostId}</span></p>}

          <div>
            <label className="text-gray-400 text-xs block mb-2">Duration</label>
            <div className="grid grid-cols-3 gap-2">
              {BOOST_DURATIONS.map(d => (
                <button
                  key={d.days}
                  onClick={() => setDuration(d.days)}
                  className={`p-2 rounded-xl border text-center transition-colors ${duration === d.days ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'}`}
                >
                  <p className="font-bold text-sm">{d.label}</p>
                  <p className="text-xs opacity-80">₦{d.price.toLocaleString()}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-2">Target Audience</label>
            <select
              value={targetAudience}
              onChange={e => setTargetAudience(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              {TARGET_AUDIENCES.map(a => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3 text-sm">
              <p className="text-indigo-300">Cost: <span className="font-bold text-white">₦{selected.price.toLocaleString()}</span></p>
              <p className="text-gray-400 text-xs mt-0.5">Duration: {selected.days} day{selected.days > 1 ? 's' : ''}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm font-medium transition-colors">Cancel</button>
            <button
              onClick={onCreate}
              disabled={isCreating}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
            >
              {isCreating ? 'Creating...' : '🚀 Create Boost'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AddFundsModal ────────────────────────────────────────────────────────────
function AddFundsModal({ user, onAdd, onClose, darkMode }: { user: User; onAdd: (amount: number, reason: string) => void; onClose: () => void; darkMode: boolean }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt < 100) return
    setLoading(true)
    await onAdd(amt, reason || 'Admin funding')
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="bg-gray-800 rounded-2xl w-full max-w-sm border border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">💰 Add Funds</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl p-1 transition-colors">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-gray-300 text-sm">Adding to: <span className="text-indigo-400 font-mono">@{user.username}</span></p>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Amount (₦)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount" min="100" className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            <p className="text-gray-500 text-[10px] mt-1">Minimum: ₦100</p>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Reason (optional)</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason" className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm font-medium transition-colors">Cancel</button>
            <button onClick={handleSubmit} disabled={loading || !amount || parseFloat(amount) < 100} className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors">
              {loading ? 'Adding...' : `Add ₦${parseFloat(amount || '0').toLocaleString()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ errors, onClear }: { errors: { id: number; message: string; type: string }[]; onClear: (id: number) => void }) {
  if (errors.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm w-full">
      {errors.map(err => (
        <div key={err.id} className={`flex items-center gap-3 p-3 rounded-xl border shadow-lg ${err.type === 'success' ? 'bg-green-500/20 border-green-500/30 text-green-300' : err.type === 'info' ? 'bg-blue-500/20 border-blue-500/30 text-blue-300' : 'bg-red-500/20 border-red-500/30 text-red-300'}`}>
          <span className="shrink-0">{err.type === 'success' ? '✅' : err.type === 'info' ? 'ℹ️' : '⚠️'}</span>
          <span className="flex-1 text-xs font-medium">{err.message}</span>
          <button onClick={() => onClear(err.id)} className="shrink-0 text-current opacity-60 hover:opacity-100 transition-opacity">✕</button>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminDashboardClient() {
  const router = useRouter()

  // Auth
  const [isAdmin, setIsAdmin] = useState(false)
  const [isVerifying, setIsVerifying] = useState(true)

  // UI
  const [activeSection, setActiveSection] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [darkMode] = useState(true)
  const [errors, setErrors] = useState<{ id: number; message: string; type: string }[]>([])
  const errIdRef = useRef(0)

  // Data
  const [stats, setStats] = useState<AdminStats>({ totalUsers: 0, totalPosts: 0, pendingPayouts: 0, totalRevenue: 0, activeUsers: 0, newUsersToday: 0, totalSubscriptionEarnings: 0, totalSubscribers: 0, totalBlogPosts: 0 })
  const [users, setUsers] = useState<User[]>([])
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [allPosts, setAllPosts] = useState<Post[]>([])
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([])
  const [postSearchTerm, setPostSearchTerm] = useState('')
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([])
  const [boosts, setBoosts] = useState<Boost[]>([])
  const [filteredBoosts, setFilteredBoosts] = useState<Boost[]>([])
  const [boostSearchTerm, setBoostSearchTerm] = useState('')
  const [boostStats, setBoostStats] = useState<BoostStats>({ activeBoosts: 0, totalBoosts: 0, expiredBoosts: 0, cancelledBoosts: 0, totalRevenue: 0 })
  const [activities, setActivities] = useState<Activity[]>([])
  const [filteredActivities, setFilteredActivities] = useState<Activity[]>([])
  const [activitySearch, setActivitySearch] = useState('')
  const [activityTypeFilter, setActivityTypeFilter] = useState('all')

  // Modals
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [userPosts, setUserPosts] = useState<Post[]>([])
  const [showUserModal, setShowUserModal] = useState(false)
  const [isModalLoading, setIsModalLoading] = useState(false)
  const [activeUserTab, setActiveUserTab] = useState('profile')
  const [userEditForm, setUserEditForm] = useState<Partial<User> | null>(null)
  const [showBoostModal, setShowBoostModal] = useState(false)
  const [boostTargetUsername, setBoostTargetUsername] = useState<string | null>(null)
  const [boostTargetPost, setBoostTargetPost] = useState<Post | null>(null)
  const [boostDuration, setBoostDuration] = useState(7)
  const [boostTargetAudience, setBoostTargetAudience] = useState('global')
  const [isCreatingBoost, setIsCreatingBoost] = useState(false)
  const [showAddFundsModal, setShowAddFundsModal] = useState(false)
  const [fundsTargetUser, setFundsTargetUser] = useState<User | null>(null)

  // Broadcast & contacts
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([])
  const [gmailAddresses, setGmailAddresses] = useState<any[]>([])
  const [broadcastSubject, setBroadcastSubject] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [broadcastProgress, setBroadcastProgress] = useState({ sent: 0, total: 0, failed: 0, currentIndex: 0 })
  const broadcastPauseRef = useRef(false)
  const broadcastStopRef = useRef(false)

  // Download
  const [downloadProgress, setDownloadProgress] = useState<Record<string, any>>({})

  // Loading
  const [isLoading, setIsLoading] = useState(false)

  // ── Notifications ──────────────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'error') => {
    const id = ++errIdRef.current
    setErrors(prev => [...prev.slice(-4), { id, message, type }])
    setTimeout(() => setErrors(prev => prev.filter(e => e.id !== id)), 5000)
  }, [])

  const clearError = (id: number) => setErrors(prev => prev.filter(e => e.id !== id))

  // ── Activity Logging ───────────────────────────────────────────────────────
  const logActivity = useCallback(async (type: string, data: Record<string, any>) => {
    try {
      const token = localStorage.getItem('adminToken')
      await fetch(`${API_BASE_URL}/api/auth/admin/log-activity`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data }),
      })
      const stored = JSON.parse(localStorage.getItem('admin_activities') || '[]')
      stored.unshift({ id: Date.now(), type, data: JSON.stringify(data), timestamp: new Date().toISOString() })
      localStorage.setItem('admin_activities', JSON.stringify(stored.slice(0, 200)))
    } catch {}
  }, [])

  // ── Admin verification ─────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('adminToken')
      if (!token) { router.push('/admin/login'); return }

      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/admin/verify`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (res.ok) {
          setIsAdmin(true)
          await Promise.all([fetchStats(), fetchUsers(), fetchPayoutRequests(), fetchAllPosts(), fetchBoosts(), fetchActivities()])
        } else {
          router.push('/admin/login')
        }
      } catch {
        router.push('/admin/login')
      } finally {
        setIsVerifying(false)
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Filters ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = userSearchTerm.toLowerCase()
    setFilteredUsers(q ? users.filter(u => u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)) : users)
  }, [userSearchTerm, users])

  useEffect(() => {
    const q = postSearchTerm.toLowerCase()
    setFilteredPosts(q ? allPosts.filter(p => p.username?.toLowerCase().includes(q) || p.content?.toLowerCase().includes(q)) : allPosts)
  }, [postSearchTerm, allPosts])

  useEffect(() => {
    const q = boostSearchTerm.toLowerCase()
    setFilteredBoosts(q ? boosts.filter(b => b.username?.toLowerCase().includes(q)) : boosts)
  }, [boostSearchTerm, boosts])

  useEffect(() => {
    let filtered = activities
    if (activityTypeFilter !== 'all') filtered = filtered.filter(a => a.type === activityTypeFilter)
    if (activitySearch) {
      const q = activitySearch.toLowerCase()
      filtered = filtered.filter(a => a.type.includes(q) || a.data.toLowerCase().includes(q))
    }
    setFilteredActivities(filtered)
  }, [activitySearch, activityTypeFilter, activities])

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/stats`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) { const data = await res.json(); setStats(prev => ({ ...prev, ...data })) }
    } catch {}
  }

  const fetchUsers = async () => {
    try {
      setIsLoading(true)
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/users?limit=500`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        const userList = (data.users || data || []) as User[]
        setUsers(userList)
        setFilteredUsers(userList)
        setTotalUsers(data.total || userList.length)
      }
    } catch { addToast('Failed to fetch users') } finally { setIsLoading(false) }
  }

  const fetchAllPosts = useCallback(async (force = false) => {
    try {
      const token = localStorage.getItem('adminToken')
      const cacheKey = 'admin_posts_cache'
      const tsKey = 'admin_posts_ts'
      if (!force) {
        const cached = localStorage.getItem(cacheKey)
        const ts = localStorage.getItem(tsKey)
        if (cached && ts && Date.now() - parseInt(ts) < 30000) {
          const p = JSON.parse(cached)
          setAllPosts(p); setFilteredPosts(p); return
        }
      }
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/posts?limit=500`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        const posts = (data.posts || []).map((p: any, i: number) => ({ ...p, uniqueId: `p-${p.id}-${i}` }))
        setAllPosts(posts); setFilteredPosts(posts)
        localStorage.setItem(cacheKey, JSON.stringify(posts))
        localStorage.setItem(tsKey, Date.now().toString())
      }
    } catch { addToast('Failed to fetch posts') }
  }, [addToast])

  const fetchPayoutRequests = async () => {
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/payout-requests`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        const list = (data.requests || data || []).map((r: any) => ({
          id: String(r.id || r._id || ''),
          username: String(r.username || ''),
          amount: parseFloat(String(r.amount || '0')),
          status: String(r.status || 'pending').toLowerCase(),
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
          adminNote: String(r.adminNote || r.rejectionReason || ''),
          bankName: r.bankName,
          accountNumber: r.accountNumber,
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
        })) as PayoutRequest[]
        setPayoutRequests(list)
        setStats(prev => ({ ...prev, pendingPayouts: list.filter(r => r.status === 'pending').length }))
      }
    } catch { addToast('Failed to fetch payouts') }
  }

  const fetchBoosts = async () => {
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/boosts`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        const list = data.boosts || data || []
        setBoosts(list)
        setFilteredBoosts(list)
        const active = list.filter((b: Boost) => b.status === 'active' && new Date(b.expiresAt) > new Date()).length
        setBoostStats({
          activeBoosts: active,
          totalBoosts: list.length,
          expiredBoosts: list.filter((b: Boost) => b.status !== 'active').length,
          cancelledBoosts: list.filter((b: Boost) => b.status === 'cancelled').length,
          totalRevenue: list.reduce((sum: number, b: Boost) => sum + (b.price || 0), 0),
        })
      }
    } catch { addToast('Failed to fetch boosts') }
  }

  const fetchActivities = async () => {
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/activities?limit=200`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        const list = data.activities || data || []
        setActivities(list)
        setFilteredActivities(list)
      } else {
        const stored = JSON.parse(localStorage.getItem('admin_activities') || '[]')
        setActivities(stored); setFilteredActivities(stored)
      }
    } catch {
      const stored = JSON.parse(localStorage.getItem('admin_activities') || '[]')
      setActivities(stored); setFilteredActivities(stored)
    }
  }

  const fetchUserDetails = async (username: string) => {
    setIsModalLoading(true)
    setSelectedUser(null)
    setUserPosts([])
    setActiveUserTab('profile')
    setShowUserModal(true)
    try {
      const token = localStorage.getItem('adminToken')
      const [userRes, postsRes, subsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/auth/users/${encodeURIComponent(username)}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/api/auth/users/${encodeURIComponent(username)}/posts?limit=50`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/api/auth/admin/users/${encodeURIComponent(username)}/subscriptions`, { headers: { 'Authorization': `Bearer ${token}` } }),
      ])
      if (!userRes.ok) throw new Error('Failed to fetch user')
      const userData = await userRes.json()
      const postsData = postsRes.ok ? await postsRes.json() : { posts: [] }
      const subsData = subsRes.ok ? await subsRes.json() : {}
      const incomingSubs = subsData.subscriptions || []
      const totalEarnings = incomingSubs.reduce((sum: number, s: any) => sum + (s.amount || 0), 0)
      setSelectedUser({ ...userData, incomingSubscriptions: incomingSubs, totalSubscriptionEarnings: totalEarnings })
      setUserEditForm({ ...userData })
      setUserPosts((postsData.posts || []).map((p: any, i: number) => ({ ...p, uniqueId: `up-${p.id}-${i}` })))
    } catch (e: any) { addToast(e.message || 'Failed to load user') } finally { setIsModalLoading(false) }
  }

  const fetchAllPhoneNumbers = async () => {
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/users?limit=1000`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        const phones = (data.users || data || [])
          .filter((u: any) => u.phoneNumber)
          .map((u: any) => ({ username: u.username, phoneNumber: u.phoneNumber }))
        setPhoneNumbers(phones)
        addToast(`Found ${phones.length} phone numbers`, 'success')
      }
    } catch { addToast('Failed to fetch phone numbers') }
  }

  const fetchAllGmailAddresses = async () => {
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/users?limit=1000`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        const emails = (data.users || data || [])
          .filter((u: any) => u.email && u.email.includes('@'))
          .map((u: any) => ({ username: u.username, email: u.email, name: u.username }))
        setGmailAddresses(emails)
        addToast(`Found ${emails.length} email addresses`, 'success')
      }
    } catch { addToast('Failed to fetch emails') }
  }

  // ── Mutations ──────────────────────────────────────────────────────────────
  const handleDeleteUser = async (username: string) => {
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/users/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to delete user')
      await logActivity('user_deleted', { username })
      addToast(`Deleted user @${username}`, 'success')
      setUsers(prev => prev.filter(u => u.username !== username))
    } catch (e: any) { addToast(e.message || 'Failed to delete user') }
  }

  const handleSaveUser = async () => {
    if (!selectedUser || !userEditForm) return
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/users/${encodeURIComponent(selectedUser.username)}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(userEditForm),
      })
      if (!res.ok) throw new Error('Failed to update user')
      await logActivity('user_updated', { username: selectedUser.username })
      addToast(`Updated @${selectedUser.username}`, 'success')
      await fetchUsers()
      setShowUserModal(false)
    } catch (e: any) { addToast(e.message || 'Failed to update user') }
  }

  const handleDeletePost = async (postId: string) => {
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/posts/${postId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to delete post')
      await logActivity('post_deleted', { postId })
      addToast('Post deleted', 'success')
      setAllPosts(prev => prev.filter(p => p.id !== postId))
      setUserPosts(prev => prev.filter(p => p.id !== postId))
    } catch (e: any) { addToast(e.message || 'Failed to delete post') }
  }

  const handleApprovePayout = async (payoutId: string) => {
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/payout-requests/${payoutId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed') }
      await logActivity('payout_approved', { payoutId })
      addToast('Payout approved', 'success')
      await fetchPayoutRequests()
    } catch (e: any) { addToast(e.message || 'Failed to approve payout') }
  }

  const handleRejectPayout = async (payoutId: string, reason: string) => {
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/payout-requests/${payoutId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', adminNote: reason || 'Rejected by admin' }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed') }
      await logActivity('payout_rejected', { payoutId, reason })
      addToast('Payout rejected', 'info')
      await fetchPayoutRequests()
    } catch (e: any) { addToast(e.message || 'Failed to reject payout') }
  }

  const handleAddFunds = async (amount: number, reason: string) => {
    if (!fundsTargetUser) return
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/users/${encodeURIComponent(fundsTargetUser.username)}/add-funds`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed') }
      await logActivity('funds_added', { username: fundsTargetUser.username, amount, reason })
      addToast(`Added ₦${amount.toLocaleString()} to @${fundsTargetUser.username}`, 'success')
      await fetchUsers()
    } catch (e: any) { addToast(e.message || 'Failed to add funds') }
  }

  const handleAdminBoost = async () => {
    if (!boostTargetUsername && !boostTargetPost) return
    setIsCreatingBoost(true)
    try {
      const token = localStorage.getItem('adminToken')
      const body: any = { durationDays: boostDuration, targetAudience: boostTargetAudience }
      if (boostTargetUsername) body.username = boostTargetUsername
      if (boostTargetPost) body.postId = boostTargetPost.id
      const endpoint = boostTargetPost ? `/api/auth/admin/boosts/post` : `/api/auth/admin/boosts/user`
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to create boost') }
      await logActivity('boost_created', { username: boostTargetUsername, durationDays: boostDuration, targetAudience: boostTargetAudience })
      addToast('Boost created successfully', 'success')
      setShowBoostModal(false)
      setBoostTargetUsername(null)
      setBoostTargetPost(null)
      await fetchBoosts()
    } catch (e: any) { addToast(e.message || 'Failed to create boost') } finally { setIsCreatingBoost(false) }
  }

  const handleUnboost = async (boostId: string) => {
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/boosts/${boostId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to remove boost')
      await logActivity('boost_removed', { boostId })
      addToast('Boost removed', 'success')
      await fetchBoosts()
    } catch (e: any) { addToast(e.message || 'Failed to remove boost') }
  }

  const handleDownloadUserMedia = async (username: string) => {
    setDownloadProgress(prev => ({ ...prev, [username]: { status: 'downloading', progress: 0 } }))
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/users/${encodeURIComponent(username)}/posts?limit=1000`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) throw new Error('Failed to fetch posts')
      const data = await res.json()
      const mediaUrls: { url: string; postId: string; type: string }[] = []
      ;(data.posts || []).forEach((post: Post) => {
        post.images?.forEach(url => mediaUrls.push({ url, postId: post.id, type: 'image' }))
        post.videos?.forEach(url => mediaUrls.push({ url, postId: post.id, type: 'video' }))
      })
      if (mediaUrls.length === 0) { addToast(`No media for @${username}`, 'info'); return }

      let downloaded = 0
      const textContent = mediaUrls.map(m => m.url).join('\n')
      const blob = new Blob([textContent], { type: 'text/plain' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${username}_media_urls.txt`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
      addToast(`Exported ${mediaUrls.length} media URLs for @${username}`, 'success')
      downloaded = mediaUrls.length
      setDownloadProgress(prev => ({ ...prev, [username]: { status: 'completed', progress: 100 } }))
      setTimeout(() => setDownloadProgress(prev => { const n = { ...prev }; delete n[username]; return n }), 3000)
    } catch (e: any) {
      addToast(`Failed to export media: ${e.message}`)
      setDownloadProgress(prev => ({ ...prev, [username]: { status: 'error' } }))
    }
  }

  const handleSendBroadcast = async () => {
    if (!broadcastSubject.trim() || !broadcastMessage.trim()) { addToast('Subject and message are required'); return }
    if (gmailAddresses.length === 0) { addToast('No email addresses. Click "Emails" on the dashboard first.'); return }
    if (!window.confirm(`Send broadcast to ${gmailAddresses.length} users?`)) return

    setIsSendingBroadcast(true)
    setIsPaused(false)
    broadcastPauseRef.current = false
    broadcastStopRef.current = false
    setBroadcastProgress({ sent: 0, total: gmailAddresses.length, failed: 0, currentIndex: 0 })

    let sent = 0; let failed = 0
    const token = localStorage.getItem('adminToken')

    for (let i = 0; i < gmailAddresses.length; i++) {
      if (broadcastStopRef.current) break
      while (broadcastPauseRef.current) await new Promise(r => setTimeout(r, 500))

      const recipient = gmailAddresses[i]
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/admin/broadcast-email`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: recipient.email, subject: broadcastSubject, message: broadcastMessage, username: recipient.username }),
        })
        if (res.ok) sent++; else failed++
      } catch { failed++ }

      setBroadcastProgress({ sent, total: gmailAddresses.length, failed, currentIndex: i + 1 })
      await new Promise(r => setTimeout(r, 300))
    }

    setIsSendingBroadcast(false)
    await logActivity('broadcast_sent', { sent, failed, total: gmailAddresses.length, subject: broadcastSubject })
    addToast(`Broadcast complete: ${sent} sent, ${failed} failed`, sent > 0 ? 'success' : 'error')
  }

  const navigateToSection = (section: string) => setActiveSection(section)

  // ── Render guards ──────────────────────────────────────────────────────────
  if (isVerifying) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4" />
          <p className="text-gray-300 text-lg font-medium">Verifying Admin Access</p>
          <p className="text-gray-400 text-sm animate-pulse">Please wait...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">Access Denied</p>
          <button onClick={() => router.push('/admin/login')} className="px-6 py-2 bg-indigo-600 rounded-lg text-white">Back to Login</button>
        </div>
      </div>
    )
  }

  const menuCounts: Record<string, number | null> = {
    users: totalUsers,
    posts: allPosts.length,
    payouts: payoutRequests.filter(r => r.status === 'pending').length,
    boosts: boostStats.activeBoosts,
    activities: activities.length,
    dashboard: null, leaks: null, blog: null, broadcast: null,
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <Toast errors={errors} onClear={clearError} />

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-60 bg-gray-800/95 backdrop-blur-lg border-r border-gray-700/50 shadow-xl`}>
        <div className="flex items-center justify-between p-5 border-b border-gray-700/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-linear-to-r from-indigo-500 to-purple-600 rounded-xl">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold bg-linear-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">AdminHub</h1>
              <p className="text-gray-500 text-[10px]">Management Console</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {MENU_ITEMS.map(item => {
            const count = menuCounts[item.id]
            return (
              <button
                key={item.id}
                onClick={() => { navigateToSection(item.id); if (window.innerWidth < 1024) setSidebarOpen(false) }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all duration-200 ${activeSection === item.id ? 'bg-linear-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-400' : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'}`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                {count !== null && count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${activeSection === item.id ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="p-3 border-t border-gray-700/50 shrink-0">
          <button
            onClick={() => { localStorage.removeItem('adminToken'); router.push('/admin/login') }}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <span className="text-base">🚪</span>
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : ''}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-gray-900/95 backdrop-blur-lg border-b border-gray-700/50 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(v => !v)} className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors">
              <span className="text-lg">☰</span>
            </button>
            <h2 className="text-white font-semibold capitalize">{activeSection === 'dashboard' ? 'Dashboard Overview' : activeSection}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { if (activeSection === 'users') fetchUsers(); else if (activeSection === 'posts') fetchAllPosts(true); else if (activeSection === 'payouts') fetchPayoutRequests(); else if (activeSection === 'boosts') fetchBoosts(); else if (activeSection === 'activities') fetchActivities(); else fetchStats() }} className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors text-gray-400">
              🔄
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 overflow-auto">
          {activeSection === 'dashboard' && (
            <DashboardOverview
              stats={stats}
              totalUsers={totalUsers}
              allPosts={allPosts}
              darkMode={darkMode}
              onNavigate={navigateToSection}
              boostStats={boostStats}
              phoneCount={phoneNumbers.length}
              gmailCount={gmailAddresses.length}
              onFetchPhoneNumbers={fetchAllPhoneNumbers}
              onFetchGmailAddresses={fetchAllGmailAddresses}
              onOpenBroadcast={() => navigateToSection('broadcast')}
            />
          )}

          {activeSection === 'users' && (
            <UsersSection
              users={filteredUsers}
              searchTerm={userSearchTerm}
              setSearchTerm={setUserSearchTerm}
              onViewUser={fetchUserDetails}
              onDeleteUser={handleDeleteUser}
              onBoostUser={u => { setBoostTargetUsername(u); setBoostTargetPost(null); setShowBoostModal(true) }}
              onAddFunds={u => { setFundsTargetUser(u); setShowAddFundsModal(true) }}
              onDownloadMedia={handleDownloadUserMedia}
              downloadProgress={downloadProgress}
              totalUsers={totalUsers}
              darkMode={darkMode}
              isLoading={isLoading}
            />
          )}

          {activeSection === 'posts' && (
            <PostsSection
              posts={filteredPosts}
              searchTerm={postSearchTerm}
              setSearchTerm={setPostSearchTerm}
              onDelete={handleDeletePost}
              onBoost={p => { setBoostTargetPost(p); setBoostTargetUsername(null); setShowBoostModal(true) }}
              darkMode={darkMode}
              isLoading={isLoading}
            />
          )}

          {activeSection === 'payouts' && (
            <PayoutsSection
              payouts={payoutRequests}
              onApprove={handleApprovePayout}
              onReject={handleRejectPayout}
              isProcessing={isLoading}
              darkMode={darkMode}
            />
          )}

          {activeSection === 'boosts' && (
            <BoostsSection
              boosts={filteredBoosts}
              boostStats={boostStats}
              boostSearchTerm={boostSearchTerm}
              setBoostSearchTerm={setBoostSearchTerm}
              onUnboost={handleUnboost}
              onRefresh={fetchBoosts}
              darkMode={darkMode}
              isLoading={isLoading}
            />
          )}

          {activeSection === 'activities' && (
            <ActivitiesSection
              activities={filteredActivities}
              searchTerm={activitySearch}
              setSearchTerm={setActivitySearch}
              typeFilter={activityTypeFilter}
              setTypeFilter={setActivityTypeFilter}
              onRefresh={fetchActivities}
              darkMode={darkMode}
              isLoading={isLoading}
            />
          )}

          {activeSection === 'leaks' && <AdminLeakManagementClient />}
          {activeSection === 'blog' && <BlogManagementClient />}

          {activeSection === 'broadcast' && (
            <BroadcastSection
              gmailAddresses={gmailAddresses}
              subject={broadcastSubject}
              setSubject={setBroadcastSubject}
              message={broadcastMessage}
              setMessage={setBroadcastMessage}
              progress={broadcastProgress}
              isSending={isSendingBroadcast}
              isPaused={isPaused}
              onSend={handleSendBroadcast}
              onPause={() => { setIsPaused(true); broadcastPauseRef.current = true }}
              onResume={() => { setIsPaused(false); broadcastPauseRef.current = false }}
              onStop={() => { broadcastStopRef.current = true }}
              darkMode={darkMode}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      {showUserModal && (
        <UserDetailModal
          user={selectedUser}
          posts={userPosts}
          isLoading={isModalLoading}
          activeTab={activeUserTab}
          setActiveTab={setActiveUserTab}
          editForm={userEditForm}
          setEditForm={setUserEditForm}
          onSave={handleSaveUser}
          onClose={() => setShowUserModal(false)}
          onBoostUser={u => { setBoostTargetUsername(u); setBoostTargetPost(null); setShowUserModal(false); setShowBoostModal(true) }}
          onDeletePost={handleDeletePost}
          onAddFunds={u => { setFundsTargetUser(u); setShowAddFundsModal(true) }}
          darkMode={darkMode}
        />
      )}

      {showBoostModal && (
        <BoostCreationModal
          onClose={() => { setShowBoostModal(false); setBoostTargetUsername(null); setBoostTargetPost(null) }}
          targetUsername={boostTargetUsername}
          targetPostId={boostTargetPost?.id || null}
          duration={boostDuration}
          setDuration={setBoostDuration}
          targetAudience={boostTargetAudience}
          setTargetAudience={setBoostTargetAudience}
          onCreate={handleAdminBoost}
          isCreating={isCreatingBoost}
          darkMode={darkMode}
        />
      )}

      {showAddFundsModal && fundsTargetUser && (
        <AddFundsModal
          user={fundsTargetUser}
          onAdd={handleAddFunds}
          onClose={() => setShowAddFundsModal(false)}
          darkMode={darkMode}
        />
      )}
    </div>
  )
}

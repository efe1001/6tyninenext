'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getMediaUrl } from '@/lib/firebase'

const API_BASE_URL = ''
const LEAKS_PER_PAGE = 12

interface LeakVideo {
  url: string
  title?: string
  duration?: number
}

interface Leak {
  id: string
  title: string
  description: string
  price: number
  category: string
  tags: string[]
  thumbnail?: string
  thumbnailUrl?: string
  videos: LeakVideo[]
  isPremium: boolean
  isFree: boolean
  status: 'active' | 'inactive'
  views: number
  purchaseCount: number
  totalRevenue: number
  createdAt: string
}

interface LeakStats {
  totalLeaks: number
  freeLeaks: number
  paidLeaks: number
  totalRevenue: number
  totalPurchases: number
  totalViews: number
}

const EMPTY_FORM = {
  title: '',
  description: '',
  price: 0,
  category: 'exclusive' as string,
  tags: [] as string[],
  thumbnailUrl: '',
  videos: [] as LeakVideo[],
  isPremium: false,
  isFree: false,
}

const CATEGORIES = ['exclusive', 'celebrity', 'amateur', 'premium', 'featured', 'new']

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(price)
}

// ─── LeakFormModal ─────────────────────────────────────────────────────────────
function LeakFormModal({
  leak, onClose, onSave, isSaving,
}: {
  leak: Leak | null; onClose: () => void; onSave: (data: typeof EMPTY_FORM) => void; isSaving: boolean
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [tagInput, setTagInput] = useState('')
  const [videoUrlInput, setVideoUrlInput] = useState('')
  const [activeTab, setActiveTab] = useState<'basic' | 'media' | 'pricing'>('basic')

  useEffect(() => {
    if (leak) {
      setForm({
        title: leak.title || '',
        description: leak.description || '',
        price: leak.price || 0,
        category: leak.category || 'exclusive',
        tags: leak.tags || [],
        thumbnailUrl: leak.thumbnail || leak.thumbnailUrl || '',
        videos: leak.videos || [],
        isPremium: leak.isPremium || false,
        isFree: leak.isFree || false,
      })
      setTagInput((leak.tags || []).join(', '))
    } else {
      setForm({ ...EMPTY_FORM })
      setTagInput('')
    }
  }, [leak])

  const handleAddVideoUrl = () => {
    const url = videoUrlInput.trim()
    if (!url) return
    setForm(prev => ({ ...prev, videos: [...prev.videos, { url, title: `Video ${prev.videos.length + 1}` }] }))
    setVideoUrlInput('')
  }

  const handleRemoveVideo = (index: number) => {
    setForm(prev => ({ ...prev, videos: prev.videos.filter((_, i) => i !== index) }))
  }

  const handleTagsChange = (value: string) => {
    setTagInput(value)
    setForm(prev => ({
      ...prev,
      tags: value.split(',').map(t => t.trim()).filter(t => t.length > 0),
    }))
  }

  const handleSubmit = () => {
    if (!form.title.trim()) return
    onSave(form)
  }

  const tabs = ['basic', 'media', 'pricing'] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <h3 className="text-lg font-bold text-white">{leak ? 'Edit Leak' : 'New Leak'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl p-1 transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 px-4 shrink-0">
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Leak title..." className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={4} placeholder="Describe the content..." className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                  {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
            </div>
          )}

          {activeTab === 'media' && (
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Thumbnail URL</label>
                <input type="url" value={form.thumbnailUrl} onChange={e => setForm(p => ({ ...p, thumbnailUrl: e.target.value }))} placeholder="https://..." className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                {form.thumbnailUrl && (
                  <div className="mt-2 w-32 h-20 rounded-lg overflow-hidden border border-gray-700">
                    <img src={getMediaUrl(form.thumbnailUrl)} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-2">Videos ({form.videos.length})</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="url"
                    value={videoUrlInput}
                    onChange={e => setVideoUrlInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddVideoUrl())}
                    placeholder="Paste video URL..."
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                  <button onClick={handleAddVideoUrl} className="px-3 py-2 bg-orange-600 hover:bg-orange-700 rounded-xl text-white text-sm transition-colors">Add</button>
                </div>
                <div className="space-y-2">
                  {form.videos.map((v, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                      <span className="text-gray-400 text-xs">🎬</span>
                      <span className="text-gray-300 text-xs flex-1 truncate">{v.url}</span>
                      <button onClick={() => handleRemoveVideo(i)} className="text-red-400 hover:text-red-300 text-xs transition-colors">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pricing' && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.isFree} onChange={e => { setForm(p => ({ ...p, isFree: e.target.checked, price: e.target.checked ? 0 : p.price })) }} className="text-green-500" />
                  <span className="text-gray-300 text-sm">🎁 Free Content</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.isPremium} onChange={e => setForm(p => ({ ...p, isPremium: e.target.checked }))} className="text-purple-500" />
                  <span className="text-gray-300 text-sm">💎 Premium</span>
                </label>
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Price (₦)</label>
                <input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={e => setForm(p => ({ ...p, price: parseInt(e.target.value) || 0 }))}
                  disabled={form.isFree}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
                />
                {form.isFree && <p className="text-green-400 text-[10px] mt-1">✓ Free — accessible to everyone</p>}
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Tags (comma separated)</label>
                <input type="text" value={tagInput} onChange={e => handleTagsChange(e.target.value)} placeholder="celebrity, exclusive, hd" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                {form.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {form.tags.map(t => (
                      <span key={t} className="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">#{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-gray-700 shrink-0">
          <button onClick={onClose} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-white text-sm font-medium transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={isSaving || !form.title.trim()} className="flex-1 py-2 bg-linear-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 rounded-xl text-white text-sm font-medium transition-colors">
            {isSaving ? 'Saving...' : leak ? 'Update Leak' : 'Publish Leak'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AdminLeakManagementClient() {
  const [leaks, setLeaks] = useState<Leak[]>([])
  const [filtered, setFiltered] = useState<Leak[]>([])
  const [displayed, setDisplayed] = useState<Leak[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [visibleCount, setVisibleCount] = useState(LEAKS_PER_PAGE)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedLeak, setSelectedLeak] = useState<Leak | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [stats, setStats] = useState<LeakStats>({ totalLeaks: 0, freeLeaks: 0, paidLeaks: 0, totalRevenue: 0, totalPurchases: 0, totalViews: 0 })
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const observerTarget = useRef<HTMLDivElement>(null)
  const observerInstance = useRef<IntersectionObserver | null>(null)
  const isMounted = useRef(true)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchLeaks = useCallback(async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/leaks?limit=500`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      const list: Leak[] = data.leaks || []
      if (!isMounted.current) return
      setLeaks(list)
      setFiltered(list)
      setDisplayed(list.slice(0, LEAKS_PER_PAGE))
      setVisibleCount(LEAKS_PER_PAGE)
      setStats({
        totalLeaks: list.length,
        freeLeaks: list.filter(l => l.isFree).length,
        paidLeaks: list.filter(l => !l.isFree).length,
        totalRevenue: list.reduce((s, l) => s + (l.totalRevenue || 0), 0),
        totalPurchases: list.reduce((s, l) => s + (l.purchaseCount || 0), 0),
        totalViews: list.reduce((s, l) => s + (l.views || 0), 0),
      })
    } catch (e: any) { showToast(e.message || 'Failed to load', 'error') } finally { if (isMounted.current) setLoading(false) }
  }, [])

  useEffect(() => {
    isMounted.current = true
    fetchLeaks()
    return () => { isMounted.current = false }
  }, [fetchLeaks])

  useEffect(() => {
    let result = [...leaks]
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      result = result.filter(l => l.title?.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q) || l.tags?.some(t => t.toLowerCase().includes(q)))
    }
    if (statusFilter !== 'all') result = result.filter(l => l.status === statusFilter)
    setFiltered(result)
    setVisibleCount(LEAKS_PER_PAGE)
    setDisplayed(result.slice(0, LEAKS_PER_PAGE))
  }, [leaks, searchTerm, statusFilter])

  const loadMore = useCallback(() => {
    if (loadingMore || visibleCount >= filtered.length) return
    setLoadingMore(true)
    const next = Math.min(visibleCount + LEAKS_PER_PAGE, filtered.length)
    setTimeout(() => {
      if (isMounted.current) {
        setDisplayed(prev => [...prev, ...filtered.slice(visibleCount, next)])
        setVisibleCount(next)
        setLoadingMore(false)
      }
    }, 300)
  }, [loadingMore, visibleCount, filtered])

  useEffect(() => {
    if (loading) return
    observerInstance.current?.disconnect()
    observerInstance.current = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting && !loadingMore && visibleCount < filtered.length) loadMore() },
      { threshold: 0.1, rootMargin: '100px' }
    )
    if (observerTarget.current) observerInstance.current.observe(observerTarget.current)
    return () => observerInstance.current?.disconnect()
  }, [loading, filtered.length, loadingMore, visibleCount, loadMore])

  const handleSaveLeak = async (formData: typeof EMPTY_FORM) => {
    setIsSaving(true)
    try {
      const token = localStorage.getItem('adminToken')
      const url = selectedLeak
        ? `${API_BASE_URL}/api/auth/admin/leaks/${selectedLeak.id}`
        : `${API_BASE_URL}/api/auth/admin/leaks`
      const res = await fetch(url, {
        method: selectedLeak ? 'PUT' : 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to save') }
      showToast(selectedLeak ? 'Leak updated!' : 'Leak published!', 'success')
      setShowModal(false)
      setSelectedLeak(null)
      await fetchLeaks()
    } catch (e: any) { showToast(e.message || 'Failed to save', 'error') } finally { setIsSaving(false) }
  }

  const handleDeleteLeak = async (id: string) => {
    if (!window.confirm('Delete this leak? All videos and purchase records will be permanently lost.')) return
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/leaks/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to delete')
      showToast('Leak deleted', 'success')
      await fetchLeaks()
    } catch (e: any) { showToast(e.message || 'Failed to delete', 'error') }
  }

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/leaks/${id}/status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setLeaks(prev => prev.map(l => l.id === id ? { ...l, status: newStatus as 'active' | 'inactive' } : l))
    } catch (e: any) { showToast(e.message, 'error') }
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold bg-linear-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">🔞 Leak Vault</h2>
          <p className="text-gray-400 text-xs mt-0.5">Manage exclusive content & monetization</p>
        </div>
        <button onClick={() => { setSelectedLeak(null); setShowModal(true) }} className="px-4 py-2 bg-linear-to-r from-orange-500 to-red-500 rounded-xl text-white text-sm font-medium transition-opacity hover:opacity-90">
          + New Leak
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { label: 'Total', value: stats.totalLeaks, color: 'text-white' },
          { label: 'Free', value: stats.freeLeaks, color: 'text-green-400' },
          { label: 'Paid', value: stats.paidLeaks, color: 'text-orange-400' },
          { label: 'Revenue', value: formatPrice(stats.totalRevenue), color: 'text-yellow-400' },
          { label: 'Sales', value: stats.totalPurchases, color: 'text-blue-400' },
          { label: 'Views', value: stats.totalViews, color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-800/50 border border-gray-700 rounded-xl p-2 text-center">
            <p className={`text-sm font-bold ${s.color}`}>{s.value ?? 0}</p>
            <p className="text-gray-500 text-[10px]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search leaks..."
          className="flex-1 min-w-40 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div className="flex border border-gray-700 rounded-xl overflow-hidden">
          <button onClick={() => setViewMode('grid')} className={`px-3 py-2 text-sm transition-colors ${viewMode === 'grid' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>⊞</button>
          <button onClick={() => setViewMode('list')} className={`px-3 py-2 text-sm transition-colors ${viewMode === 'list' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>☰</button>
        </div>
      </div>

      {/* Leaks */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin h-10 w-10 rounded-full border-2 border-orange-500 border-t-transparent" /></div>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {displayed.map(leak => (
                <div key={leak.id} className="group bg-gray-800/50 border border-gray-700 rounded-2xl overflow-hidden hover:border-orange-500/50 transition-all duration-200">
                  <div className="relative h-28 overflow-hidden">
                    {leak.thumbnail || leak.thumbnailUrl ? (
                      <img src={getMediaUrl(leak.thumbnail || leak.thumbnailUrl || '')} alt={leak.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full bg-linear-to-br from-purple-900 to-pink-900 flex items-center justify-center">
                        <span className="text-3xl">🔞</span>
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${leak.status === 'active' ? 'bg-green-500/80 text-white' : 'bg-red-500/80 text-white'}`}>
                        {leak.status}
                      </span>
                    </div>
                    {leak.isFree && <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-green-500/80 text-white rounded-full text-[10px] font-medium">FREE</span>}
                  </div>
                  <div className="p-2">
                    <h3 className="text-white text-xs font-semibold line-clamp-1 mb-1">{leak.title}</h3>
                    <p className="text-orange-400 text-xs font-medium">{leak.isFree ? 'Free' : formatPrice(leak.price)}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                      <span>🎬 {leak.videos?.length || 0}</span>
                      <span>👁️ {leak.views || 0}</span>
                      <span>🛒 {leak.purchaseCount || 0}</span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      <button onClick={() => handleToggleStatus(leak.id, leak.status)} className={`flex-1 py-1 rounded text-[10px] font-medium transition-colors ${leak.status === 'active' ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}>
                        {leak.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => { setSelectedLeak(leak); setShowModal(true) }} className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30 transition-colors">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDeleteLeak(leak.id)} className="px-2 py-1 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {displayed.map(leak => (
                <div key={leak.id} className="flex items-center justify-between p-3 bg-gray-800/50 border border-gray-700 rounded-xl hover:border-orange-500/30 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-12 h-10 rounded-lg overflow-hidden shrink-0">
                      {leak.thumbnail || leak.thumbnailUrl ? (
                        <img src={getMediaUrl(leak.thumbnail || leak.thumbnailUrl || '')} alt={leak.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-linear-to-br from-purple-900 to-pink-900 flex items-center justify-center"><span className="text-sm">🔞</span></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white text-sm font-medium truncate">{leak.title}</h3>
                        {leak.isFree ? <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 rounded-full">FREE</span> : <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 rounded-full">{formatPrice(leak.price)}</span>}
                        <span className={`text-[10px] px-1.5 rounded-full ${leak.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{leak.status}</span>
                      </div>
                      <p className="text-gray-400 text-xs truncate">{leak.description}</p>
                      <div className="flex gap-3 mt-0.5 text-[10px] text-gray-500">
                        <span>🎬 {leak.videos?.length || 0}</span>
                        <span>👁️ {leak.views || 0}</span>
                        <span>🛒 {leak.purchaseCount || 0}</span>
                        <span className="text-green-400">{formatPrice(leak.totalRevenue || 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <button onClick={() => handleToggleStatus(leak.id, leak.status)} className={`px-2 py-1 rounded text-[10px] transition-colors ${leak.status === 'active' ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}>
                      {leak.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => { setSelectedLeak(leak); setShowModal(true) }} className="p-1.5 bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => handleDeleteLeak(leak.id)} className="p-1.5 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={observerTarget} className="py-2 flex justify-center">
            {loadingMore && <div className="animate-spin h-6 w-6 rounded-full border-2 border-orange-500 border-t-transparent" />}
          </div>

          {displayed.length === 0 && !loading && (
            <div className="text-center py-16">
              <p className="text-gray-500 text-4xl mb-3">🔞</p>
              <p className="text-gray-400">No leaks found</p>
              <button onClick={() => { setSelectedLeak(null); setShowModal(true) }} className="mt-4 px-4 py-2 bg-linear-to-r from-orange-500 to-red-500 rounded-xl text-white text-sm font-medium">
                Add your first leak
              </button>
            </div>
          )}
        </>
      )}

      {/* Form Modal */}
      {showModal && (
        <LeakFormModal
          leak={selectedLeak}
          onClose={() => { setShowModal(false); setSelectedLeak(null) }}
          onSave={handleSaveLeak}
          isSaving={isSaving}
        />
      )}
    </div>
  )
}

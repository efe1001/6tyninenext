'use client'

import { useState, useEffect, useCallback } from 'react'

const API_BASE_URL = ''

interface BlogPost {
  id: string
  title: string
  content: string
  excerpt: string
  author: string
  category: string
  tags: string[]
  featuredImage: string
  isPublished: boolean
  isFeatured: boolean
  readTime: number
  views: number
  likes: number
  createdAt: string
  updatedAt: string
  metaTitle?: string
  metaDescription?: string
}

interface BlogStats {
  totalPosts: number
  publishedPosts: number
  featuredPosts: number
  totalViews: number
  totalLikes: number
}

const EMPTY_FORM = {
  title: '',
  content: '',
  excerpt: '',
  category: 'announcements',
  tags: [] as string[],
  featuredImage: '',
  isPublished: true,
  isFeatured: false,
  readTime: 5,
  metaTitle: '',
  metaDescription: '',
}

const CATEGORIES = ['announcements', 'tutorials', 'updates', 'creator-tips', 'platform-news', 'safety', 'features', 'community']

export default function BlogManagementClient() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [filtered, setFiltered] = useState<BlogPost[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<BlogStats>({ totalPosts: 0, publishedPosts: 0, featuredPosts: 0, totalViews: 0, totalLikes: 0 })
  const [showModal, setShowModal] = useState(false)
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [isSaving, setIsSaving] = useState(false)
  const [tagsInput, setTagsInput] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchPosts = useCallback(async () => {
    try {
      setIsLoading(true)
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/blog/posts?limit=1000`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      const list: BlogPost[] = data.blogPosts || data.posts || []
      setPosts(list)
      setFiltered(list)
      setStats(data.stats || {
        totalPosts: list.length,
        publishedPosts: list.filter(p => p.isPublished).length,
        featuredPosts: list.filter(p => p.isFeatured).length,
        totalViews: list.reduce((s, p) => s + (p.views || 0), 0),
        totalLikes: list.reduce((s, p) => s + (p.likes || 0), 0),
      })
    } catch (e: any) { showToast(e.message || 'Failed to load posts', 'error') } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  useEffect(() => {
    if (!searchTerm.trim()) { setFiltered(posts); return }
    const q = searchTerm.toLowerCase()
    setFiltered(posts.filter(p =>
      p.title?.toLowerCase().includes(q) ||
      p.content?.toLowerCase().includes(q) ||
      p.author?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.tags?.some(t => t.toLowerCase().includes(q))
    ))
  }, [searchTerm, posts])

  const openCreate = () => {
    setEditingPost(null)
    setForm({ ...EMPTY_FORM })
    setTagsInput('')
    setShowModal(true)
  }

  const openEdit = (post: BlogPost) => {
    setEditingPost(post)
    setForm({
      title: post.title || '',
      content: post.content || '',
      excerpt: post.excerpt || '',
      category: post.category || 'announcements',
      tags: post.tags || [],
      featuredImage: post.featuredImage || '',
      isPublished: post.isPublished ?? true,
      isFeatured: post.isFeatured ?? false,
      readTime: post.readTime || 5,
      metaTitle: post.metaTitle || '',
      metaDescription: post.metaDescription || '',
    })
    setTagsInput((post.tags || []).join(', '))
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.content.trim()) { showToast('Title and content are required', 'error'); return }
    setIsSaving(true)
    try {
      const token = localStorage.getItem('adminToken')
      const url = editingPost
        ? `${API_BASE_URL}/api/auth/admin/blog/posts/${editingPost.id}`
        : `${API_BASE_URL}/api/auth/admin/blog/posts`
      const res = await fetch(url, {
        method: editingPost ? 'PUT' : 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to save') }
      showToast(editingPost ? 'Post updated!' : 'Post created!', 'success')
      setShowModal(false)
      await fetchPosts()
    } catch (e: any) { showToast(e.message || 'Failed to save', 'error') } finally { setIsSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this blog post?')) return
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/blog/posts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to delete')
      showToast('Post deleted', 'success')
      await fetchPosts()
    } catch (e: any) { showToast(e.message || 'Failed to delete', 'error') }
  }

  const handleTogglePublish = async (post: BlogPost) => {
    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/blog/posts/${post.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...post, isPublished: !post.isPublished }),
      })
      if (!res.ok) throw new Error('Failed to update')
      await fetchPosts()
    } catch (e: any) { showToast(e.message, 'error') }
  }

  const handleTagsInputChange = (value: string) => {
    setTagsInput(value)
    setForm(prev => ({
      ...prev,
      tags: value.split(',').map(t => t.trim()).filter(t => t.length > 0),
    }))
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
          <h2 className="text-xl font-bold text-white">✍️ Blog Management</h2>
          <p className="text-gray-400 text-xs mt-0.5">{stats.totalPosts} posts • {stats.publishedPosts} published</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white text-sm font-medium transition-colors">
          + New Post
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Posts', value: stats.totalPosts, color: 'text-blue-400' },
          { label: 'Published', value: stats.publishedPosts, color: 'text-green-400' },
          { label: 'Featured', value: stats.featuredPosts, color: 'text-yellow-400' },
          { label: 'Views', value: stats.totalViews?.toLocaleString(), color: 'text-purple-400' },
          { label: 'Likes', value: stats.totalLikes?.toLocaleString(), color: 'text-pink-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value ?? 0}</p>
            <p className="text-gray-400 text-[10px] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        placeholder="Search posts..."
        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
      />

      {/* Posts list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(post => (
            <div key={post.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-white font-medium text-sm line-clamp-1">{post.title}</h3>
                    {post.isFeatured && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 rounded-full">Featured</span>}
                    <span className={`text-[10px] px-1.5 rounded-full ${post.isPublished ? 'bg-green-500/20 text-green-400' : 'bg-gray-600/50 text-gray-400'}`}>
                      {post.isPublished ? 'Published' : 'Draft'}
                    </span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 rounded-full capitalize">{post.category}</span>
                  </div>
                  <p className="text-gray-400 text-xs line-clamp-2">{post.excerpt || post.content?.substring(0, 100)}</p>
                  <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                    <span>👁️ {post.views || 0}</span>
                    <span>❤️ {post.likes || 0}</span>
                    <span>⏱️ {post.readTime || 5} min</span>
                    <span>{post.updatedAt ? new Date(post.updatedAt).toLocaleDateString() : ''}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => handleTogglePublish(post)} className={`px-2 py-1 rounded text-[10px] transition-colors ${post.isPublished ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}>
                    {post.isPublished ? 'Unpublish' : 'Publish'}
                  </button>
                  <button onClick={() => openEdit(post)} className="p-1.5 bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => handleDelete(post.id)} className="p-1.5 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && !isLoading && (
            <div className="text-center py-16">
              <p className="text-gray-500">No posts found</p>
              <button onClick={openCreate} className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white text-sm font-medium transition-colors">
                Create your first post
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
              <h3 className="text-lg font-bold text-white">{editingPost ? 'Edit Post' : 'New Blog Post'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white text-xl p-1 transition-colors">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required placeholder="Post title" className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                  {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Excerpt</label>
                <textarea value={form.excerpt} onChange={e => setForm(p => ({ ...p, excerpt: e.target.value }))} rows={2} placeholder="Short description..." className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Content *</label>
                <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} rows={10} required placeholder="Post content (supports markdown)..." className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Featured Image URL</label>
                <input type="url" value={form.featuredImage} onChange={e => setForm(p => ({ ...p, featuredImage: e.target.value }))} placeholder="https://..." className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Tags (comma separated)</label>
                <input type="text" value={tagsInput} onChange={e => handleTagsInputChange(e.target.value)} placeholder="tag1, tag2, tag3" className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                {form.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {form.tags.map(t => <span key={t} className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">#{t}</span>)}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Read Time (min)</label>
                  <input type="number" min="1" max="60" value={form.readTime} onChange={e => setForm(p => ({ ...p, readTime: parseInt(e.target.value) || 5 }))} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex flex-col gap-2 pt-5">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.isPublished} onChange={e => setForm(p => ({ ...p, isPublished: e.target.checked }))} className="text-indigo-600" />
                    <span className="text-gray-300 text-sm">Published</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.isFeatured} onChange={e => setForm(p => ({ ...p, isFeatured: e.target.checked }))} className="text-indigo-600" />
                    <span className="text-gray-300 text-sm">Featured</span>
                  </label>
                </div>
              </div>
            </form>
            <div className="flex gap-2 p-4 border-t border-gray-700 shrink-0">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-white text-sm font-medium transition-colors">Cancel</button>
              <button onClick={handleSubmit as any} disabled={isSaving} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl text-white text-sm font-medium transition-colors">
                {isSaving ? 'Saving...' : editingPost ? 'Update Post' : 'Create Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

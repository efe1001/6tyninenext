'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginClient() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Invalid credentials')
      const { token } = await res.json()
      localStorage.setItem('adminToken', token)
      document.cookie = `admin_token=${token}; path=/; SameSite=Strict; max-age=${60 * 60 * 8}`
      router.push('/admin/dashboard')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1C2526] flex items-center justify-center p-4">
      <div className="w-full max-w-87.5">
        <h1 className="text-white text-2xl font-bold text-center mb-6">Admin Login</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Admin Email"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            required
            className="w-full px-4 py-3 bg-gray-800 text-white rounded-xl border border-gray-700 focus:border-orange-500 outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            required
            className="w-full px-4 py-3 bg-gray-800 text-white rounded-xl border border-gray-700 focus:border-orange-500 outline-none"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-linear-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Admin Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

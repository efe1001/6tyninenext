'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminRegisterClient() {
  const router = useRouter()
  const [form, setForm] = useState({ username: '', password: '', secretKey: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/admin/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Registration failed')
      router.push('/admin/login')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1C2526] flex items-center justify-center p-4">
      <div className="w-full max-w-87.5">
        <h1 className="text-white text-2xl font-bold text-center mb-6">Admin Register</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="Username" value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })} required
            className="w-full px-4 py-3 bg-gray-800 text-white rounded-xl border border-gray-700 outline-none" />
          <input type="password" placeholder="Password" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} required
            className="w-full px-4 py-3 bg-gray-800 text-white rounded-xl border border-gray-700 outline-none" />
          <input type="password" placeholder="Admin Secret Key" value={form.secretKey}
            onChange={e => setForm({ ...form, secretKey: e.target.value })} required
            className="w-full px-4 py-3 bg-gray-800 text-white rounded-xl border border-gray-700 outline-none" />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-linear-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold disabled:opacity-50">
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  )
}

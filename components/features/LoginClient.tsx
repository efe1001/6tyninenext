'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GoogleLogin } from '@react-oauth/google'
import { jwtDecode } from 'jwt-decode'
import { useAuth } from '@/context/AuthContext'

export default function LoginClient() {
  const { login, loginWithToken } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState<{ type: string; text: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail.trim()) {
      setError('Please enter your email address')
      return
    }
    setResetLoading(true)
    setError(null)
    setResetMessage(null)
    try {
      const response = await fetch(`/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Failed to send reset email')
      setResetMessage({ type: 'success', text: data.message || 'Password reset email sent! Check your inbox.' })
      setTimeout(() => {
        setShowForgotPassword(false)
        setResetEmail('')
        setResetMessage(null)
      }, 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setResetLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse: any) => {
    if (googleLoading) return
    setGoogleLoading(true)
    setError(null)
    try {
      const { credential } = credentialResponse
      jwtDecode(credential) // validate token
      const response = await fetch(`/api/auth/google/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: credential }),
      })
      if (!response.ok) throw new Error('Google sign-in failed')
      const data = await response.json()
      if (data?.token) {
        loginWithToken(data.token)
      } else {
        throw new Error('Invalid response from server')
      }
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.')
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleGoogleError = () => {
    setError('Google sign-in failed. Please try again or use email login.')
    setGoogleLoading(false)
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-600 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-orange-600 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-8 shadow-2xl">
          {/* Logo/Header */}
          <div className="text-center mb-8">
            <div className="inline-block">
              <div className="flex items-center justify-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-linear-to-r from-orange-500 to-red-500 rounded-2xl flex items-center justify-center shadow-lg transform rotate-12">
                  <span className="text-2xl">6</span>
                </div>
                <div className="w-12 h-12 bg-linear-to-r from-pink-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-12">
                  <span className="text-2xl">9</span>
                </div>
              </div>
              <h2 className="text-3xl font-bold bg-linear-to-r from-orange-500 via-red-500 to-pink-500 bg-clip-text text-transparent">
                Welcome Back
              </h2>
              <p className="text-gray-400 mt-2">Sign in to continue to 6tyNine</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl animate-shake">
              <p className="text-red-400 text-center text-sm">{error}</p>
            </div>
          )}

          {resetMessage?.type === 'success' && (
            <div className="mb-6 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
              <p className="text-green-400 text-center text-sm">{resetMessage.text}</p>
            </div>
          )}

          {/* Google Sign-In */}
          <div className="mb-6">
            <div className="flex justify-center">
              {googleLoading ? (
                <div className="w-full px-6 py-3 bg-gray-700 rounded-xl flex items-center justify-center gap-3">
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-white">Processing Google Sign-In...</span>
                </div>
              ) : (
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  useOneTap={false}
                  theme="filled_black"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  logo_alignment="center"
                  width="300"
                />
              )}
            </div>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-800/40 text-gray-400">Or continue with email</span>
              </div>
            </div>
          </div>

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">📧</div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-10 pr-4 py-3 bg-gray-900/50 rounded-xl border-2 border-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 text-white placeholder-gray-500 transition-all"
                  disabled={loading || googleLoading}
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">🔒</div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-4 py-3 bg-gray-900/50 rounded-xl border-2 border-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 text-white placeholder-gray-500 transition-all"
                  disabled={loading || googleLoading}
                />
              </div>
            </div>
            <div className="text-right">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-orange-500 hover:text-orange-400 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
            <button
              type="submit"
              className="w-full px-6 py-3 bg-linear-to-r from-orange-500 to-red-500 rounded-xl text-white font-semibold hover:shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || googleLoading}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Logging in...
                </div>
              ) : 'Login'}
            </button>
          </form>

          <div className="mt-6 text-center space-y-3">
            <p className="text-gray-400">
              Don't have an account?{' '}
              <Link href="/register" className="text-orange-500 hover:text-orange-400 font-semibold transition-colors">
                Create Account
              </Link>
            </p>
            <p className="text-gray-500 text-xs">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 w-full max-w-md shadow-2xl animate-fadeIn">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-linear-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔐</span>
              </div>
              <h3 className="text-xl font-bold text-white">Reset Your Password</h3>
              <p className="text-gray-400 text-sm mt-2">
                Enter your email address and we'll send you a link to reset your password.
              </p>
            </div>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 bg-gray-900/50 rounded-xl border-2 border-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 text-white placeholder-gray-500 transition-all"
                  disabled={resetLoading}
                  required
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setResetEmail(''); setResetMessage(null); setError(null) }}
                  className="flex-1 px-4 py-3 bg-gray-700 rounded-xl text-white font-semibold hover:bg-gray-600 transition-all"
                  disabled={resetLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-linear-to-r from-orange-500 to-red-500 rounded-xl text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                  disabled={resetLoading}
                >
                  {resetLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Sending...
                    </div>
                  ) : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-blob { animation: blob 7s infinite; }
        .animate-shake { animation: shake 0.3s ease-in-out; }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
      `}</style>
    </div>
  )
}

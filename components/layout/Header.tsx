'use client'

import Link from 'next/link'
import { FaHome, FaUser, FaSync } from 'react-icons/fa'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'

export function Header() {
  const { isLoggedIn, currentUser, logout } = useAuth()
  const router = useRouter()

  return (
    <header className="fixed top-0 left-0 w-full bg-[#0f1219] text-white z-40 border-b border-gray-800/60" style={{ height: 52 }}>
      <div className="h-full flex items-center justify-between px-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-lg font-bold text-white tracking-tight hover:text-orange-400 transition-colors">
            6tynine
          </Link>
          <Link href="/" className="text-gray-400 hover:text-orange-400 transition-colors" aria-label="Home">
            <FaHome size={16} />
          </Link>
        </div>

        <nav className="flex items-center gap-2">
          <button
            onClick={() => router.refresh()}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
            type="button"
          >
            <FaSync size={11} />
            Refresh
          </button>

          {isLoggedIn ? (
            <>
              {currentUser?.username && (
                <Link
                  href={`/profile/${currentUser.username}`}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md text-xs border border-gray-700 transition-colors"
                >
                  <FaUser size={11} />
                  <span>{currentUser.username}</span>
                </Link>
              )}
              <button
                onClick={logout}
                className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-semibold transition-colors"
                type="button"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-semibold transition-colors"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="px-3 py-1.5 text-gray-300 hover:text-white text-xs font-medium transition-colors"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

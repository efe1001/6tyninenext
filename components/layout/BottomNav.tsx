'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FaFire, FaRocket, FaPlus, FaRegCommentDots,
  FaCreditCard, FaUserCircle, FaSignInAlt, FaUserPlus,
} from 'react-icons/fa'
import { useAuth } from '@/context/AuthContext'
import dynamic from 'next/dynamic'

const UploadPosts = dynamic(() => import('@/components/features/UploadPosts'), { ssr: false })

interface Props {
  hideOnAuth?: boolean
}

export function BottomNav({ hideOnAuth = false }: Props) {
  const pathname = usePathname()
  const { isLoggedIn, currentUser } = useAuth()
  const [showUploadModal, setShowUploadModal] = useState(false)

  const isAuthPage = pathname === '/login' || pathname === '/register'
  if (hideOnAuth && isAuthPage) return null

  const active = (path: string) => pathname === path || pathname.startsWith(path + '/')
  const displayBalance = (currentUser?.balance as number | undefined) ?? 0

  return (
    <>
      <nav
        className="fixed left-0 w-full h-16 bg-gray-900 text-white border-t border-gray-700 shadow-2xl pb-[env(safe-area-inset-bottom)]"
        style={{ bottom: 0, zIndex: 1000 }}
        aria-label="Main navigation"
      >
        <div className="h-full flex items-center justify-center max-w-[350px] mx-auto px-4">
          {isLoggedIn ? (
            <>
              <Link href="/" className="flex flex-col items-center text-xs p-2 flex-1 group" aria-label="Home">
                <FaFire size={20} className={active('/') && pathname === '/' ? 'text-orange-500' : 'text-gray-400 group-hover:text-orange-400'} />
                <span className={`text-[11px] mt-1 ${pathname === '/' ? 'text-orange-400' : 'text-gray-400 group-hover:text-orange-400'}`}>Home</span>
              </Link>

              <Link href="/explore" className="flex flex-col items-center text-xs p-2 flex-1 group" aria-label="Explore">
                <FaRocket size={20} className={active('/explore') ? 'text-purple-500' : 'text-gray-400 group-hover:text-purple-400'} />
                <span className={`text-[11px] mt-1 ${active('/explore') ? 'text-purple-400' : 'text-gray-400 group-hover:text-purple-400'}`}>Explore</span>
              </Link>

              <div className="relative -top-6 mx-2">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="w-14 h-14 bg-linear-to-r from-orange-500 to-red-500 text-white rounded-full shadow-2xl flex items-center justify-center hover:from-orange-600 hover:to-red-600 transform hover:scale-110 transition-all duration-300"
                  aria-label="Create Post"
                >
                  <FaPlus size={24} />
                </button>
              </div>

              <Link href="/chat" className="flex flex-col items-center text-xs p-2 flex-1 group" aria-label="Chats">
                <FaRegCommentDots size={20} className={active('/chat') ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-400'} />
                <span className={`text-[11px] mt-1 ${active('/chat') ? 'text-blue-400' : 'text-gray-400 group-hover:text-blue-400'}`}>Chats</span>
              </Link>

              <Link href="/payment" className="flex flex-col items-center text-xs p-2 flex-1 group" aria-label="Wallet">
                <FaCreditCard size={20} className={active('/payment') ? 'text-green-500' : 'text-gray-400 group-hover:text-green-400'} />
                <span className={`text-[11px] mt-1 ${active('/payment') ? 'text-green-400' : 'text-gray-400 group-hover:text-green-400'}`}>
                  ₦{displayBalance.toLocaleString()}
                </span>
              </Link>

              <Link href={`/profile/${currentUser?.username ?? 'user'}`} className="flex flex-col items-center text-xs p-2 flex-1 group" aria-label="Profile">
                <FaUserCircle size={20} className={active('/profile') ? 'text-pink-500' : 'text-gray-400 group-hover:text-pink-400'} />
                <span className={`text-[11px] mt-1 ${active('/profile') ? 'text-pink-400' : 'text-gray-400 group-hover:text-pink-400'}`}>Profile</span>
              </Link>
            </>
          ) : (
            <>
              <Link href="/" className="flex flex-col items-center text-xs p-2 flex-1 group" aria-label="Home">
                <FaFire size={20} className={pathname === '/' ? 'text-orange-500' : 'text-gray-400 group-hover:text-orange-400'} />
                <span className={`text-[11px] mt-1 ${pathname === '/' ? 'text-orange-400' : 'text-gray-400 group-hover:text-orange-400'}`}>Home</span>
              </Link>
              <Link href="/explore" className="flex flex-col items-center text-xs p-2 flex-1 group" aria-label="Explore">
                <FaRocket size={20} className={active('/explore') ? 'text-purple-500' : 'text-gray-400 group-hover:text-purple-400'} />
                <span className={`text-[11px] mt-1 ${active('/explore') ? 'text-purple-400' : 'text-gray-400 group-hover:text-purple-400'}`}>Explore</span>
              </Link>
              <Link href="/login" className="flex flex-col items-center text-xs p-2 flex-1 group" aria-label="Login">
                <FaSignInAlt size={20} className={active('/login') ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-400'} />
                <span className={`text-[11px] mt-1 ${active('/login') ? 'text-blue-400' : 'text-gray-400 group-hover:text-blue-400'}`}>Login</span>
              </Link>
              <Link href="/register" className="flex flex-col items-center text-xs p-2 flex-1 group" aria-label="Register">
                <FaUserPlus size={20} className={active('/register') ? 'text-green-500' : 'text-gray-400 group-hover:text-green-400'} />
                <span className={`text-[11px] mt-1 ${active('/register') ? 'text-green-400' : 'text-gray-400 group-hover:text-green-400'}`}>Register</span>
              </Link>
              <Link href="/register" className="flex flex-col items-center text-xs p-2 flex-1 group" aria-label="Profile">
                <FaUserCircle size={20} className="text-gray-400 group-hover:text-pink-400" />
                <span className="text-[11px] mt-1 text-gray-400 group-hover:text-pink-400">Profile</span>
              </Link>
            </>
          )}
        </div>
      </nav>

      {showUploadModal && isLoggedIn && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4"
          style={{ zIndex: 9999999 }}
        >
          <div className="bg-gray-800 rounded-lg p-4 max-w-md w-full border border-gray-700 shadow-xl relative">
            <button
              onClick={() => setShowUploadModal(false)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors z-10"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <UploadPosts onClose={() => setShowUploadModal(false)} />
          </div>
        </div>
      )}
    </>
  )
}

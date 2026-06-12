'use client'

import { type ReactNode } from 'react'
import { AuthProvider } from '@/context/AuthContext'
import { AgeVerificationProvider } from '@/context/AgeVerificationContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''

export function Providers({ children }: { children: ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <AgeVerificationProvider>
          <NotificationProvider>
            {children}
            <ToastContainer
              position="top-right"
              autoClose={4000}
              hideProgressBar={false}
              newestOnTop
              closeOnClick
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="dark"
            />
          </NotificationProvider>
        </AgeVerificationProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  )
}

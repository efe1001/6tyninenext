'use client'

import { useAgeVerification } from '@/context/AgeVerificationContext'

export function AgeVerificationGate({ children }: { children: React.ReactNode }) {
  const { ageVerified, verify, isExempt } = useAgeVerification()

  if (ageVerified || isExempt) return <>{children}</>

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center p-4 z-[2147483647]">
      <div className="bg-gray-900 border border-orange-500 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        <div className="w-20 h-20 bg-linear-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-3xl font-black">18+</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Age Verification Required</h1>
        <p className="text-gray-300 mb-6 text-sm leading-relaxed">
          This website contains adult content and is intended for adults aged 18 or older.
          By entering, you confirm you are at least 18 years old and it is legal to view
          such material in your jurisdiction.
        </p>
        <div className="space-y-3">
          <button
            onClick={verify}
            className="w-full py-3 bg-linear-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-600 transition-all"
          >
            I am 18+ — Enter
          </button>
          <a
            href="https://www.google.com"
            className="block w-full py-3 bg-gray-700 text-white rounded-xl font-medium hover:bg-gray-600 transition-all text-sm"
          >
            I am under 18 — Leave
          </a>
        </div>
        <p className="text-xs text-gray-500 mt-4">
          By entering, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}

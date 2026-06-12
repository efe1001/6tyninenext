'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

const API_BASE_URL = ''
const COIN_VALUE = 500
const KORA_PUBLIC_KEY = 'pk_live_d2iNTQyBXJVkaHmS2YkMUcg5WQzWfBs1cWJxg9zu'
const QUICK_TOPUP = [1000, 5000, 10000, 20000, 50000, 100000]
const QUICK_COINS = [1, 5, 10, 20, 50, 100]

type Tab = 'topup' | 'buy_coins' | 'sell_coins' | 'payout'

interface Transaction {
  id: string
  date: string
  type: string
  rawType: string
  amount: number
  status: string
  description: string
  reference: string
  isWithdrawable?: boolean
}

interface WithdrawalRequest {
  _id: string
  amount: number
  bankName: string
  accountNumber: string
  status: string
  createdAt: string
  note?: string
}

// ==================== RECEIPT MODAL ====================
const ReceiptModal = ({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) => {
  if (!tx) return null
  const handleDownload = () => {
    const blob = new Blob([JSON.stringify({ ...tx }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `receipt_${tx.id}.json`; a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-linear-to-br from-gray-800 to-gray-900 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Payment Receipt</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-lg transition">✕</button>
        </div>
        <div className="p-5">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-3 bg-linear-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white">6tyNine</h3>
            <p className="text-gray-400 text-sm">Payment Receipt</p>
          </div>
          <div className={`p-3 rounded-xl mb-4 text-center ${tx.status === 'success' ? 'bg-green-500/20 border border-green-500/30' : tx.status === 'failed' ? 'bg-red-500/20 border border-red-500/30' : 'bg-yellow-500/20 border border-yellow-500/30'}`}>
            <span className={`font-semibold ${tx.status === 'success' ? 'text-green-400' : tx.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
              {tx.status === 'success' ? '✓ Payment Successful' : tx.status === 'failed' ? '✗ Payment Failed' : '⏳ Pending'}
            </span>
          </div>
          <div className="space-y-3">
            {[
              ['Transaction ID', tx.id],
              ['Date & Time', tx.date],
              ['Type', tx.type],
              ['Reference', tx.reference],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-gray-400 text-sm">{label}</span>
                <span className="text-white text-sm font-mono truncate max-w-[180px]">{value}</span>
              </div>
            ))}
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-400 text-sm">Amount</span>
              <span className="text-green-400 font-bold text-xl">₦{tx.amount.toLocaleString()}</span>
            </div>
            <div className="py-2">
              <span className="text-gray-400 text-sm block mb-1">Description</span>
              <p className="text-gray-300 text-sm">{tx.description}</p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-700 text-center">
            <p className="text-gray-500 text-xs">Thank you for using 6tyNine</p>
          </div>
        </div>
        <div className="p-5 border-t border-gray-700 flex gap-3">
          {tx.status === 'success' && (
            <button onClick={handleDownload} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-white font-semibold transition flex items-center justify-center gap-2 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download
            </button>
          )}
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-linear-to-r from-purple-500 to-pink-500 rounded-xl text-white font-semibold transition">Close</button>
        </div>
      </div>
    </div>
  )
}

// ==================== TOAST ====================
const Toast = ({ message, type, onClose }: { message: string; type: string; onClose: () => void }) => {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t) }, [onClose])
  const colors: Record<string, string> = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' }
  return (
    <div className={`fixed bottom-20 left-4 right-4 z-50 ${colors[type] || 'bg-gray-700'} rounded-xl shadow-lg p-4 max-w-sm mx-auto`}>
      <div className="flex items-center gap-3">
        <p className="text-white text-sm flex-1">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
      </div>
    </div>
  )
}

// ==================== CONFIRM POPUP ====================
const ConfirmPopup = ({ isOpen, onClose, onConfirm, title, message, type = 'confirm', confirmText = 'Confirm', cancelText = 'Cancel' }: {
  isOpen: boolean; onClose: () => void; onConfirm: () => void
  title: string; message: string; type?: string; confirmText?: string; cancelText?: string
}) => {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-linear-to-br from-gray-800 to-gray-900 rounded-2xl w-full max-w-sm border border-gray-700 shadow-2xl">
        <div className="p-6 text-center">
          <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${type === 'success' ? 'bg-green-500/20' : type === 'error' ? 'bg-red-500/20' : type === 'warning' ? 'bg-yellow-500/20' : 'bg-purple-500/20'}`}>
            <span className="text-3xl">{type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠️' : '💳'}</span>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
          <p className="text-gray-300 text-sm mb-6">{message}</p>
          <div className="flex gap-3">
            {type === 'confirm' || type === 'warning' ? (
              <>
                <button onClick={onConfirm} className="flex-1 px-4 py-2 bg-linear-to-r from-purple-500 to-pink-500 rounded-xl text-white font-semibold transition">{confirmText}</button>
                <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-white font-semibold transition">{cancelText}</button>
              </>
            ) : (
              <button onClick={onClose} className="w-full px-4 py-2 bg-linear-to-r from-purple-500 to-pink-500 rounded-xl text-white font-semibold transition">Close</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PaymentClient() {
  const { currentUser, setCurrentUser } = useAuth()
  const setUser = (updater: (prev: any) => any) => {
    if (currentUser) setCurrentUser(updater(currentUser) as any)
  }
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<Tab>('topup')
  const [topUpAmount, setTopUpAmount] = useState('')
  const [coinAmount, setCoinAmount] = useState('')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')

  const [koraLoaded, setKoraLoaded] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([])
  const [withdrawableBalance, setWithdrawableBalance] = useState(0)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false)
  const [useWithdrawableForCoins, setUseWithdrawableForCoins] = useState(false)

  const [txFilter, setTxFilter] = useState('all')
  const [receiptTx, setReceiptTx] = useState<Transaction | null>(null)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; type: string; confirmText: string; cancelText: string; onConfirm: () => void }>({ open: false, title: '', message: '', type: 'confirm', confirmText: 'Confirm', cancelText: 'Cancel', onConfirm: () => {} })

  const koraInitRef = useRef(false)
  const isProcessingRef = useRef(false)
  const currentTxRef = useRef<string | null>(null)

  const showToast = (message: string, type = 'info') => setToast({ message, type })
  const showConfirm = (title: string, message: string, onConfirm: () => void, type = 'confirm', confirmText = 'Confirm', cancelText = 'Cancel') => {
    setConfirm({ open: true, title, message, type, confirmText, cancelText, onConfirm: () => { onConfirm(); setConfirm(p => ({ ...p, open: false })) } })
  }

  useEffect(() => {
    if (currentUser) {
      setBankName((currentUser as any).bankName || '')
      setAccountNumber((currentUser as any).accountNumber || '')
    }
  }, [currentUser])

  const fetchTransactions = useCallback(async () => {
    if (!currentUser) return
    setLoadingHistory(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(`${API_BASE_URL}/api/auth/transactions`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        const sorted = (Array.isArray(data) ? data : []).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setTransactions(sorted.map((tx: any) => ({
          id: tx.id || tx._id,
          date: new Date(tx.createdAt).toLocaleString(),
          type: tx.type === 'topup' ? 'Wallet Top-up' : tx.type === 'coin_purchase' ? 'Coin Purchase' : tx.type === 'coin_sale' ? 'Coin Sale' : tx.type === 'earning' ? 'Earnings' : tx.type === 'gift_earning' ? 'Gift Received' : tx.type === 'subscription_earning' ? 'Subscription Earnings' : tx.type === 'withdrawal' ? 'Withdrawal' : tx.type,
          rawType: tx.type,
          amount: tx.amount,
          status: tx.status === 'completed' ? 'success' : tx.status,
          description: tx.description || '',
          reference: tx.reference || tx.id || tx._id,
          isWithdrawable: ['earning', 'gift_earning', 'subscription_earning'].includes(tx.type)
        })))
      }
    } catch {} finally { setLoadingHistory(false) }
  }, [currentUser])

  const fetchWithdrawable = useCallback(async () => {
    if (!currentUser) return
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(`${API_BASE_URL}/api/auth/withdrawable-balance`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); setWithdrawableBalance(d.withdrawableBalance || 0) }
    } catch {}
  }, [currentUser])

  const fetchWithdrawalRequests = useCallback(async () => {
    if (!currentUser) return
    setLoadingWithdrawals(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(`${API_BASE_URL}/api/auth/withdrawal/requests`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setWithdrawalRequests((Array.isArray(data) ? data : []).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      }
    } catch {} finally { setLoadingWithdrawals(false) }
  }, [currentUser])

  useEffect(() => {
    fetchTransactions()
    fetchWithdrawable()
    fetchWithdrawalRequests()
  }, [fetchTransactions, fetchWithdrawable, fetchWithdrawalRequests])

  // Load Kora SDK
  useEffect(() => {
    if (koraInitRef.current) return
    if ((window as any).Korapay?.initialize) { setKoraLoaded(true); koraInitRef.current = true; return }
    const script = document.createElement('script')
    script.src = 'https://korablobstorage.blob.core.windows.net/modal-bucket/korapay-collections.min.js'
    script.async = true
    script.onload = () => {
      let attempts = 0
      const check = setInterval(() => {
        attempts++
        if ((window as any).Korapay?.initialize) { clearInterval(check); setKoraLoaded(true); koraInitRef.current = true }
        else if (attempts > 20) { clearInterval(check); setError('Payment service initialization failed. Please refresh.') }
      }, 100)
    }
    script.onerror = () => setError('Payment service unavailable. Please try again later.')
    document.body.appendChild(script)
    return () => { if (document.body.contains(script)) document.body.removeChild(script) }
  }, [])

  const handleTopUp = async () => {
    if (isProcessingRef.current) return
    if (!koraLoaded || !(window as any).Korapay) { setError('Payment service unavailable. Refresh and try again.'); return }
    const amount = parseFloat(topUpAmount)
    if (!amount || amount <= 0) { setError('Enter a valid amount'); return }
    if (amount < 100) { setError('Minimum top-up is ₦100'); return }
    const email = (currentUser as any)?.email
    if (!email?.includes('@')) { setError('Update your email in profile settings before paying.'); return }
    isProcessingRef.current = true
    setIsProcessing(true)
    setError(null)
    const reference = `TOPUP_${(currentUser as any)?.username || 'user'}_${Date.now()}`
    currentTxRef.current = reference
    try {
      (window as any).Korapay.initialize({
        key: KORA_PUBLIC_KEY,
        reference,
        amount,
        currency: 'NGN',
        customer: { name: (currentUser as any)?.name || (currentUser as any)?.username || 'User', email },
        metadata: { type: 'wallet_topup', username: (currentUser as any)?.username, amount_ngn: amount },
        onSuccess: async (data: any) => {
          const txRef = data.transaction_id || data.reference || reference
          currentTxRef.current = null
          try {
            const token = localStorage.getItem('token')
            if (!token) throw new Error('Authentication required')
            const res = await fetch(`${API_BASE_URL}/api/auth/wallet/topup`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount, reference: txRef, paymentType: 'wallet' })
            })
            if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Top-up verification failed') }
            const result = await res.json()
            if (setUser) setUser((prev: any) => ({ ...prev, balance: result.newBalance }))
            showToast(`✓ Added ₦${amount.toLocaleString()} to your wallet!`, 'success')
            setTopUpAmount('')
            fetchTransactions()
          } catch (err: any) { setError(`Top-up failed: ${err.message}`) }
          finally { isProcessingRef.current = false; setIsProcessing(false) }
        },
        onClose: () => { if (currentTxRef.current) { currentTxRef.current = null; isProcessingRef.current = false; setIsProcessing(false); showToast('Payment cancelled', 'info') } },
        onError: (err: any) => {
          currentTxRef.current = null; isProcessingRef.current = false; setIsProcessing(false)
          setError(`Payment error: ${err?.message || 'Payment failed'}`)
        }
      })
    } catch (err: any) { setError(`Initialization failed: ${err.message}`); currentTxRef.current = null; isProcessingRef.current = false; setIsProcessing(false) }
  }

  const handleBuyCoins = async () => {
    const naira = parseFloat(topUpAmount)
    const coins = Math.floor(naira / COIN_VALUE)
    if (!naira || naira <= 0) { setError('Enter a valid amount'); return }
    if (naira < COIN_VALUE) { setError(`Minimum is ₦${COIN_VALUE} (1 coin)`); return }
    const balance = useWithdrawableForCoins ? withdrawableBalance : ((currentUser as any)?.balance || 0)
    if (naira > balance) { setError(`Insufficient ${useWithdrawableForCoins ? 'withdrawable earnings' : 'wallet balance'}. You have ₦${balance.toLocaleString()}.`); return }
    showConfirm('Confirm Coin Purchase', `Buy ${coins} coins for ₦${naira.toLocaleString()} using your ${useWithdrawableForCoins ? 'withdrawable earnings' : 'wallet balance'}.`, async () => {
      setIsProcessing(true); setError(null)
      try {
        const token = localStorage.getItem('token')
        if (!token) throw new Error('Authentication required')
        const res = await fetch(`${API_BASE_URL}/api/auth/coins/buy`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: naira, fromWithdrawable: useWithdrawableForCoins })
        })
        if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Purchase failed') }
        const result = await res.json()
        if (setUser) setUser((prev: any) => ({ ...prev, balance: result.newWalletBalance ?? prev.balance, coinBalance: result.newCoinBalance }))
        setTopUpAmount(''); setCoinAmount('')
        showToast(`Bought ${result.coinsBought} coins for ₦${result.cost?.toLocaleString()}!`, 'success')
        fetchTransactions(); fetchWithdrawable()
      } catch (err: any) { setError(`Purchase failed: ${err.message}`) }
      finally { setIsProcessing(false) }
    }, 'confirm', 'Yes, Buy Coins', 'Cancel')
  }

  const handleSellCoins = async () => {
    const coins = parseFloat(coinAmount)
    if (!coins || coins <= 0) { setError('Enter a valid coin amount'); return }
    if (coins > ((currentUser as any)?.coinBalance || 0)) { setError(`You only have ${(currentUser as any)?.coinBalance || 0} coins`); return }
    const naira = coins * COIN_VALUE
    showConfirm('Confirm Coin Sale', `Sell ${coins} coins for ₦${naira.toLocaleString()}? Added to wallet balance.`, async () => {
      setIsProcessing(true); setError(null)
      try {
        const token = localStorage.getItem('token')
        if (!token) throw new Error('Authentication required')
        const res = await fetch(`${API_BASE_URL}/api/auth/wallet/sell-coins`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ coins })
        })
        if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Sale failed') }
        const result = await res.json()
        if (setUser) setUser((prev: any) => ({ ...prev, balance: result.newBalance, coinBalance: result.newCoinBalance }))
        setCoinAmount(''); setTopUpAmount('')
        showToast(`Sold ${result.coinsSold} coins for ₦${result.nairaReceived?.toLocaleString()}!`, 'success')
        fetchTransactions()
      } catch (err: any) { setError(`Sale failed: ${err.message}`) }
      finally { setIsProcessing(false) }
    }, 'confirm', 'Yes, Sell Coins', 'Cancel')
  }

  const handleWithdrawal = async () => {
    const amount = parseFloat(payoutAmount)
    if (!amount || amount <= 0) { setError('Enter a valid amount'); return }
    if (amount < 100) { setError('Minimum withdrawal is ₦100'); return }
    if (amount > withdrawableBalance) { setError(`You can only withdraw up to ₦${withdrawableBalance.toLocaleString()} from your earnings.`); return }
    if (!bankName || !accountNumber) { setError('Add your bank details in profile settings before withdrawing'); return }
    showConfirm('Confirm Withdrawal', `Request ₦${amount.toLocaleString()} to ${bankName} - ${accountNumber}?`, async () => {
      setIsSubmittingWithdrawal(true); setError(null)
      try {
        const token = localStorage.getItem('token')
        if (!token) throw new Error('Authentication required')
        const res = await fetch(`${API_BASE_URL}/api/auth/withdrawal/request`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, bankName, accountNumber })
        })
        if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Withdrawal request failed') }
        setPayoutAmount('')
        showToast(`Withdrawal request of ₦${amount.toLocaleString()} submitted! Admin will review it.`, 'success')
        fetchTransactions(); fetchWithdrawalRequests(); fetchWithdrawable()
      } catch (err: any) { setError(`Withdrawal failed: ${err.message}`) }
      finally { setIsSubmittingWithdrawal(false) }
    }, 'warning', 'Yes, Request Withdrawal', 'Cancel')
  }

  const filteredTransactions = transactions.filter(tx => {
    if (txFilter === 'all') return true
    if (txFilter === 'deposits') return tx.rawType === 'topup'
    if (txFilter === 'coins') return ['coin_purchase', 'coin_sale'].includes(tx.rawType)
    if (txFilter === 'earnings') return ['earning', 'gift_earning', 'subscription_earning'].includes(tx.rawType)
    if (txFilter === 'withdrawals') return tx.rawType === 'withdrawal'
    return true
  })

  const balance = (currentUser as any)?.balance ?? 0
  const coinBalance = (currentUser as any)?.coinBalance ?? 0

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', approved: 'bg-green-500/20 text-green-400 border-green-500/30', rejected: 'bg-red-500/20 text-red-400 border-red-500/30' }
    return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${map[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>{status}</span>
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-[#0F1419] via-[#1A1F2E] to-[#0F1419] text-white pb-32">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <ConfirmPopup {...confirm} onClose={() => setConfirm(p => ({ ...p, open: false }))} />
      {receiptTx && <ReceiptModal tx={receiptTx} onClose={() => setReceiptTx(null)} />}

      <div className="relative max-w-md mx-auto w-full pt-6 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition">
            <div className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </div>
            <span className="text-sm font-medium">Back</span>
          </Link>
          <h1 className="text-xl font-bold text-white">Payment Center</h1>
          <div className="w-20" />
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-linear-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-2xl p-3 text-center">
            <p className="text-gray-400 text-xs mb-1">Wallet</p>
            <p className="text-green-400 font-bold text-lg">₦{balance.toLocaleString()}</p>
          </div>
          <div className="bg-linear-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-2xl p-3 text-center">
            <p className="text-gray-400 text-xs mb-1">Coins</p>
            <p className="text-yellow-400 font-bold text-lg">{coinBalance}</p>
          </div>
          <div className="bg-linear-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-2xl p-3 text-center">
            <p className="text-gray-400 text-xs mb-1">Earnings</p>
            <p className="text-purple-400 font-bold text-lg">₦{withdrawableBalance.toLocaleString()}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-800/50 rounded-2xl p-1 mb-6 overflow-x-auto scrollbar-hide">
          {([['topup', 'Top Up'], ['buy_coins', 'Buy Coins'], ['sell_coins', 'Sell Coins'], ['payout', 'Withdraw']] as [Tab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setError(null) }}
              className={`shrink-0 flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition ${activeTab === tab ? 'bg-linear-to-r from-purple-500 to-pink-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >{label}</button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
        )}

        {/* TOP UP TAB */}
        {activeTab === 'topup' && (
          <div className="space-y-4">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <p className="text-blue-300 text-xs">ℹ️ Deposited funds are for purchasing coins and gifts only — they cannot be withdrawn.</p>
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Amount (₦)</label>
              <input type="number" value={topUpAmount} onChange={e => setTopUpAmount(e.target.value)} placeholder="Enter amount" className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-purple-500 transition" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_TOPUP.map(amt => (
                <button key={amt} onClick={() => { setTopUpAmount(amt.toString()); setError(null) }} className={`py-2 rounded-xl text-sm font-medium transition border ${topUpAmount === amt.toString() ? 'bg-purple-500 border-purple-500 text-white' : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                  ₦{(amt / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
            <button onClick={handleTopUp} disabled={isProcessing || !topUpAmount} className="w-full py-3 bg-linear-to-r from-purple-500 to-pink-500 rounded-xl text-white font-bold disabled:opacity-50 transition flex items-center justify-center gap-2">
              {isProcessing ? <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Processing...</> : `Pay ₦${parseFloat(topUpAmount || '0').toLocaleString()}`}
            </button>
          </div>
        )}

        {/* BUY COINS TAB */}
        {activeTab === 'buy_coins' && (
          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
              <p className="text-yellow-300 text-xs">1 coin = ₦{COIN_VALUE}. Use coins for gifts and tipping in live streams.</p>
            </div>
            <div className="flex gap-2 bg-gray-800/50 rounded-xl p-1">
              <button onClick={() => setUseWithdrawableForCoins(false)} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${!useWithdrawableForCoins ? 'bg-purple-500 text-white' : 'text-gray-400'}`}>From Wallet</button>
              <button onClick={() => setUseWithdrawableForCoins(true)} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${useWithdrawableForCoins ? 'bg-purple-500 text-white' : 'text-gray-400'}`}>From Earnings</button>
            </div>
            <p className="text-gray-400 text-xs text-right">Available: ₦{(useWithdrawableForCoins ? withdrawableBalance : balance).toLocaleString()}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Naira Amount</label>
                <input type="number" value={topUpAmount} onChange={e => { setTopUpAmount(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n) && n > 0) setCoinAmount(Math.floor(n / COIN_VALUE).toString()); else setCoinAmount('') }} className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-purple-500 transition" placeholder="₦0" />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Coins</label>
                <input type="number" value={coinAmount} onChange={e => { setCoinAmount(e.target.value); const c = parseFloat(e.target.value); if (!isNaN(c) && c > 0) setTopUpAmount((c * COIN_VALUE).toString()); else setTopUpAmount('') }} className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-purple-500 transition" placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_COINS.map(c => (
                <button key={c} onClick={() => { setCoinAmount(c.toString()); setTopUpAmount((c * COIN_VALUE).toString()); setError(null) }} className={`py-2 rounded-xl text-sm font-medium transition border ${coinAmount === c.toString() ? 'bg-purple-500 border-purple-500 text-white' : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500'}`}>{c} coin{c !== 1 ? 's' : ''}</button>
              ))}
            </div>
            <button onClick={handleBuyCoins} disabled={isProcessing || !topUpAmount} className="w-full py-3 bg-linear-to-r from-yellow-500 to-orange-500 rounded-xl text-white font-bold disabled:opacity-50 transition flex items-center justify-center gap-2">
              {isProcessing ? <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Buying...</> : `Buy ${coinAmount || '0'} Coins`}
            </button>
          </div>
        )}

        {/* SELL COINS TAB */}
        {activeTab === 'sell_coins' && (
          <div className="space-y-4">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex justify-between items-center">
              <span className="text-blue-300 text-xs">Your coins</span>
              <span className="text-yellow-400 font-bold">{coinBalance} coins = ₦{(coinBalance * COIN_VALUE).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Coins to sell</label>
                <input type="number" value={coinAmount} onChange={e => { setCoinAmount(e.target.value); const c = parseFloat(e.target.value); if (!isNaN(c) && c > 0) setTopUpAmount((c * COIN_VALUE).toString()); else setTopUpAmount('') }} className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-purple-500 transition" placeholder="0" max={coinBalance} />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">You receive</label>
                <div className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-3 py-2.5 text-green-400 font-bold">₦{((parseFloat(coinAmount) || 0) * COIN_VALUE).toLocaleString()}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_COINS.filter(c => c <= coinBalance).map(c => (
                <button key={c} onClick={() => { setCoinAmount(c.toString()); setTopUpAmount((c * COIN_VALUE).toString()); setError(null) }} className={`py-2 rounded-xl text-sm font-medium transition border ${coinAmount === c.toString() ? 'bg-purple-500 border-purple-500 text-white' : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500'}`}>{c}</button>
              ))}
            </div>
            <button onClick={handleSellCoins} disabled={isProcessing || !coinAmount} className="w-full py-3 bg-linear-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-bold disabled:opacity-50 transition flex items-center justify-center gap-2">
              {isProcessing ? <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Selling...</> : `Sell ${coinAmount || '0'} Coins`}
            </button>
          </div>
        )}

        {/* PAYOUT TAB */}
        {activeTab === 'payout' && (
          <div className="space-y-4">
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 flex justify-between items-center">
              <span className="text-purple-300 text-xs">Withdrawable earnings</span>
              <span className="text-purple-400 font-bold">₦{withdrawableBalance.toLocaleString()}</span>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
              <p className="text-yellow-300 text-xs">⚠️ Only earnings from gifts and subscriptions can be withdrawn. Deposits are non-withdrawable.</p>
            </div>
            {!bankName || !accountNumber ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                <p className="text-red-400 text-sm mb-3">Bank details required to withdraw.</p>
                <Link href={`/profile/${(currentUser as any)?.username}`} className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition">Add Bank Details</Link>
              </div>
            ) : (
              <>
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium text-sm">{bankName}</p>
                    <p className="text-gray-400 text-xs">{accountNumber}</p>
                  </div>
                  <button onClick={() => navigator.clipboard.writeText(`${bankName} - ${accountNumber}`).then(() => showToast('Copied!', 'success'))} className="text-gray-400 hover:text-white transition p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                </div>
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Withdrawal Amount (₦)</label>
                  <input type="number" value={payoutAmount} onChange={e => { const v = parseFloat(e.target.value); if (v > withdrawableBalance) setError(`Max ₦${withdrawableBalance.toLocaleString()}`); else setError(null); setPayoutAmount(e.target.value) }} placeholder="Enter amount" max={withdrawableBalance} className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-purple-500 transition" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1000, 5000, 10000, 20000, 50000, 100000].filter(a => a <= withdrawableBalance).map(amt => (
                    <button key={amt} onClick={() => { setPayoutAmount(amt.toString()); setError(null) }} className={`py-2 rounded-xl text-xs font-medium transition border ${payoutAmount === amt.toString() ? 'bg-purple-500 border-purple-500 text-white' : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500'}`}>₦{(amt / 1000).toFixed(0)}k</button>
                  ))}
                </div>
                <button onClick={handleWithdrawal} disabled={isSubmittingWithdrawal || !payoutAmount || parseFloat(payoutAmount) > withdrawableBalance} className="w-full py-3 bg-linear-to-r from-purple-500 to-pink-500 rounded-xl text-white font-bold disabled:opacity-50 transition flex items-center justify-center gap-2">
                  {isSubmittingWithdrawal ? <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Submitting...</> : `Request ₦${parseFloat(payoutAmount || '0').toLocaleString()} Withdrawal`}
                </button>
              </>
            )}

            {/* Withdrawal history */}
            {withdrawalRequests.length > 0 && (
              <div className="mt-4">
                <h3 className="text-white font-semibold mb-3">Withdrawal History</h3>
                <div className="space-y-2">
                  {withdrawalRequests.map(req => (
                    <div key={req._id} className="bg-gray-800/50 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium text-sm">₦{req.amount.toLocaleString()}</p>
                        <p className="text-gray-500 text-xs">{req.bankName} · {new Date(req.createdAt).toLocaleDateString()}</p>
                      </div>
                      {statusBadge(req.status)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Transaction History */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">Transaction History</h3>
            <button onClick={() => { fetchTransactions(); fetchWithdrawable() }} className="text-gray-400 hover:text-white transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-3">
            {[['all', 'All'], ['deposits', 'Deposits'], ['coins', 'Coins'], ['earnings', 'Earnings'], ['withdrawals', 'Withdrawals']].map(([val, label]) => (
              <button key={val} onClick={() => setTxFilter(val)} className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition border ${txFilter === val ? 'bg-purple-500 border-purple-500 text-white' : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500'}`}>{label}</button>
            ))}
          </div>

          {loadingHistory ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-purple-500" /></div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">No transactions found</div>
          ) : (
            <div className="space-y-2">
              {filteredTransactions.slice(0, 20).map(tx => (
                <button key={tx.id} onClick={() => setReceiptTx(tx)} className="w-full bg-gray-800/50 rounded-xl p-3 flex items-center gap-3 hover:bg-gray-700/50 transition text-left">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.rawType === 'topup' ? 'bg-green-500/20' : tx.rawType === 'coin_purchase' ? 'bg-yellow-500/20' : tx.rawType === 'coin_sale' ? 'bg-blue-500/20' : tx.isWithdrawable ? 'bg-purple-500/20' : 'bg-gray-500/20'}`}>
                    <span className="text-sm">{tx.rawType === 'topup' ? '💳' : tx.rawType === 'coin_purchase' ? '🪙' : tx.rawType === 'coin_sale' ? '↔️' : tx.isWithdrawable ? '🎁' : '💸'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{tx.type}</p>
                    <p className="text-gray-500 text-xs">{tx.date}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${tx.isWithdrawable ? 'text-green-400' : 'text-white'}`}>₦{tx.amount.toLocaleString()}</p>
                    <span className={`text-xs ${tx.status === 'success' ? 'text-green-400' : tx.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>{tx.status}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

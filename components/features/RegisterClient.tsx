'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GoogleLogin } from '@react-oauth/google'
import { jwtDecode } from 'jwt-decode'
import { CountryDropdown, RegionDropdown } from 'react-country-region-selector'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'

const API_BASE_URL = ''

const steps = [
  { id: 1, name: 'Basic Info',  icon: '👤', fields: ['username', 'firstName', 'lastName', 'email'] },
  { id: 2, name: 'Security',   icon: '🔒', fields: ['password', 'confirmPassword'] },
  { id: 3, name: 'Personal',   icon: '📝', fields: ['gender', 'age', 'userType', 'bio'] },
  { id: 4, name: 'Location',   icon: '📍', fields: ['country', 'state', 'city', 'postalCode'] },
  { id: 5, name: 'Privacy',    icon: '🛡️', fields: ['phoneNumber', 'phoneNumberVisibility', 'messagesFromPremiumOnly'] },
  { id: 6, name: 'Photo',      icon: '📸', fields: ['profilePicture'] },
]

const PHONE_VISIBILITY_OPTIONS = [
  { value: 'all_users',        label: 'All Users (Everyone can see)' },
  { value: 'subscribers_only', label: 'Subscribers Only' },
  { value: 'followers_only',   label: 'Followers Only' },
  { value: 'non',              label: 'Hide Phone Number' },
]

const USER_TYPE_OPTIONS = [
  { value: 'content_creator', label: 'Content Creator' },
  { value: 'escort',          label: 'Escort' },
  { value: 'both',            label: 'Content Creator and Escort' },
]

const COMMON_PASSWORDS = ['password', '123456', '12345678', 'qwerty', 'abc123', 'password123', 'admin', 'welcome']

function getDetailedErrorMessage(field: string, errorType: string, value: string | null = null): string {
  const msgs: Record<string, Record<string, string>> = {
    username: {
      required:         '❌ Username is required.',
      tooShort:         '❌ Username must be at least 3 characters.',
      tooLong:          '❌ Username cannot exceed 50 characters.',
      invalidChars:     '❌ Username: letters, numbers, underscores and hyphens only.',
      startsWithNumber: '❌ Username cannot start with a number.',
      taken:            `❌ Username "${value}" is already taken.`,
    },
    email: {
      required: '❌ Email address is required.',
      invalid:  '❌ Please enter a valid email address.',
      taken:    `❌ Email "${value}" is already registered.`,
      tooLong:  '❌ Email address is too long.',
    },
    password: {
      required: '❌ Password is required.',
      tooShort: '❌ Password must be at least 6 characters.',
      tooLong:  '❌ Password cannot exceed 100 characters.',
    },
    confirmPassword: {
      mismatch: '❌ Passwords do not match.',
      required: '❌ Please confirm your password.',
    },
    firstName: {
      required:     '❌ First name is required.',
      tooShort:     '❌ First name must be at least 2 characters.',
      tooLong:      '❌ First name cannot exceed 50 characters.',
      invalidChars: '❌ First name: letters, spaces, hyphens and apostrophes only.',
    },
    lastName: {
      required:     '❌ Last name is required.',
      tooShort:     '❌ Last name must be at least 2 characters.',
      tooLong:      '❌ Last name cannot exceed 50 characters.',
      invalidChars: '❌ Last name: letters, spaces, hyphens and apostrophes only.',
    },
    age: {
      required:   '❌ Age is required.',
      underage:   '❌ You must be at least 18 years old to register.',
      tooOld:     '❌ Age cannot exceed 120.',
      invalid:    '❌ Please enter a valid age (numbers only).',
      notInteger: '❌ Age must be a whole number.',
    },
    gender:   { required: '❌ Please select your gender.' },
    country:  { required: '❌ Please select your country.' },
    state:    { required: '❌ Please select your state/province.' },
    city: {
      required:     '❌ City is required.',
      tooLong:      '❌ City name is too long.',
      invalidChars: '❌ City: letters, spaces and hyphens only.',
    },
    phoneNumberVisibility: { required: '❌ Please select who can see your phone number.' },
    userType:              { required: '❌ Please select your user type.' },
    profilePicture: {
      tooLarge:     '❌ Profile picture is too large. Max 2GB.',
      invalidType:  '❌ Only JPEG/PNG/JPG images allowed.',
      uploadFailed: '❌ Failed to upload profile picture.',
      corrupted:    '❌ The image file appears to be corrupted.',
    },
    network: {
      offline:           '❌ You are offline. Please check your connection.',
      timeout:           '❌ Request timed out. Please try again.',
      connectionRefused: '❌ Cannot connect to the server.',
    },
    general: { unknown: '❌ An unexpected error occurred. Please try again.' },
  }
  return msgs[field]?.[errorType] || msgs.general.unknown
}

export default function RegisterClient() {
  const router = useRouter()
  const { loginWithToken } = useAuth()

  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState({
    username: '', firstName: '', lastName: '', email: '',
    password: '', confirmPassword: '', gender: '', age: '',
    country: '', state: '', city: '', postalCode: '',
    phoneNumber: '', phoneNumberVisibility: 'all_users',
    userType: 'content_creator', messagesFromPremiumOnly: false,
    profilePicture: null as File | null, bio: '',
  })
  const [errors, setErrors] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [networkStatus, setNetworkStatus] = useState('online')
  const [usernameStatus, setUsernameStatus] = useState({ checking: false, available: null as boolean | null, message: '', suggestions: [] as string[] })
  const [emailStatus, setEmailStatus] = useState({ checking: false, available: null as boolean | null, message: '' })
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({})
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [detailedErrors, setDetailedErrors] = useState<Record<string, any>>({})
  const [passwordSuggestions, setPasswordSuggestions] = useState<string[]>([])
  const [googleLoading, setGoogleLoading] = useState(false)
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const usernameTimeoutRef = useRef<any>(null)
  const emailTimeoutRef = useRef<any>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOnline = () => setNetworkStatus('online')
    const handleOffline = () => setNetworkStatus('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setNetworkStatus(navigator.onLine ? 'online' : 'offline')
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline) }
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('registerFormData')
      if (saved) { const parsed = JSON.parse(saved); setFormData(prev => ({ ...prev, ...parsed })) }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const { profilePicture, ...toSave } = formData
      localStorage.setItem('registerFormData', JSON.stringify(toSave))
    } catch {}
  }, [formData])

  const generateUsernameSuggestions = useCallback((baseName = '', takenUsername = ''): string[] => {
    const nameToUse = baseName || formData.firstName?.toLowerCase() || 'user'
    const clean = nameToUse.replace(/[^a-z0-9]/g, '')
    const r1 = Math.floor(Math.random() * 10000)
    const r2 = Math.floor(Math.random() * 9999)
    const suggestions = [
      `${clean}${r1}`, `${clean}_${new Date().getFullYear()}`,
      `${clean}${Math.floor(Math.random() * 1000)}`, `user_${r2}`,
      `${clean}_pro`, `${clean}123`,
    ]
    if (takenUsername) {
      const tc = takenUsername.replace(/[^a-z0-9]/g, '')
      suggestions.push(`${tc}${r1}`, `${tc}_${Math.floor(Math.random() * 1000)}`)
    }
    return [...new Set(suggestions)].slice(0, 6)
  }, [formData.firstName])

  const checkUsernameAvailability = useCallback(async (username: string) => {
    if (!username || username.length < 3) { setUsernameStatus({ checking: false, available: null, message: '', suggestions: [] }); setShowSuggestions(false); return }
    if (username.length > 50) { setUsernameStatus({ checking: false, available: false, message: getDetailedErrorMessage('username', 'tooLong'), suggestions: [] }); return }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) { setUsernameStatus({ checking: false, available: false, message: getDetailedErrorMessage('username', 'invalidChars'), suggestions: [] }); return }
    if (/^[0-9]/.test(username)) { setUsernameStatus({ checking: false, available: false, message: getDetailedErrorMessage('username', 'startsWithNumber'), suggestions: [] }); return }
    if (usernameTimeoutRef.current) clearTimeout(usernameTimeoutRef.current)
    usernameTimeoutRef.current = setTimeout(async () => {
      setUsernameStatus(p => ({ ...p, checking: true, available: null, message: '🔍 Checking availability...' }))
      try {
        const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 5000)
        const res = await fetch(`${API_BASE_URL}/api/auth/check-username/${encodeURIComponent(username)}`, { signal: ctrl.signal })
        clearTimeout(tid)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data.available) { setUsernameStatus({ checking: false, available: true, message: '✅ Username is available!', suggestions: [] }); setShowSuggestions(false) }
        else { const sugs = generateUsernameSuggestions(formData.firstName, username); setUsernameStatus({ checking: false, available: false, message: getDetailedErrorMessage('username', 'taken', username), suggestions: sugs }); setShowSuggestions(true) }
      } catch { setUsernameStatus({ checking: false, available: null, message: '⚠️ Could not check availability.', suggestions: [] }) }
    }, 500)
  }, [generateUsernameSuggestions, formData.firstName])

  const checkEmailAvailability = useCallback(async (email: string) => {
    if (!email || !email.includes('@') || email.length < 5) { setEmailStatus({ checking: false, available: null, message: '' }); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) { setEmailStatus({ checking: false, available: false, message: getDetailedErrorMessage('email', 'invalid') }); return }
    if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current)
    emailTimeoutRef.current = setTimeout(async () => {
      setEmailStatus({ checking: true, available: null, message: '🔍 Checking availability...' })
      try {
        const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 5000)
        const res = await fetch(`${API_BASE_URL}/api/auth/check-email/${encodeURIComponent(email)}`, { signal: ctrl.signal })
        clearTimeout(tid)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data.available) setEmailStatus({ checking: false, available: true, message: '✅ Email is available!' })
        else setEmailStatus({ checking: false, available: false, message: getDetailedErrorMessage('email', 'taken', email) })
      } catch { setEmailStatus({ checking: false, available: null, message: '⚠️ Could not check availability.' }) }
    }, 500)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    if (errors[name]) setErrors(p => ({ ...p, [name]: null }))
    if (detailedErrors[name]) setDetailedErrors(p => ({ ...p, [name]: null }))
    if (name === 'username') checkUsernameAvailability(value)
    if (name === 'email') checkEmailAvailability(value)
    if (name === 'password') setPasswordSuggestions([])
  }

  const applySuggestion = (suggestion: string) => {
    setFormData(prev => ({ ...prev, username: suggestion }))
    checkUsernameAvailability(suggestion)
    setErrors(p => ({ ...p, username: null })); setDetailedErrors(p => ({ ...p, username: null }))
    setShowSuggestions(false)
  }

  const compressImage = (file: File, callback: (f: File) => void) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = e => {
      const img = new Image(); img.src = e.target?.result as string
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        if (width > 4000) { height = Math.round((height * 4000) / width); width = 4000 }
        if (height > 4000) { width = Math.round((width * 4000) / height); height = 4000 }
        canvas.width = width; canvas.height = height
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height)
        const quality = file.size > 50 * 1024 * 1024 ? 0.7 : file.size > 20 * 1024 * 1024 ? 0.8 : 0.85
        canvas.toBlob(blob => {
          if (blob) callback(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }))
        }, 'image/jpeg', quality)
      }
    }
    reader.onerror = () => setErrors(p => ({ ...p, profilePicture: getDetailedErrorMessage('profilePicture', 'corrupted') }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024 * 1024) { setErrors(p => ({ ...p, profilePicture: getDetailedErrorMessage('profilePicture', 'tooLarge') })); return }
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) { setErrors(p => ({ ...p, profilePicture: getDetailedErrorMessage('profilePicture', 'invalidType') })); return }
    compressImage(file, compressed => {
      setFormData(prev => ({ ...prev, profilePicture: compressed }))
      setErrors(p => ({ ...p, profilePicture: null }))
      setProfilePicturePreview(URL.createObjectURL(compressed))
    })
  }

  const uploadToFirebase = async (file: File, path: string, retryCount = 0): Promise<string> => {
    try {
      const fileRef = ref(storage, path)
      const snapshot = await uploadBytes(fileRef, file)
      return await getDownloadURL(snapshot.ref)
    } catch (error: any) {
      if (retryCount < 2) {
        await new Promise(r => setTimeout(r, Math.pow(2, retryCount) * 2000))
        return uploadToFirebase(file, path, retryCount + 1)
      }
      throw new Error(getDetailedErrorMessage('profilePicture', 'uploadFailed'))
    }
  }

  const validatePassword = (password: string) => {
    const errs: string[] = []; const sugs: string[] = []
    if (!password) { errs.push(getDetailedErrorMessage('password', 'required')); return { errors: errs, suggestions: sugs } }
    if (password.length < 6) errs.push(getDetailedErrorMessage('password', 'tooShort'))
    if (password.length > 100) errs.push(getDetailedErrorMessage('password', 'tooLong'))
    if (password.length >= 6) {
      if (!/\d/.test(password)) sugs.push('💡 Adding numbers makes your password stronger')
      if (!/[A-Z]/.test(password)) sugs.push('💡 Adding uppercase letters makes your password stronger')
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) sugs.push('💡 Adding special characters makes your password stronger')
      if (COMMON_PASSWORDS.includes(password.toLowerCase())) sugs.push('⚠️ This password is very common. Please use a more unique one.')
    }
    return { errors: errs, suggestions: sugs }
  }

  const validateStep = useCallback((step: number): boolean => {
    const stepFields = steps.find(s => s.id === step)?.fields || []
    const newErrors: Record<string, string> = {}
    for (const field of stepFields) {
      switch (field) {
        case 'username':
          if (!formData.username?.trim()) newErrors.username = getDetailedErrorMessage('username', 'required')
          else if (formData.username.length < 3) newErrors.username = getDetailedErrorMessage('username', 'tooShort')
          else if (formData.username.length > 50) newErrors.username = getDetailedErrorMessage('username', 'tooLong')
          else if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) newErrors.username = getDetailedErrorMessage('username', 'invalidChars')
          else if (/^[0-9]/.test(formData.username)) newErrors.username = getDetailedErrorMessage('username', 'startsWithNumber')
          else if (usernameStatus.available === false) newErrors.username = getDetailedErrorMessage('username', 'taken', formData.username)
          break
        case 'firstName':
          if (!formData.firstName?.trim()) newErrors.firstName = getDetailedErrorMessage('firstName', 'required')
          else if (formData.firstName.length < 2) newErrors.firstName = getDetailedErrorMessage('firstName', 'tooShort')
          else if (!/^[a-zA-Z\s\-']+$/.test(formData.firstName)) newErrors.firstName = getDetailedErrorMessage('firstName', 'invalidChars')
          break
        case 'lastName':
          if (!formData.lastName?.trim()) newErrors.lastName = getDetailedErrorMessage('lastName', 'required')
          else if (formData.lastName.length < 2) newErrors.lastName = getDetailedErrorMessage('lastName', 'tooShort')
          else if (!/^[a-zA-Z\s\-']+$/.test(formData.lastName)) newErrors.lastName = getDetailedErrorMessage('lastName', 'invalidChars')
          break
        case 'email':
          if (!formData.email?.trim()) newErrors.email = getDetailedErrorMessage('email', 'required')
          else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = getDetailedErrorMessage('email', 'invalid')
          else if (emailStatus.available === false) newErrors.email = getDetailedErrorMessage('email', 'taken', formData.email)
          break
        case 'password': {
          const { errors: pe, suggestions: ps } = validatePassword(formData.password)
          if (pe.length > 0) newErrors.password = pe[0]
          setPasswordSuggestions(ps)
          break
        }
        case 'confirmPassword':
          if (!formData.confirmPassword) newErrors.confirmPassword = getDetailedErrorMessage('confirmPassword', 'required')
          else if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = getDetailedErrorMessage('confirmPassword', 'mismatch')
          break
        case 'gender':  if (!formData.gender) newErrors.gender = getDetailedErrorMessage('gender', 'required'); break
        case 'age':
          if (!formData.age) newErrors.age = getDetailedErrorMessage('age', 'required')
          else if (isNaN(Number(formData.age))) newErrors.age = getDetailedErrorMessage('age', 'invalid')
          else if (Number(formData.age) < 18) newErrors.age = getDetailedErrorMessage('age', 'underage')
          else if (Number(formData.age) > 120) newErrors.age = getDetailedErrorMessage('age', 'tooOld')
          break
        case 'userType': if (!formData.userType) newErrors.userType = getDetailedErrorMessage('userType', 'required'); break
        case 'country':  if (!formData.country) newErrors.country = getDetailedErrorMessage('country', 'required'); break
        case 'state':    if (!formData.state) newErrors.state = getDetailedErrorMessage('state', 'required'); break
        case 'city':
          if (!formData.city?.trim()) newErrors.city = getDetailedErrorMessage('city', 'required')
          else if (formData.city.length > 100) newErrors.city = getDetailedErrorMessage('city', 'tooLong')
          break
        case 'phoneNumberVisibility':
          if (!formData.phoneNumberVisibility) newErrors.phoneNumberVisibility = getDetailedErrorMessage('phoneNumberVisibility', 'required')
          break
      }
    }
    setErrors(prev => ({ ...prev, ...newErrors }))
    return Object.keys(newErrors).length === 0
  }, [formData, usernameStatus.available, emailStatus.available])

  const nextStep = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (validateStep(currentStep)) {
      setCompletedSteps(p => ({ ...p, [currentStep]: true }))
      if (currentStep < steps.length) { setCurrentStep(currentStep + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }
    }
  }

  const prevStep = () => {
    if (currentStep > 1) { setCurrentStep(currentStep - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  }

  const handleGoogleSuccess = async (credentialResponse: any) => {
    if (isSubmitting || networkStatus === 'offline') { alert('You are offline. Please check your connection.'); return }
    setGoogleLoading(true); setIsSubmitting(true)
    try {
      const { credential } = credentialResponse; jwtDecode(credential)
      const res = await fetch(`${API_BASE_URL}/api/auth/google/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: credential }),
      })
      if (!res.ok) throw new Error('Google sign-up failed')
      const data = await res.json()
      if (data?.token) { localStorage.removeItem('registerFormData'); loginWithToken(data.token); router.push('/') }
      else throw new Error('Invalid response from server')
    } catch (error: any) { alert(error.message || 'Google sign-in failed. Please try again.') }
    finally { setGoogleLoading(false); setIsSubmitting(false) }
  }

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (isSubmitting || networkStatus === 'offline') return
    for (let i = 1; i <= steps.length; i++) {
      if (!validateStep(i)) { setCurrentStep(i); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    }
    if (usernameStatus.available === false) { setCurrentStep(1); setShowSuggestions(true); return }
    if (emailStatus.available === false) { setCurrentStep(1); return }
    setIsSubmitting(true); setLoading(true); setErrors({})
    try {
      let profilePictureUrl = ''
      if (formData.profilePicture) {
        setIsUploadingPhoto(true); setUploadProgress(10)
        profilePictureUrl = await uploadToFirebase(formData.profilePicture, `profile-pictures/${formData.username}_${Date.now()}.jpg`)
        setUploadProgress(50); setIsUploadingPhoto(false)
      }
      setUploadProgress(70)
      const registrationData = {
        username: formData.username.trim().toLowerCase(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        gender: formData.gender,
        age: parseInt(formData.age),
        location: `${formData.city.trim()}, ${formData.state}, ${formData.country}`,
        city: formData.city.trim(), country: formData.country, state: formData.state,
        postalCode: formData.postalCode?.trim() || '',
        phoneNumber: formData.phoneNumber?.trim() || '',
        phoneNumberVisibility: formData.phoneNumberVisibility,
        userType: formData.userType,
        messagesFromPremiumOnly: formData.messagesFromPremiumOnly,
        profilePicture: profilePictureUrl,
        bio: formData.bio?.trim() || '',
      }
      setUploadProgress(85)
      const ctrl = new AbortController(); abortControllerRef.current = ctrl
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.field === 'username') { setCurrentStep(1); setShowSuggestions(true); setUsernameStatus({ checking: false, available: false, message: data.message, suggestions: generateUsernameSuggestions(formData.firstName, formData.username) }) }
        else if (data.field === 'email') { setCurrentStep(1) }
        throw new Error(data.message || getDetailedErrorMessage('general', 'unknown'))
      }
      if (!data.token) throw new Error(getDetailedErrorMessage('general', 'unknown'))
      setUploadProgress(100)
      localStorage.removeItem('registerFormData')
      loginWithToken(data.token)
      router.push('/')
    } catch (error: any) {
      setErrors(p => ({ ...p, api: error.message || getDetailedErrorMessage('general', 'unknown') }))
    } finally {
      setLoading(false); setUploadProgress(0); setIsSubmitting(false); setIsUploadingPhoto(false)
      abortControllerRef.current = null
    }
  }

  const renderError = (field: string) => {
    const err = errors[field] || detailedErrors[field]
    if (!err) return null
    const list = Array.isArray(err) ? err : [err]
    return (
      <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
        {list.map((e: string, i: number) => <p key={i} className="text-red-400 text-xs">{e}</p>)}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-600 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-orange-600 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse" style={{ animationDelay: '4s' }} />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-linear-to-r from-orange-500 to-red-500 rounded-2xl flex items-center justify-center shadow-lg transform rotate-12"><span className="text-2xl">6</span></div>
            <div className="w-12 h-12 bg-linear-to-r from-pink-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-12"><span className="text-2xl">9</span></div>
          </div>
          <h1 className="text-4xl font-bold bg-linear-to-r from-orange-500 via-red-500 to-pink-500 bg-clip-text text-transparent">Create Account</h1>
          <p className="text-gray-400 mt-2">Join our community and start your journey</p>
        </div>

        {/* Step progress */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="flex justify-between mb-2">
            {steps.map(step => (
              <div key={step.id} className={`flex flex-col items-center cursor-pointer transition-all duration-300 ${currentStep >= step.id ? 'text-orange-500' : 'text-gray-500'}`}
                onClick={() => { if (step.id < currentStep) setCurrentStep(step.id) }}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${currentStep >= step.id ? 'bg-linear-to-r from-orange-500 to-red-500 text-white shadow-lg' : 'bg-gray-700 text-gray-400'} ${completedSteps[step.id] ? 'ring-2 ring-green-500' : ''}`}>
                  {completedSteps[step.id] ? '✓' : step.id}
                </div>
                <div className="text-xs mt-2 hidden sm:block">{step.name}</div>
              </div>
            ))}
          </div>
          <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="absolute top-0 left-0 h-full bg-linear-to-r from-orange-500 via-red-500 to-pink-500 rounded-full transition-all duration-500" style={{ width: `${(currentStep / steps.length) * 100}%` }} />
          </div>
          <p className="text-center mt-2 text-gray-400 text-sm">Step {currentStep} of {steps.length}: {steps[currentStep - 1].name}</p>
        </div>

        {networkStatus === 'offline' && (
          <div className="max-w-2xl mx-auto mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
            <p className="text-yellow-400 font-semibold">📡 You are offline. Please check your internet connection.</p>
          </div>
        )}

        {errors.api && (
          <div className="max-w-2xl mx-auto mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-400 text-center font-semibold">{errors.api}</p>
          </div>
        )}

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className="max-w-2xl mx-auto mb-6">
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
              <div className="flex justify-between text-sm text-gray-300 mb-2">
                <span>{uploadProgress < 60 ? '📤 Uploading profile picture...' : '🔐 Creating your account...'}</span>
                <span className="font-mono">{uploadProgress}%</span>
              </div>
              <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="absolute top-0 left-0 h-full bg-linear-to-r from-orange-500 via-red-500 to-pink-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="text-center text-xs text-gray-500 mt-2">Please don't close this page</p>
            </div>
          </div>
        )}

        {/* Google Sign-Up */}
        <div className="max-w-4xl mx-auto mb-6">
          <div className="bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-6 shadow-2xl">
            <div className="text-center mb-4">
              <h3 className="text-white font-semibold text-lg flex items-center justify-center gap-2">🚀 Quick Sign Up with Google</h3>
              <p className="text-gray-400 text-sm">Sign up in seconds using your Google account</p>
            </div>
            <div className="flex justify-center">
              {googleLoading ? (
                <div className="px-6 py-3 bg-gray-700 rounded-xl flex items-center gap-3">
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                  <span className="text-white">Processing...</span>
                </div>
              ) : (
                <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => alert('Google sign-in failed. Please try again.')}
                  useOneTap={false} theme="filled_black" size="large" text="signup_with" shape="rectangular" width="300" />
              )}
            </div>
            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <p className="text-gray-300 text-xs text-center">
                <strong className="text-green-400">Google</strong> = Quick access &nbsp;•&nbsp;
                <strong className="text-orange-400">Full form below</strong> = Complete profile for Female/Escort/Creator accounts
              </p>
            </div>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700" /></div>
              <div className="relative flex justify-center text-sm"><span className="px-2 bg-gray-800/40 text-gray-400">Or register with email</span></div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto space-y-6">

          {/* STEP 1: Basic Info */}
          {currentStep === 1 && (
            <div className="bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-700/50 overflow-hidden shadow-2xl">
              <div className="bg-linear-to-r from-orange-500/20 to-red-500/20 px-6 py-4 border-b border-gray-700/50">
                <h3 className="text-xl font-semibold text-white flex items-center gap-2">👤 Basic Information</h3>
                <p className="text-gray-400 text-sm mt-1">Tell us who you are</p>
              </div>
              <div className="p-6 space-y-6">
                <div className="relative" ref={suggestionsRef}>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Username <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                    <input type="text" name="username" value={formData.username} onChange={handleChange}
                      onFocus={() => usernameStatus.suggestions.length > 0 && setShowSuggestions(true)}
                      className={`w-full pl-8 pr-4 py-3 bg-gray-900/50 rounded-xl border-2 ${errors.username ? 'border-red-500' : usernameStatus.available === true ? 'border-green-500' : usernameStatus.available === false ? 'border-red-500' : 'border-gray-700'} focus:outline-none focus:ring-2 focus:ring-orange-500 text-white placeholder-gray-500 transition-all`}
                      placeholder="username" disabled={loading || isSubmitting} maxLength={50} autoComplete="off" />
                  </div>
                  {usernameStatus.checking && <p className="text-gray-400 text-xs mt-2 flex items-center gap-1"><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Checking...</p>}
                  {usernameStatus.available === true && <p className="text-green-500 text-xs mt-2">✓ {usernameStatus.message}</p>}
                  {usernameStatus.available === false && !errors.username && <p className="text-red-500 text-xs mt-2">✗ {usernameStatus.message}</p>}
                  {renderError('username')}
                  <p className="text-gray-500 text-xs mt-2">3-50 characters, letters, numbers, _ and - only</p>
                  {showSuggestions && usernameStatus.suggestions.length > 0 && (
                    <div className="absolute z-50 mt-2 w-full bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
                      <div className="bg-linear-to-r from-orange-500/20 to-red-500/20 px-4 py-3 border-b border-gray-700">
                        <p className="text-gray-300 text-sm font-semibold">✨ Available Username Suggestions</p>
                      </div>
                      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {usernameStatus.suggestions.map(s => (
                          <button key={s} type="button" onClick={() => applySuggestion(s)}
                            className="px-3 py-2 bg-gray-700/50 hover:bg-orange-500 rounded-lg text-sm font-medium transition-all text-left text-white">{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">First Name <span className="text-red-500">*</span></label>
                    <input type="text" name="firstName" value={formData.firstName} onChange={handleChange}
                      className={`w-full px-4 py-3 bg-gray-900/50 rounded-xl border-2 ${errors.firstName ? 'border-red-500' : 'border-gray-700'} focus:outline-none focus:ring-2 focus:ring-orange-500 text-white transition-all`}
                      placeholder="First name" disabled={loading || isSubmitting} maxLength={50} />
                    {renderError('firstName')}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Last Name <span className="text-red-500">*</span></label>
                    <input type="text" name="lastName" value={formData.lastName} onChange={handleChange}
                      className={`w-full px-4 py-3 bg-gray-900/50 rounded-xl border-2 ${errors.lastName ? 'border-red-500' : 'border-gray-700'} focus:outline-none focus:ring-2 focus:ring-orange-500 text-white transition-all`}
                      placeholder="Last name" disabled={loading || isSubmitting} maxLength={50} />
                    {renderError('lastName')}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">📧</span>
                    <input type="email" name="email" value={formData.email} onChange={handleChange}
                      className={`w-full pl-10 pr-4 py-3 bg-gray-900/50 rounded-xl border-2 ${errors.email ? 'border-red-500' : emailStatus.available === true ? 'border-green-500' : emailStatus.available === false ? 'border-red-500' : 'border-gray-700'} focus:outline-none focus:ring-2 focus:ring-orange-500 text-white transition-all`}
                      placeholder="your@email.com" disabled={loading || isSubmitting} autoComplete="off" />
                  </div>
                  {emailStatus.checking && <p className="text-gray-400 text-xs mt-2">🔍 Checking...</p>}
                  {emailStatus.available === true && <p className="text-green-500 text-xs mt-2">✓ {emailStatus.message}</p>}
                  {emailStatus.available === false && !errors.email && <p className="text-red-500 text-xs mt-2">✗ {emailStatus.message}</p>}
                  {renderError('email')}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Security */}
          {currentStep === 2 && (
            <div className="bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-700/50 overflow-hidden shadow-2xl">
              <div className="bg-linear-to-r from-orange-500/20 to-red-500/20 px-6 py-4 border-b border-gray-700/50">
                <h3 className="text-xl font-semibold text-white flex items-center gap-2">🔒 Security</h3>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Password <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleChange}
                      className={`w-full px-4 pr-12 py-3 bg-gray-900/50 rounded-xl border-2 ${errors.password ? 'border-red-500' : 'border-gray-700'} focus:outline-none focus:ring-2 focus:ring-orange-500 text-white transition-all`}
                      placeholder="Min. 6 characters" disabled={loading || isSubmitting} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">{showPassword ? '🙈' : '👁️'}</button>
                  </div>
                  {renderError('password')}
                  {passwordSuggestions.map((s, i) => <p key={i} className="text-yellow-400 text-xs mt-1">{s}</p>)}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Confirm Password <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
                      className={`w-full px-4 pr-12 py-3 bg-gray-900/50 rounded-xl border-2 ${errors.confirmPassword ? 'border-red-500' : formData.confirmPassword && formData.password === formData.confirmPassword ? 'border-green-500' : 'border-gray-700'} focus:outline-none focus:ring-2 focus:ring-orange-500 text-white transition-all`}
                      placeholder="Repeat your password" disabled={loading || isSubmitting} />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">{showConfirmPassword ? '🙈' : '👁️'}</button>
                  </div>
                  {renderError('confirmPassword')}
                  {formData.confirmPassword && formData.password === formData.confirmPassword && <p className="text-green-500 text-xs mt-2">✓ Passwords match</p>}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Personal */}
          {currentStep === 3 && (
            <div className="bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-700/50 overflow-hidden shadow-2xl">
              <div className="bg-linear-to-r from-orange-500/20 to-red-500/20 px-6 py-4 border-b border-gray-700/50">
                <h3 className="text-xl font-semibold text-white flex items-center gap-2">📝 Personal Information</h3>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Gender <span className="text-red-500">*</span></label>
                    <select name="gender" value={formData.gender} onChange={handleChange}
                      className={`w-full px-4 py-3 bg-gray-900/50 rounded-xl border-2 ${errors.gender ? 'border-red-500' : 'border-gray-700'} focus:outline-none focus:ring-2 focus:ring-orange-500 text-white transition-all`}
                      disabled={loading || isSubmitting}>
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                    {renderError('gender')}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Age <span className="text-red-500">*</span></label>
                    <input type="number" name="age" value={formData.age} onChange={handleChange} min="18" max="120"
                      className={`w-full px-4 py-3 bg-gray-900/50 rounded-xl border-2 ${errors.age ? 'border-red-500' : 'border-gray-700'} focus:outline-none focus:ring-2 focus:ring-orange-500 text-white transition-all`}
                      placeholder="Your age (18+)" disabled={loading || isSubmitting} />
                    {renderError('age')}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Account Type <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {USER_TYPE_OPTIONS.map(opt => (
                      <label key={opt.value} className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.userType === opt.value ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 hover:border-gray-600'}`}>
                        <input type="radio" name="userType" value={opt.value} checked={formData.userType === opt.value} onChange={handleChange} className="hidden" />
                        <span className="text-white text-sm font-medium">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  {renderError('userType')}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Bio</label>
                  <textarea name="bio" value={formData.bio} onChange={handleChange} rows={3}
                    className="w-full px-4 py-3 bg-gray-900/50 rounded-xl border-2 border-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 text-white placeholder-gray-500 resize-none transition-all"
                    placeholder="Tell us about yourself..." disabled={loading || isSubmitting} maxLength={500} />
                  <p className="text-gray-500 text-xs mt-1">{formData.bio.length}/500</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Location */}
          {currentStep === 4 && (
            <div className="bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-700/50 overflow-hidden shadow-2xl">
              <div className="bg-linear-to-r from-orange-500/20 to-red-500/20 px-6 py-4 border-b border-gray-700/50">
                <h3 className="text-xl font-semibold text-white flex items-center gap-2">📍 Location</h3>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Country <span className="text-red-500">*</span></label>
                  <CountryDropdown value={formData.country}
                    onChange={(val: string) => { setFormData(p => ({ ...p, country: val, state: '' })); setErrors(p => ({ ...p, country: null, state: null })) }}
                    classes={`w-full px-4 py-3 bg-gray-900/50 rounded-xl border-2 ${errors.country ? 'border-red-500' : 'border-gray-700'} focus:outline-none focus:ring-2 focus:ring-orange-500 text-white transition-all`} />
                  {renderError('country')}
                </div>
                {formData.country && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">State/Province <span className="text-red-500">*</span></label>
                    <RegionDropdown country={formData.country} value={formData.state}
                      onChange={(val: string) => { setFormData(p => ({ ...p, state: val })); setErrors(p => ({ ...p, state: null })) }}
                      classes={`w-full px-4 py-3 bg-gray-900/50 rounded-xl border-2 ${errors.state ? 'border-red-500' : 'border-gray-700'} focus:outline-none focus:ring-2 focus:ring-orange-500 text-white transition-all`} />
                    {renderError('state')}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">City <span className="text-red-500">*</span></label>
                    <input type="text" name="city" value={formData.city} onChange={handleChange}
                      className={`w-full px-4 py-3 bg-gray-900/50 rounded-xl border-2 ${errors.city ? 'border-red-500' : 'border-gray-700'} focus:outline-none focus:ring-2 focus:ring-orange-500 text-white transition-all`}
                      placeholder="Your city" disabled={loading || isSubmitting} />
                    {renderError('city')}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Postal Code</label>
                    <input type="text" name="postalCode" value={formData.postalCode} onChange={handleChange}
                      className="w-full px-4 py-3 bg-gray-900/50 rounded-xl border-2 border-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 text-white transition-all"
                      placeholder="Postal / ZIP code" disabled={loading || isSubmitting} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Privacy */}
          {currentStep === 5 && (
            <div className="bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-700/50 overflow-hidden shadow-2xl">
              <div className="bg-linear-to-r from-orange-500/20 to-red-500/20 px-6 py-4 border-b border-gray-700/50">
                <h3 className="text-xl font-semibold text-white flex items-center gap-2">🛡️ Privacy Settings</h3>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Phone Number</label>
                  <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange}
                    className="w-full px-4 py-3 bg-gray-900/50 rounded-xl border-2 border-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 text-white transition-all"
                    placeholder="+1 234 567 8900" disabled={loading || isSubmitting} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Who can see your phone number? <span className="text-red-500">*</span></label>
                  <div className="space-y-2">
                    {PHONE_VISIBILITY_OPTIONS.map(opt => (
                      <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${formData.phoneNumberVisibility === opt.value ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 hover:border-gray-600'}`}>
                        <input type="radio" name="phoneNumberVisibility" value={opt.value} checked={formData.phoneNumberVisibility === opt.value} onChange={handleChange} className="hidden" />
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${formData.phoneNumberVisibility === opt.value ? 'border-orange-500 bg-orange-500' : 'border-gray-500'}`}>
                          {formData.phoneNumberVisibility === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <span className="text-white text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  {renderError('phoneNumberVisibility')}
                </div>
                <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-700 hover:border-gray-600 cursor-pointer transition-all">
                  <input type="checkbox" name="messagesFromPremiumOnly" checked={formData.messagesFromPremiumOnly} onChange={handleChange}
                    className="w-5 h-5 rounded border-gray-600 bg-gray-900 text-orange-500 focus:ring-orange-500" />
                  <div>
                    <span className="text-white font-medium">Premium messages only</span>
                    <p className="text-gray-400 text-xs mt-1">Only receive messages from premium users</p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* STEP 6: Profile Photo */}
          {currentStep === 6 && (
            <div className="bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-700/50 overflow-hidden shadow-2xl">
              <div className="bg-linear-to-r from-orange-500/20 to-red-500/20 px-6 py-4 border-b border-gray-700/50">
                <h3 className="text-xl font-semibold text-white flex items-center gap-2">📸 Profile Picture</h3>
                <p className="text-gray-400 text-sm mt-1">Optional — you can add one later</p>
              </div>
              <div className="p-6">
                <div className="flex flex-col items-center space-y-4">
                  {profilePicturePreview ? (
                    <div className="relative">
                      <img src={profilePicturePreview} alt="Profile preview" className="w-32 h-32 rounded-full object-cover border-4 border-orange-500 shadow-xl" />
                      <button type="button" onClick={() => { setProfilePicturePreview(null); setFormData(p => ({ ...p, profilePicture: null })) }}
                        className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg">✕</button>
                    </div>
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-linear-to-r from-gray-700 to-gray-800 flex items-center justify-center border-4 border-gray-600">
                      <span className="text-5xl">👤</span>
                    </div>
                  )}
                  <label className="cursor-pointer px-6 py-3 bg-linear-to-r from-orange-500 to-red-500 rounded-xl text-white font-semibold hover:shadow-lg transition-all hover:scale-105">
                    {profilePicturePreview ? '📸 Change Photo' : '📸 Upload Photo'}
                    <input type="file" accept="image/jpeg,image/png,image/jpg" onChange={handleFileChange} className="hidden" />
                  </label>
                  {isUploadingPhoto && <p className="text-orange-400 text-sm animate-pulse">📤 Uploading...</p>}
                  {renderError('profilePicture')}
                  {formData.profilePicture && <p className="text-green-500 text-sm">✅ Photo ready: {(formData.profilePicture.size / (1024 * 1024)).toFixed(2)}MB</p>}
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between gap-4 pb-8">
            {currentStep > 1 && (
              <button type="button" onClick={prevStep} disabled={loading || isSubmitting}
                className="flex-1 px-6 py-3 bg-gray-700 rounded-xl text-white font-semibold hover:bg-gray-600 transition-all disabled:opacity-50">← Back</button>
            )}
            {currentStep < steps.length ? (
              <button type="button" onClick={nextStep} disabled={loading || isSubmitting}
                className="flex-1 px-6 py-3 bg-linear-to-r from-orange-500 to-red-500 rounded-xl text-white font-semibold hover:shadow-lg transition-all hover:scale-105 disabled:opacity-50">Next Step →</button>
            ) : (
              <button type="button" onClick={handleFinalSubmit} disabled={loading || isSubmitting || networkStatus === 'offline'}
                className="flex-1 px-6 py-3 bg-linear-to-r from-orange-500 to-red-500 rounded-xl text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50">
                {loading || isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    Creating Account...
                  </span>
                ) : '🎉 Create Account'}
              </button>
            )}
          </div>

          <p className="text-center text-gray-400 pb-6">
            Already have an account?{' '}
            <Link href="/login" className="text-orange-500 hover:text-orange-400 font-semibold transition-colors">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Question {
  id: string
  question: string
  answer: string
  tags: string[]
}

interface Topic {
  id: string
  title: string
  description: string
  icon: string
  seoKeywords: string[]
  questions: Question[]
}

export const FAQ_TOPICS: Topic[] = [
  {
    id: 'getting-started',
    title: '🚀 Getting Started',
    description: 'New to our platform? Start here to learn the basics.',
    icon: '🚀',
    seoKeywords: ['beginner', 'tutorial', 'guide', 'basics', 'introduction'],
    questions: [
      { id: 'what-is-6tynine', question: 'What is 6tynine?', answer: '6tynine is a social platform that connects content creators, escorts, and their audiences through premium content, live streaming, and direct messaging. We provide a safe space for creators to monetize their content and build their communities.', tags: ['basics', 'platform', 'introduction'] },
      { id: 'how-to-create-account', question: 'How do I create an account?', answer: 'Click the "Register" button in the top navigation. You\'ll need a valid email address and username. After registration, verify your email to access all features.', tags: ['registration', 'account', 'signup'] },
      { id: 'is-it-free', question: 'Is the platform free to use?', answer: 'Yes, basic features are free! You can browse public posts, follow users, and create a profile without cost. Premium features like exclusive content, live streams, and messaging creators require subscription.', tags: ['pricing', 'free', 'subscription'] }
    ]
  },
  {
    id: 'account-management',
    title: '👤 Account & Profile',
    description: 'Manage your account settings and profile customization.',
    icon: '👤',
    seoKeywords: ['account', 'profile', 'settings', 'customization', 'management'],
    questions: [
      { id: 'change-profile-picture', question: 'How do I change my profile picture?', answer: 'Go to your profile page → Click "Edit Profile" → Click "Upload Profile Picture" → Select your image → Click "Save Changes". Supported formats: JPG, PNG, WebP (Max 5MB).', tags: ['profile', 'settings', 'picture', 'avatar'] },
      { id: 'reset-password', question: 'I forgot my password. How do I reset it?', answer: 'On the login page, click "Forgot Password". Enter your email address and we\'ll send reset instructions. Check your spam folder if you don\'t see the email within 5 minutes.', tags: ['security', 'password', 'recovery', 'login'] },
      { id: 'delete-account', question: 'How do I delete my account?', answer: 'Go to Settings → Account → "Delete Account". Note: This action is permanent and will remove all your posts, messages, and subscription data.', tags: ['account', 'deletion', 'privacy', 'settings'] }
    ]
  },
  {
    id: 'premium-content',
    title: '💎 Premium & Subscriptions',
    description: 'Everything about premium content, subscriptions, and payments.',
    icon: '💎',
    seoKeywords: ['premium', 'subscription', 'payment', 'monetization', 'exclusive'],
    questions: [
      { id: 'what-is-premium', question: 'What is premium content?', answer: 'Premium content is exclusive material from creators available only to subscribers. This includes special photos, videos, live streams, and direct messaging access.', tags: ['premium', 'content', 'exclusive', 'subscription'] },
      { id: 'subscribe-to-creator', question: 'How do I subscribe to a creator?', answer: 'Visit the creator\'s profile → Click "Subscribe" → Choose your plan (Weekly/Monthly/Yearly) → Complete payment via card or use your wallet balance.', tags: ['subscription', 'payment', 'creator', 'support'] },
      { id: 'cancel-subscription', question: 'How do I cancel my subscription?', answer: 'Go to your profile → Subscriptions → Find the creator → Click "Manage" → "Cancel Subscription". You\'ll have access until the end of your billing period.', tags: ['subscription', 'cancellation', 'payment', 'management'] },
      { id: 'subscription-pricing', question: 'How much do subscriptions cost?', answer: 'Prices are set by individual creators. Common ranges: Weekly ₦500-₦5,000, Monthly ₦2,000-₦20,000, Yearly ₦10,000-₦100,000. You\'ll see exact pricing on each creator\'s profile.', tags: ['pricing', 'subscription', 'cost', 'plans'] }
    ]
  },
  {
    id: 'similar-websites',
    title: '🌐 Similar Platforms',
    description: 'Learn about 6tynine compared to other similar platforms.',
    icon: '🌐',
    seoKeywords: ['onlyfans', 'comparison', 'alternatives', 'social media'],
    questions: [
      { id: 'website-like-onlyfans', question: 'Is 6tynine similar to OnlyFans?', answer: 'Yes, 6tynine offers similar features to OnlyFans with a focus on content creators and escorts. Our platform provides subscription-based content, direct messaging, and live streaming with better commission rates for creators and integrated payment for African users.', tags: ['onlyfans', 'comparison', 'platforms', 'alternatives'] },
      { id: 'meet-special-people', question: 'How can I meet special people on 6tynine?', answer: '6tynine offers multiple ways to connect: 1) Browse verified creator profiles 2) Use location-based search to find people nearby 3) Join live streams to interact in real-time 4) Subscribe to creators for exclusive access 5) Use direct messaging for private conversations.', tags: ['meet', 'special', 'people', 'connections'] },
      { id: 'ladies-phone-numbers', question: 'Can I get ladies phone numbers on 6tynine?', answer: 'Yes! Verified creators can choose to share their contact information through our secure system. Subscribe to a creator\'s premium content, build rapport through messaging, then use our secure number sharing system that protects both parties\' privacy.', tags: ['phone numbers', 'contacts', 'communication', 'privacy'] }
    ]
  },
  {
    id: 'live-streaming',
    title: '🎥 Live Streaming',
    description: 'Learn about our live streaming features and requirements.',
    icon: '🎥',
    seoKeywords: ['live', 'streaming', 'broadcast', 'video', 'real-time'],
    questions: [
      { id: 'go-live-requirements', question: 'What do I need to go live?', answer: 'To start a live stream: 1) Verified account 2) Working camera and microphone 3) Stable internet connection (minimum 5Mbps upload) 4) Chrome/Firefox/Safari browser.', tags: ['live', 'requirements', 'setup', 'technical'] },
      { id: 'join-live-stream', question: 'How do I join a live stream?', answer: 'When a creator is live, you\'ll see a "Join Live" button on their profile. Public streams are free to join. Premium streams require subscription.', tags: ['live', 'viewing', 'stream', 'participation'] },
      { id: 'live-stream-rules', question: 'What are the rules for live streaming?', answer: '1) No illegal content 2) Respect copyright laws 3) No harassment or hate speech 4) Age-restricted content must be marked 5) Follow community guidelines. Violations may result in suspension.', tags: ['rules', 'live', 'guidelines', 'compliance'] }
    ]
  },
  {
    id: 'payments-earnings',
    title: '💰 Payments & Earnings',
    description: 'Information about payments, withdrawals, and creator earnings.',
    icon: '💰',
    seoKeywords: ['payment', 'earnings', 'payout', 'money', 'withdrawal'],
    questions: [
      { id: 'payment-methods', question: 'What payment methods do you accept?', answer: 'We accept: 1) Kora (cards & bank transfers) 2) Wallet balance. All transactions are secured with SSL encryption.', tags: ['payment', 'security', 'methods', 'banking'] },
      { id: 'creator-earnings', question: 'How do creators earn money?', answer: 'Creators earn through: 1) Subscription fees (70% goes to creator) 2) Tips during live streams 3) Pay-per-view content 4) Private messages. Payouts are processed weekly.', tags: ['earnings', 'creators', 'monetization', 'income'] },
      { id: 'request-payout', question: 'How do creators request payouts?', answer: 'Go to your profile → Click "Request Payout" → Enter amount → Confirm bank details → Submit request. Minimum withdrawal: ₦100. Processing time: 3-5 business days.', tags: ['payout', 'withdrawal', 'money', 'earnings'] },
      { id: 'transaction-fees', question: 'Are there any transaction fees?', answer: 'We charge a 30% platform fee on all transactions. This covers payment processing, platform maintenance, and customer support. Creators receive 70% of subscription revenue.', tags: ['fees', 'transactions', 'commission', 'pricing'] }
    ]
  },
  {
    id: 'privacy-safety',
    title: '🔒 Privacy & Safety',
    description: 'Your privacy and safety are our top priority.',
    icon: '🔒',
    seoKeywords: ['privacy', 'safety', 'security', 'data', 'protection'],
    questions: [
      { id: 'data-protection', question: 'How is my data protected?', answer: 'We use: 1) End-to-end encryption for messages 2) Secure HTTPS connections 3) Regular security audits 4) GDPR compliance 5) Data anonymization for analytics.', tags: ['data', 'protection', 'security', 'encryption'] },
      { id: 'secure-phone-sharing', question: 'How does secure phone number sharing work?', answer: 'Our secure phone sharing system: 1) Both parties must be verified 2) Numbers are masked initially 3) You can request to reveal numbers 4) Accept/decline requests 5) All shared numbers are encrypted 6) You can revoke access anytime.', tags: ['phone numbers', 'security', 'privacy', 'contacts', 'sharing'] },
      { id: 'report-content', question: 'How do I report inappropriate content?', answer: 'Click the three-dot menu on any post or profile and select "Report". Our moderation team reviews reports promptly.', tags: ['report', 'inappropriate', 'moderation', 'safety'] },
      { id: 'block-users', question: 'How do I block or report a user?', answer: 'Go to the user\'s profile → Click three dots (⋯) → Select "Block User" or "Report User". Blocked users cannot message you or see your content.', tags: ['block', 'safety', 'users', 'moderation'] },
      { id: 'age-restrictions', question: 'Are there age restrictions?', answer: 'Yes, you must be 18+ to use our platform. Age verification is required for certain content. We use AI and manual review to enforce age restrictions.', tags: ['age', 'restrictions', 'verification', 'compliance'] }
    ]
  },
  {
    id: 'technical-support',
    title: '🛠️ Technical Support',
    description: 'Get help with technical issues and troubleshooting.',
    icon: '🛠️',
    seoKeywords: ['technical', 'support', 'troubleshooting', 'help', 'issues'],
    questions: [
      { id: 'browser-support', question: 'Which browsers are supported?', answer: 'We support: Chrome (v80+), Firefox (v75+), Safari (v13+), Edge (v80+). For best experience, keep your browser updated and enable JavaScript.', tags: ['technical', 'browser', 'compatibility', 'system'] },
      { id: 'mobile-app', question: 'Is there a mobile app?', answer: 'Yes! Our Progressive Web App (PWA) works on all devices. On mobile: Open our site in Chrome/Safari → Tap "Add to Home Screen" → Launch like a native app.', tags: ['mobile', 'app', 'pwa', 'download'] },
      { id: 'notifications', question: 'Why am I not receiving notifications?', answer: 'Check: 1) Browser notification permissions 2) Internet connection 3) Notification settings in your profile 4) Spam/junk folder for emails.', tags: ['notifications', 'technical', 'alerts', 'settings'] },
      { id: 'upload-issues', question: 'Having trouble uploading content?', answer: 'Ensure: 1) File size under 100MB 2) Supported formats (JPG, PNG, MP4, WebM) 3) Stable internet connection 4) Try clearing browser cache if issues persist.', tags: ['upload', 'technical', 'issues', 'troubleshooting'] }
    ]
  }
]

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function BlogClient(_props?: { initialTopics?: unknown[] }) {
  const [activeTopic, setActiveTopic] = useState<string | null>(null)

  return (
    <div className="w-full max-w-2xl mx-auto pb-20 pt-4 px-4">
      <div className="text-center mb-8">
        <h1 className="text-white text-3xl font-bold mb-2">Help Center & Blog</h1>
        <p className="text-gray-400 text-sm">Everything you need to know about 6tynine</p>
      </div>

      <div className="space-y-3">
        {FAQ_TOPICS.map(topic => (
          <Link
            key={topic.id}
            href={`/blog/topic/${topic.id}`}
            className={`block w-full p-4 rounded-2xl transition-all duration-300 border ${
              activeTopic === topic.id
                ? 'bg-linear-to-r from-orange-500 to-purple-600 border-orange-500 shadow-lg scale-[1.02]'
                : 'bg-gray-800/50 border-gray-700 hover:bg-gray-700/50 hover:border-gray-600'
            }`}
            onMouseEnter={() => setActiveTopic(topic.id)}
            onMouseLeave={() => setActiveTopic(null)}
          >
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${activeTopic === topic.id ? 'bg-white/20' : 'bg-gray-700'}`}>
                <span className="text-2xl">{topic.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-bold text-base mb-1">{topic.title}</h3>
                <p className={`text-sm ${activeTopic === topic.id ? 'text-white/90' : 'text-gray-400'}`}>{topic.description}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${activeTopic === topic.id ? 'bg-white/20 text-white' : 'bg-gray-700 text-gray-300'}`}>
                    {topic.questions.length} question{topic.questions.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-gray-500 text-xs">{topic.seoKeywords.slice(0, 2).map(k => `#${k}`).join(' ')}</span>
                </div>
              </div>
              <svg className={`w-5 h-5 shrink-0 transition-transform ${activeTopic === topic.id ? 'text-white rotate-90' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-10 bg-linear-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-2xl p-6 text-center">
        <h3 className="text-white font-bold text-lg mb-2">Still have questions?</h3>
        <p className="text-gray-400 text-sm mb-4">Check the FAQ or send us a message.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/faq" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition">Browse FAQ</Link>
          <Link href="/chat" className="px-4 py-2 bg-linear-to-r from-orange-500 to-red-500 text-white rounded-xl text-sm font-medium transition">Contact Support</Link>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'

interface FAQItem {
  question: string
  answer: string
  category: string
  keywords: string[]
}

const FAQ_DATA: FAQItem[] = [
  { question: "How do I create a post?", answer: "To create a post, click the 'Create Post' button on your profile or the homepage. You can add text, images, and videos. Posts must include at least one image or video. Use @username to mention other users and #hashtag for discoverability.", category: "posts", keywords: ["create", "post", "upload", "images", "videos", "content"] },
  { question: "What's the difference between normal and premium posts?", answer: "Normal posts are visible to all users, while premium posts are exclusive content only available to subscribers. Creators can monetize their premium content by setting subscription prices for weekly, monthly, or yearly access.", category: "premium", keywords: ["premium", "subscription", "exclusive", "content", "monetize", "paid"] },
  { question: "How do subscriptions work?", answer: "Subscriptions allow you to access a creator's premium content. You can subscribe weekly, monthly, or yearly. Subscription payments can be made via card or using your wallet balance. Subscriptions automatically renew unless cancelled.", category: "premium", keywords: ["subscribe", "payment", "renew", "cancel", "wallet", "subscription"] },
  { question: "How do I go live?", answer: "To start a live stream, click the 'Go Live' button on your profile. Choose your stream visibility (public or premium-only), and you'll be able to broadcast to your followers/subscribers. Live streams are recorded and saved as premium posts automatically.", category: "live", keywords: ["live", "stream", "broadcast", "record", "webcam", "streaming"] },
  { question: "How do I search for content?", answer: "Use the search bar at the top of any page. You can search for #hashtags, @usernames, cities, or countries. For location-based searches, enable location services for better results.", category: "search", keywords: ["search", "hashtag", "username", "location", "find", "discover"] },
  { question: "What does the location feature do?", answer: "The location feature helps personalize your feed: First 20 posts show newest content, then 70% local content from your selected country and 30% global content. It also improves search results for local users and content.", category: "location", keywords: ["location", "local", "country", "city", "personalize", "feed"] },
  { question: "How do I follow other users?", answer: "Visit a user's profile and click the 'Follow' button. You'll see their posts in your 'Following' feed. To unfollow, click 'Unfollow' on their profile. Following is free and doesn't require subscription.", category: "social", keywords: ["follow", "unfollow", "following", "profile", "connect", "users"] },
  { question: "How do I message other users?", answer: "Click the chat icon on a user's profile or go to the Messages page. Some creators only allow messages from premium subscribers — you'll see a subscription prompt in this case.", category: "chat", keywords: ["message", "chat", "dm", "conversation", "talk", "messaging"] },
  { question: "How do I set my phone number visibility?", answer: "In your profile settings, you can choose who sees your phone number: 'All Users', 'Subscribers Only', 'Followers Only', or 'Hide Phone Number'. This helps control your privacy while allowing connections.", category: "privacy", keywords: ["phone", "number", "privacy", "visibility", "contact", "settings"] },
  { question: "What are the different user types?", answer: "There are three user types: 'Content Creator' (focus on content creation), 'Escort' (entertainment services), and 'Both'. Your user type helps others understand your profile's purpose and content focus.", category: "profile", keywords: ["user type", "content creator", "escort", "profile", "category", "account"] },
  { question: "How do I request a payout?", answer: "From your profile, click 'Request Payout'. Enter the amount (must be within your available balance) and ensure your bank details are set up. Payouts are processed manually and may take 3-5 business days.", category: "earnings", keywords: ["payout", "withdraw", "money", "earnings", "bank", "payment"] },
  { question: "What are admin posts?", answer: "Admin posts are sponsored content from verified administrators. They have golden badges (🏅 ADMIN SPONSOR ADS) and may appear in your feed. These posts support platform operations while providing value to users.", category: "platform", keywords: ["admin", "sponsored", "badge", "verified", "ads", "content"] },
  { question: "How do notifications work?", answer: "You'll receive browser notifications for new messages, likes, comments, and followers. Enable notifications when prompted or in browser settings. Notifications help you stay engaged with your community.", category: "notifications", keywords: ["notifications", "alerts", "messages", "likes", "browser", "alerts"] },
  { question: "What's the difference between followers and subscribers?", answer: "Followers see your public posts for free. Subscribers pay to access your premium content and may get additional perks like messaging access. You can have both followers and subscribers simultaneously.", category: "social", keywords: ["followers", "subscribers", "difference", "free", "paid", "audience"] },
  { question: "How do I edit or delete my posts?", answer: "On your own posts, you'll see edit and delete options (three-dot menu). Editing allows you to update text, images, or videos. Deletion permanently removes the post. You can only edit/delete your own content.", category: "posts", keywords: ["edit", "delete", "remove", "update", "manage", "content"] },
  { question: "What are the system requirements?", answer: "Works on all modern browsers (Chrome, Firefox, Safari, Edge) on desktop and mobile. For live streaming, you need a camera and microphone. Video playback works on all devices with HTML5 support.", category: "technical", keywords: ["requirements", "browser", "mobile", "desktop", "compatibility", "system"] },
  { question: "How do I report inappropriate content?", answer: "Click the three-dot menu on any post or profile and select 'Report'. Our moderation team reviews reports promptly. You can also contact admin via WhatsApp for urgent issues.", category: "safety", keywords: ["report", "inappropriate", "moderation", "safety", "abuse", "content"] },
  { question: "Can I use the platform anonymously?", answer: "Yes! You can browse public content without logging in. To post, follow, or chat, you need an account. Your profile information is controlled by you — share only what you're comfortable with.", category: "privacy", keywords: ["anonymous", "browse", "public", "account", "privacy", "security"] },
  { question: "How does boosting a post work?", answer: "Post boosting increases visibility of your content. Choose Daily (₦3,000), Weekly (₦7,000), or Monthly (₦20,000) boost durations. Target by global audience, country, city, or followers. Boosted posts appear at the top of feeds.", category: "platform", keywords: ["boost", "promote", "visibility", "sponsor", "advertise", "reach"] },
  { question: "What is leak content?", answer: "Leak content is premium media (videos/photos) available for one-time purchase. Unlike subscriptions which give ongoing access, leak purchases are per-item. Free leaks are available to all users.", category: "premium", keywords: ["leaks", "purchase", "buy", "media", "video", "photos", "one-time"] },
]

const CATEGORIES = [
  { id: 'all', label: 'All', icon: '📚' },
  { id: 'posts', label: 'Posts', icon: '📝' },
  { id: 'premium', label: 'Premium', icon: '⭐' },
  { id: 'live', label: 'Live', icon: '🎥' },
  { id: 'social', label: 'Social', icon: '👥' },
  { id: 'privacy', label: 'Privacy', icon: '🔒' },
  { id: 'technical', label: 'Tech', icon: '⚙️' },
  { id: 'earnings', label: 'Earnings', icon: '💰' },
  { id: 'platform', label: 'Platform', icon: '🌐' },
]

export default function FAQClient() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const faqRefs = useRef<(HTMLDivElement | null)[]>([])

  const filteredFaqs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return FAQ_DATA.filter(faq => {
      const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory
      if (!q) return matchesCategory
      const matchesSearch =
        faq.question.toLowerCase().includes(q) ||
        faq.answer.toLowerCase().includes(q) ||
        faq.keywords.some(k => k.toLowerCase().includes(q))
      return matchesCategory && matchesSearch
    })
  }, [searchQuery, selectedCategory])

  const toggleFAQ = (index: number) => {
    const newIndex = activeIndex === index ? null : index
    setActiveIndex(newIndex)
    if (newIndex !== null && faqRefs.current[index]) {
      setTimeout(() => faqRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto pb-20 pt-4 px-4">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-white text-3xl font-bold mb-2">Frequently Asked Questions</h1>
        <p className="text-gray-400 text-sm">Find answers to common questions about 6tynine platform.</p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setActiveIndex(null) }}
          placeholder="Search questions..."
          className="w-full bg-gray-800/70 border border-gray-700 rounded-2xl pl-12 pr-12 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Category filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setSelectedCategory(cat.id); setActiveIndex(null) }}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition border ${
              selectedCategory === cat.id
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-gray-800/50 text-gray-400 border-gray-700 hover:border-gray-500'
            }`}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Results count */}
      {(searchQuery || selectedCategory !== 'all') && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-gray-400 text-sm">{filteredFaqs.length} question{filteredFaqs.length !== 1 ? 's' : ''} found</p>
          <button
            onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setActiveIndex(null) }}
            className="text-orange-400 text-sm hover:text-orange-300 transition"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* FAQ Accordion */}
      {filteredFaqs.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-gray-400">No questions found. Try a different search term.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFaqs.map((faq, index) => (
            <div
              key={index}
              ref={(el) => { faqRefs.current[index] = el }}
              className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700/50 overflow-hidden transition-all duration-200 hover:border-gray-600"
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full p-4 text-left flex items-center justify-between gap-3"
              >
                <span className="text-white font-medium leading-snug">{faq.question}</span>
                <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 ${activeIndex === index ? 'bg-orange-500 rotate-180' : 'bg-gray-700'}`}>
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>

              {activeIndex === index && (
                <div className="px-4 pb-4">
                  <div className="border-t border-gray-700/50 pt-4">
                    <p className="text-gray-300 text-sm leading-relaxed">{faq.answer}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {faq.keywords.slice(0, 5).map(k => (
                        <span key={k} className="text-xs text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded-full">#{k}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Still need help */}
      <div className="mt-12 bg-linear-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-2xl p-6 text-center">
        <h3 className="text-white font-bold text-lg mb-2">Still need help?</h3>
        <p className="text-gray-400 text-sm mb-4">Can't find your answer? Browse our blog or start a chat.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/blog" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition">Browse Blog</Link>
          <Link href="/chat" className="px-4 py-2 bg-linear-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl text-sm font-medium transition">Contact Support</Link>
        </div>
      </div>
    </div>
  )
}

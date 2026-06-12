'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FAQ_TOPICS } from './BlogClient'

interface Props {
  topicId: string
  initialTopic?: unknown
}

export default function BlogTopicClient({ topicId }: Props) {
  const router = useRouter()

  const topic = useMemo(() => FAQ_TOPICS.find(t => t.id === topicId) || null, [topicId])

  const [openIds, setOpenIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!topic) { router.push('/blog'); return }
    if (topic.questions.length > 0) {
      setOpenIds([topic.questions[0].id])
    }
  }, [topic, router])

  const filteredQuestions = useMemo(() => {
    if (!topic) return []
    if (!searchQuery.trim()) return topic.questions
    const q = searchQuery.toLowerCase()
    return topic.questions.filter(question =>
      question.question.toLowerCase().includes(q) ||
      question.answer.toLowerCase().includes(q) ||
      question.tags.some(tag => tag.toLowerCase().includes(q))
    )
  }, [searchQuery, topic])

  useEffect(() => {
    if (searchQuery.trim() && filteredQuestions.length > 0) {
      setOpenIds(filteredQuestions.map(q => q.id))
    }
  }, [searchQuery, filteredQuestions])

  const toggleQuestion = (id: string) => {
    setOpenIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  if (!topic) {
    return (
      <div className="w-full max-w-2xl mx-auto flex items-center justify-center pt-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-white text-sm">Loading topic...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto pb-20 pt-4 px-4">
      {/* Back */}
      <div className="mb-4">
        <Link href="/blog" className="flex items-center gap-2 text-orange-500 hover:text-orange-400 transition text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Topics
        </Link>
      </div>

      {/* Topic header */}
      <div className="bg-linear-to-r from-gray-800 to-gray-900 rounded-2xl p-4 border border-gray-700 shadow-lg mb-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 bg-linear-to-r from-orange-500 to-purple-600 rounded-full flex items-center justify-center shrink-0">
            <span className="text-xl">{topic.icon}</span>
          </div>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl mb-1">{topic.title}</h1>
            <p className="text-gray-300 text-sm">{topic.description}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-medium">{topic.questions.length} questions</span>
          <span className="text-gray-400 text-xs">{topic.seoKeywords.slice(0, 2).map(k => `#${k}`).join(' ')}</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={`Search ${topic.title}...`}
          className="w-full bg-gray-900/70 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500 transition"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition">✕</button>
        )}
      </div>

      {/* Questions */}
      {filteredQuestions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No questions found for "{searchQuery}"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQuestions.map(question => (
            <div
              key={question.id}
              id={`question-${question.id}`}
              className={`bg-gray-800/50 rounded-2xl border overflow-hidden transition-all duration-200 ${openIds.includes(question.id) ? 'border-orange-500/30' : 'border-gray-700/50 hover:border-gray-600'}`}
            >
              <button
                onClick={() => toggleQuestion(question.id)}
                className="w-full p-4 text-left flex items-center justify-between gap-3"
              >
                <span className="text-white font-medium leading-snug text-sm">{question.question}</span>
                <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 ${openIds.includes(question.id) ? 'bg-orange-500 rotate-180' : 'bg-gray-700'}`}>
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>
              {openIds.includes(question.id) && (
                <div className="px-4 pb-4">
                  <div className="border-t border-gray-700/50 pt-3">
                    <p className="text-gray-300 text-sm leading-relaxed">{question.answer}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {question.tags.map(tag => (
                        <span key={tag} className="text-xs text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded-full">#{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex gap-3">
        {FAQ_TOPICS.findIndex(t => t.id === topicId) > 0 && (
          <Link href={`/blog/topic/${FAQ_TOPICS[FAQ_TOPICS.findIndex(t => t.id === topicId) - 1].id}`} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-medium text-center transition border border-gray-700">
            ← Previous Topic
          </Link>
        )}
        {FAQ_TOPICS.findIndex(t => t.id === topicId) < FAQ_TOPICS.length - 1 && (
          <Link href={`/blog/topic/${FAQ_TOPICS[FAQ_TOPICS.findIndex(t => t.id === topicId) + 1].id}`} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-medium text-center transition border border-gray-700">
            Next Topic →
          </Link>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { MessageCircle, ChevronRight, Award, Clock } from 'lucide-react'
import { useDoctorsPortal } from '@/components/doctors/layout/portal-context'
import { fetchApi } from '@/lib/api-client'

interface CommunityQuestion {
  id: string
  title: string | null
  content: string
  author_display_name: string | null
  created_at: string
  comment_count: number
  tags: string[]
}

interface PostsResponse {
  posts: CommunityQuestion[]
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'hace un momento'
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `hace ${days}d`
  const months = Math.floor(days / 30)
  return `hace ${months}mes${months > 1 ? 'es' : ''}`
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '...'
}

export function CommunityQuestionsWidget() {
  const [questions, setQuestions] = useState<CommunityQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { setActiveSection, setActivePostId } = useDoctorsPortal()

  const fetchQuestions = useCallback(async () => {
    try {
      const result = await fetchApi<PostsResponse>('/api/doctors/community/posts?limit=10')
      const needsAttention = (result.posts ?? [])
        .filter((p) => p.comment_count < 3)
        .slice(0, 5)
      setQuestions(needsAttention)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  if (loading) {
    return (
      <div className="bg-white border border-am-surface-200 rounded-xl shadow-am-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 am-skeleton rounded" />
          <div className="h-5 w-48 am-skeleton rounded" />
        </div>
        <div className="h-16 am-skeleton rounded-lg" />
        <div className="h-16 am-skeleton rounded-lg" />
      </div>
    )
  }

  if (error) return null

  return (
    <div className="bg-white border border-am-surface-200 rounded-xl shadow-am-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-am-surface-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-am-doctor-600" />
            <h3 className="font-medium text-am-surface-900">Preguntas de la comunidad</h3>
            {questions.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full bg-am-doctor-100 text-am-doctor-700">
                {questions.length}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <Award className="w-3.5 h-3.5 text-amber-500" />
          <p className="text-xs text-am-surface-500">Cada respuesta suma puntos a tu ranking</p>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <MessageCircle className="w-7 h-7 text-am-surface-300 mx-auto mb-2" />
          <p className="text-sm text-am-surface-500">No hay preguntas pendientes</p>
        </div>
      ) : (
        <div className="divide-y divide-am-surface-100">
          {questions.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => { setActivePostId(q.id); setActiveSection('community'); }}
              className="w-full px-4 py-3 text-left hover:bg-am-surface-50 transition-colors"
            >
              <p className="text-sm font-medium text-am-surface-900 leading-snug">
                {truncate(q.title ?? q.content, 70)}
              </p>
              <div className="flex items-center justify-between mt-1.5">
                <div className="flex items-center gap-2 text-xs text-am-surface-400">
                  <span className={q.author_display_name ? 'font-medium text-am-surface-600' : 'italic'}>
                    {q.author_display_name ?? 'Anónimo'}
                  </span>
                  <span className="text-am-surface-300">•</span>
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {timeAgo(q.created_at)}
                  </span>
                  <span className="text-am-surface-300">•</span>
                  <span>
                    {q.comment_count === 0 ? 'Sin respuestas' : `${q.comment_count} resp.`}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {questions.length > 0 && (
        <div className="px-4 py-2.5 border-t border-am-surface-100 text-center">
          <button
            type="button"
            onClick={() => setActiveSection('community')}
            className="inline-flex items-center gap-1 text-xs font-medium text-am-doctor-600 hover:text-am-doctor-700 hover:underline"
          >
            Ver todas las preguntas
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

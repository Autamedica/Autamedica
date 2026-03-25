'use client'

import { useEffect, useState } from 'react'
import { useCommunity } from '@/hooks/patients/useCommunity'
import type { CommunityGroup } from '@/hooks/patients/useCommunity'
import {
  Heart,
  MessageCircle,
  Eye,
  Plus,
  Send,
  Users,
  X,
  Loader2,
} from 'lucide-react'
import BottomNav from '@/components/patients/layout/BottomNav'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}sem`
}

export default function CommunityPage() {
  const { groups, posts, loading, error, loadGroups, loadPosts, createPost, addReaction } = useCommunity()
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [showNewPost, setShowNewPost] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadGroups() }, [loadGroups])
  useEffect(() => { loadPosts({ limit: 20 }) }, [loadPosts])

  const filteredPosts = activeGroup
    ? posts.filter(p => p.group_id === activeGroup)
    : posts

  async function handleSubmit() {
    if (!newContent.trim() || !activeGroup) return
    setSubmitting(true)
    try {
      await createPost({
        groupId: activeGroup,
        content: newContent.trim(),
        title: newTitle.trim() || undefined,
        anonymous: isAnonymous,
      })
      setNewTitle('')
      setNewContent('')
      setIsAnonymous(false)
      setShowNewPost(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReaction(postId: string) {
    await addReaction({ postId, reactionType: 'like' })
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--au-bg)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-30 backdrop-blur-xl"
        style={{
          background: 'rgba(9, 9, 11, 0.85)',
          borderBottom: '1px solid var(--au-border)',
        }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--au-text-primary)' }}>
              Comunidad
            </h1>
            <p className="text-xs" style={{ color: 'var(--au-text-tertiary)' }}>
              Conectá con otros pacientes
            </p>
          </div>
          {activeGroup && (
            <button
              type="button"
              onClick={() => setShowNewPost(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-90"
              style={{ background: 'var(--au-accent)', color: 'var(--au-bg)' }}
              aria-label="Crear publicación"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-28 pt-4">
        {/* Group chips */}
        {groups.length > 0 && (
          <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              type="button"
              onClick={() => setActiveGroup(null)}
              className="shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors"
              style={{
                background: !activeGroup ? 'var(--au-accent)' : 'var(--au-surface)',
                color: !activeGroup ? 'var(--au-bg)' : 'var(--au-text-secondary)',
                border: `1px solid ${!activeGroup ? 'transparent' : 'var(--au-border)'}`,
              }}
            >
              Todos
            </button>
            {groups.map((g: CommunityGroup) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveGroup(g.id)}
                className="shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors"
                style={{
                  background: activeGroup === g.id ? 'var(--au-accent)' : 'var(--au-surface)',
                  color: activeGroup === g.id ? 'var(--au-bg)' : 'var(--au-text-secondary)',
                  border: `1px solid ${activeGroup === g.id ? 'transparent' : 'var(--au-border)'}`,
                }}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--au-accent)' }} />
            <p className="text-sm" style={{ color: 'var(--au-text-tertiary)' }}>Cargando comunidad...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="rounded-xl p-4 text-sm"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--au-danger)' }}
          >
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredPosts.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Users className="h-12 w-12" style={{ color: 'var(--au-text-tertiary)' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--au-text-primary)' }}>
                {activeGroup ? 'Sin publicaciones en este grupo' : 'La comunidad está vacía'}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--au-text-tertiary)' }}>
                {activeGroup ? 'Sé el primero en compartir' : 'Seleccioná un grupo para empezar'}
              </p>
            </div>
            {activeGroup && (
              <button
                type="button"
                onClick={() => setShowNewPost(true)}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform active:scale-95"
                style={{ background: 'var(--au-accent)', color: 'var(--au-bg)' }}
              >
                Crear publicación
              </button>
            )}
          </div>
        )}

        {/* Post feed */}
        <div className="space-y-3">
          {filteredPosts.map((post) => (
            <article
              key={post.id}
              className="rounded-2xl p-4"
              style={{
                background: 'var(--au-surface)',
                border: '1px solid var(--au-border)',
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: post.is_anonymous ? 'var(--au-hover)' : 'var(--au-accent-soft)',
                    color: post.is_anonymous ? 'var(--au-text-tertiary)' : 'var(--au-accent)',
                  }}
                >
                  {post.is_anonymous ? '?' : (post.author_display_name ?? 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium" style={{ color: 'var(--au-text-primary)' }}>
                    {post.is_anonymous ? 'Anónimo' : (post.author_display_name ?? 'Usuario')}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--au-text-tertiary)' }}>
                    {timeAgo(post.created_at)}
                    {post.group && ` · ${post.group.name}`}
                  </p>
                </div>
              </div>

              {post.title && (
                <h3 className="mb-1 text-sm font-semibold" style={{ color: 'var(--au-text-primary)' }}>
                  {post.title}
                </h3>
              )}
              <p className="text-sm leading-relaxed" style={{ color: 'var(--au-text-secondary)' }}>
                {post.content.length > 200 ? `${post.content.slice(0, 200)}…` : post.content}
              </p>

              {post.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full px-2 py-0.5 text-[10px]"
                      style={{ background: 'var(--au-hover)', color: 'var(--au-text-tertiary)' }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => handleReaction(post.id)}
                  className="flex items-center gap-1.5 text-xs transition-colors"
                  style={{ color: 'var(--au-text-tertiary)' }}
                >
                  <Heart className="h-4 w-4" />
                  {post.reaction_count > 0 && post.reaction_count}
                </button>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--au-text-tertiary)' }}>
                  <MessageCircle className="h-4 w-4" />
                  {post.comment_count > 0 && post.comment_count}
                </span>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--au-text-tertiary)' }}>
                  <Eye className="h-4 w-4" />
                  {post.view_count}
                </span>
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* New Post Modal */}
      {showNewPost && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowNewPost(false)} />
          <div
            className="relative w-full max-w-lg rounded-t-3xl p-6 sm:rounded-3xl"
            style={{
              background: 'var(--au-surface)',
              border: '1px solid var(--au-border)',
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold" style={{ color: 'var(--au-text-primary)' }}>
                Nueva publicación
              </h2>
              <button
                type="button"
                onClick={() => setShowNewPost(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{ color: 'var(--au-text-tertiary)' }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <input
              type="text"
              placeholder="Título (opcional)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="mb-3 w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{
                background: 'var(--au-hover)',
                color: 'var(--au-text-primary)',
                border: '1px solid var(--au-border)',
              }}
            />
            <textarea
              placeholder="¿Qué querés compartir?"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              className="mb-3 w-full resize-none rounded-xl px-4 py-3 text-sm outline-none"
              style={{
                background: 'var(--au-hover)',
                color: 'var(--au-text-primary)',
                border: '1px solid var(--au-border)',
              }}
            />

            <div className="mb-4 flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: 'var(--au-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                Publicar anónimamente
              </label>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!newContent.trim() || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-transform active:scale-95 disabled:opacity-50"
              style={{ background: 'var(--au-accent)', color: 'var(--au-bg)' }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Publicando...' : 'Publicar'}
            </button>
          </div>
        </div>
      )}

      <BottomNav activeTab="comunidad" />
    </div>
  )
}

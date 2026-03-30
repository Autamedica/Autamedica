'use client';

import BottomNav from '@/components/patients/layout/BottomNav';
import { usePatientCommunityPage } from '@/hooks/patients/usePatientCommunityPage';
import type { CommunityGroup, CommunityPost } from '@/lib/patients/types/community';
import {
  ChevronLeft,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}sem`;
}

function PostCard({
  post,
  onReact,
}: {
  post: CommunityPost;
  onReact: (postId: string) => Promise<void>;
}) {
  const [reacting, setReacting] = useState(false);

  async function handleReact() {
    setReacting(true);
    try { await onReact(post.id); } finally { setReacting(false); }
  }

  return (
    <article className="rounded-2xl border border-stone-100 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-700">
          {post.is_anonymous ? '?' : (post.author_display_name ?? 'P').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-stone-900 truncate">
              {post.is_anonymous ? 'Anonimo' : post.author_display_name ?? 'Paciente'}
            </span>
            <span className="text-xs text-stone-400">{timeAgo(post.created_at)}</span>
            <span className="ml-auto rounded-full bg-stone-50 px-2 py-0.5 text-[10px] font-medium text-stone-500">
              {post.group?.name ?? 'General'}
            </span>
          </div>

          {post.title && (
            <h3 className="mt-2 text-base font-semibold text-stone-900">{post.title}</h3>
          )}

          <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
            {post.content.length > 280 ? `${post.content.slice(0, 280)}...` : post.content}
          </p>

          {post.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-4 text-xs text-stone-400">
            <button
              type="button"
              onClick={handleReact}
              disabled={reacting}
              className="inline-flex items-center gap-1 font-medium hover:text-emerald-600 disabled:opacity-50"
            >
              {reacting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Heart className="h-3.5 w-3.5" />}
              {post.reaction_count}
            </button>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" /> {post.comment_count}
            </span>
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" /> {post.view_count}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function CommunityPage() {
  const {
    displayName: _displayName,
    loading,
    primaryError,
    activeGroupId,
    setActiveGroupId,
    sortBy,
    setSortBy,
    groups,
    memberships,
    posts,
    recommendedGroups,
    promptSuggestions,
    createPost,
    reactToPost,
  } = usePatientCommunityPage();

  const [showComposer, setShowComposer] = useState(false);
  const [composerGroupId, setComposerGroupId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const membershipSet = useMemo(
    () => new Set(memberships.map((m) => m.group_id)),
    [memberships],
  );

  function openComposer(input?: { groupId?: string; content?: string }) {
    setComposerGroupId(input?.groupId ?? activeGroupId ?? recommendedGroups[0]?.id ?? groups[0]?.id ?? '');
    setNewContent(input?.content ?? '');
    setNewTitle('');
    setIsAnonymous(false);
    setShowComposer(true);
  }

  async function handleSubmitPost() {
    if (!composerGroupId || !newContent.trim()) return;
    setSubmitting(true);
    try {
      await createPost({
        groupId: composerGroupId,
        title: newTitle.trim() || undefined,
        content: newContent.trim(),
        anonymous: isAnonymous,
      });
      setShowComposer(false);
      setNewTitle('');
      setNewContent('');
      setIsAnonymous(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="flex min-h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
        <BottomNav activeTab="comunidad" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-stone-100 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <a href="/" className="rounded-xl border border-stone-200 p-2 text-stone-500 hover:text-stone-700">
              <ChevronLeft className="h-4 w-4" />
            </a>
            <h1 className="text-lg font-bold">Comunidad</h1>
          </div>
          <button
            type="button"
            onClick={() => openComposer()}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Publicar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-4">
        {primaryError && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{primaryError}</div>
        )}

        {/* Groups — horizontal scroll chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveGroupId(null)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              activeGroupId === null ? 'bg-emerald-600 text-white' : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            Todos
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setActiveGroupId(group.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                activeGroupId === group.id
                  ? 'bg-emerald-600 text-white'
                  : membershipSet.has(group.id)
                    ? 'bg-stone-900 text-white'
                    : 'bg-white text-stone-600 border border-stone-200'
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>

        {/* Recommended groups (if any, compact) */}
        {recommendedGroups.length > 0 && !activeGroupId && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Sugeridos para vos</p>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
              {recommendedGroups.slice(0, 3).map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroupId(group.id)}
                  className="shrink-0 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-left w-56"
                >
                  <p className="text-sm font-semibold text-stone-900 truncate">{group.name}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-stone-500">
                    <Users className="h-3 w-3" /> {group.member_count}
                    <MessageCircle className="h-3 w-3 ml-1" /> {group.post_count}
                  </div>
                  {group.reason && (
                    <p className="mt-1.5 text-xs text-emerald-700 truncate">{group.reason}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sort */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSortBy('recent')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sortBy === 'recent' ? 'bg-stone-900 text-white' : 'bg-white text-stone-500 border border-stone-200'
            }`}
          >
            Recientes
          </button>
          <button
            type="button"
            onClick={() => setSortBy('popular')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sortBy === 'popular' ? 'bg-stone-900 text-white' : 'bg-white text-stone-500 border border-stone-200'
            }`}
          >
            Populares
          </button>
        </div>

        {/* Quick prompts (compact) */}
        {promptSuggestions.length > 0 && posts.length === 0 && (
          <div className="space-y-2">
            {promptSuggestions.slice(0, 2).map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                onClick={() => openComposer({ groupId: prompt.groupId, content: prompt.content })}
                className="w-full rounded-xl border border-stone-100 bg-white p-3 text-left hover:border-emerald-200"
              >
                <p className="text-sm font-medium text-stone-900">{prompt.title}</p>
              </button>
            ))}
          </div>
        )}

        {/* Feed */}
        <div className="space-y-3">
          {posts.length > 0 ? (
            posts.map((post) => <PostCard key={post.id} post={post} onReact={reactToPost} />)
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-8 text-center">
              <Users className="mx-auto h-8 w-8 text-stone-300" />
              <p className="mt-3 text-sm font-medium text-stone-500">Sin publicaciones todavia</p>
              <button
                type="button"
                onClick={() => openComposer()}
                className="mt-3 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
              >
                Se el primero en compartir
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Composer modal */}
      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="absolute inset-0" onClick={() => setShowComposer(false)} />
          <div className="relative w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-stone-900">Nueva publicacion</h2>
              <button type="button" onClick={() => setShowComposer(false)} className="rounded-lg p-1.5 text-stone-400 hover:text-stone-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <select
                value={composerGroupId}
                onChange={(e) => setComposerGroupId(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none"
              >
                <option value="">Elegir grupo</option>
                {groups.map((g: CommunityGroup) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>

              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Titulo (opcional)"
                className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none"
              />

              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
                placeholder="Conta tu experiencia..."
                className="w-full resize-none rounded-xl border border-stone-200 px-3 py-2.5 text-sm leading-relaxed focus:border-emerald-400 focus:outline-none"
              />

              <label className="flex items-center gap-2 text-sm text-stone-600">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="rounded border-stone-300"
                />
                Publicar anonimamente
              </label>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSubmitPost}
                disabled={!composerGroupId || !newContent.trim() || submitting}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Publicar
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav activeTab="comunidad" />
    </div>
  );
}

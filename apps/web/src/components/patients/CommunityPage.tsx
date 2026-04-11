'use client';

import { usePatientCommunityPage } from '@/hooks/patients/usePatientCommunityPage';
import { communityBrowserService } from '@/lib/patients/services/community.browser';
import type { CommunityComment, CommunityGroup, CommunityPost } from '@/lib/patients/types/community';
import {
  ArrowLeft,
  Bell,
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
import { useCallback, useEffect, useMemo, useState } from 'react';

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

/* ─── Post Card (Feed) ─── */

function PostCard({
  post,
  onReact,
  onOpen,
}: {
  post: CommunityPost;
  onReact: (postId: string) => Promise<void>;
  onOpen: (post: CommunityPost) => void;
}) {
  const [reacting, setReacting] = useState(false);

  async function handleReact(e: React.MouseEvent) {
    e.stopPropagation();
    setReacting(true);
    try { await onReact(post.id); } finally { setReacting(false); }
  }

  const isUpdated = post.updated_at && post.updated_at !== post.created_at;

  return (
    <article
      onClick={() => onOpen(post)}
      className="cursor-pointer overflow-hidden rounded-2xl bg-white shadow-am-sm ring-1 ring-stone-950/[0.03] transition-all hover:shadow-md active:scale-[0.99]"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            post.is_anonymous ? 'bg-stone-100 text-stone-500' : 'bg-sky-50 text-sky-600'
          }`}>
            {post.is_anonymous ? '?' : (post.author_display_name ?? 'P').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm truncate ${post.is_anonymous ? 'font-medium text-stone-500 italic' : 'font-semibold text-stone-900'}`}>
                {post.is_anonymous ? 'Anónimo' : post.author_display_name ?? 'Paciente'}
              </span>
              <span className="text-xs text-stone-300">
                {isUpdated ? `Actualizado ${timeAgo(post.updated_at)}` : timeAgo(post.created_at)}
              </span>
            </div>

            {post.title && (
              <h3 className="mt-2 text-[15px] font-bold text-stone-900">{post.title}</h3>
            )}

            <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
              {post.content.length > 280 ? `${post.content.slice(0, 280)}...` : post.content}
            </p>

            {post.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-600">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-5 border-t border-stone-100/70 px-5 py-2.5 text-xs text-stone-500">
        <button
          type="button"
          onClick={handleReact}
          disabled={reacting}
          className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-sky-500 disabled:opacity-50"
        >
          {reacting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Heart className="h-3.5 w-3.5" />}
          {post.reaction_count}
        </button>
        <span className="inline-flex items-center gap-1.5 font-medium">
          <MessageCircle className="h-3.5 w-3.5" /> {post.comment_count}
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Eye className="h-3.5 w-3.5" /> {post.view_count}
        </span>
      </div>
    </article>
  );
}

/* ─── Post Detail View ─── */

function PostDetailView({
  post,
  onBack,
  onReact,
}: {
  post: CommunityPost;
  onBack: () => void;
  onReact: (postId: string) => Promise<void>;
}) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reacting, setReacting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const data = await communityBrowserService.getComments(post.id);
      setComments(data);
    } catch {
      // silent fail — comments just won't show
    } finally {
      setLoadingComments(false);
    }
  }, [post.id]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  async function handleSubmitComment() {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const newComment = await communityBrowserService.createComment({
        postId: post.id,
        content: commentText.trim(),
        anonymous: isAnonymous,
      });
      setComments((prev) => [...prev, newComment]);
      setCommentText('');
      setIsAnonymous(false);
    } catch {
      // silent fail
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReact() {
    setReacting(true);
    try { await onReact(post.id); } finally { setReacting(false); }
  }

  return (
    <div className="min-h-screen bg-am-surface-50 text-stone-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white shadow-am-xs">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
          <button type="button" onClick={onBack} aria-label="Volver" className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-600">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-sm font-bold text-stone-900">Publicacion</h1>
          <span className="ml-auto rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-semibold text-stone-500">
            {post.group?.name ?? 'General'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-48 pt-6">
        {/* Post content */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-am-sm ring-1 ring-stone-950/[0.03]">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                post.is_anonymous ? 'bg-stone-100 text-stone-500' : 'bg-sky-50 text-sky-600'
              }`}>
                {post.is_anonymous ? '?' : (post.author_display_name ?? 'P').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className={`text-sm ${post.is_anonymous ? 'font-medium text-stone-500 italic' : 'font-semibold text-stone-900'}`}>
                  {post.is_anonymous ? 'Anónimo' : post.author_display_name ?? 'Paciente'}
                </p>
                <p className="text-xs text-stone-400">{timeAgo(post.created_at)}</p>
              </div>
            </div>

            {post.title && (
              <h2 className="mt-4 text-lg font-bold text-stone-900">{post.title}</h2>
            )}

            <p className="mt-3 text-[15px] leading-relaxed text-stone-600 whitespace-pre-line">{post.content}</p>

            {post.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-600">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Reactions bar */}
          <div className="flex items-center gap-5 border-t border-stone-100/70 px-6 py-3 text-xs text-stone-500">
            <button
              type="button"
              onClick={handleReact}
              disabled={reacting}
              className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-sky-500 disabled:opacity-50"
            >
              {reacting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
              {post.reaction_count}
            </button>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <MessageCircle className="h-4 w-4" /> {comments.length || post.comment_count}
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Eye className="h-4 w-4" /> {post.view_count}
            </span>
          </div>
        </div>

        {/* Comments section */}
        <div className="mt-6">
          <p className="text-[13px] font-semibold uppercase tracking-widest text-stone-400">
            Comentarios ({comments.length || post.comment_count})
          </p>

          {loadingComments ? (
            <div className="mt-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-stone-300" />
            </div>
          ) : comments.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-stone-200 bg-white p-8 text-center">
              <MessageCircle className="mx-auto h-6 w-6 text-stone-300" />
              <p className="mt-2 text-sm text-stone-400">Sin comentarios todavia. Se el primero.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="overflow-hidden rounded-xl bg-white shadow-am-xs ring-1 ring-stone-950/[0.03]"
                >
                  <div className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        comment.author_role === 'doctor'
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-stone-100 text-stone-500'
                      }`}>
                        {comment.is_anonymous ? '?' : (comment.author_display_name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm truncate ${comment.is_anonymous ? 'font-medium text-stone-500 italic' : 'font-semibold text-stone-900'}`}>
                            {comment.is_anonymous ? 'Anónimo' : comment.author_display_name ?? 'Paciente'}
                          </span>
                          {comment.author_role === 'doctor' && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                              Medico{comment.doctor_specialty ? ` · ${comment.doctor_specialty}` : ''}
                            </span>
                          )}
                          <span className="text-xs text-stone-300">{timeAgo(comment.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-stone-600">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Comment input — fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white shadow-am-sticky-top">
        <div className="mx-auto max-w-2xl px-5 py-3">
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Escribi tu comentario..."
                rows={1}
                className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition-all placeholder:text-stone-300 focus:border-stone-400 focus:bg-white focus:ring-2 focus:ring-stone-900/5"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
              />
              <label className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-400">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="rounded border-stone-300"
                />
                Anonimo
              </label>
            </div>
            <button
              type="button"
              onClick={handleSubmitComment}
              disabled={!commentText.trim() || submitting}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-white shadow-sm transition-all hover:bg-stone-800 active:scale-95 disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Community Page ─── */

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
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);

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

  /* ─── Post Detail View ─── */
  if (selectedPost) {
    return (
      <PostDetailView
        post={selectedPost}
        onBack={() => setSelectedPost(null)}
        onReact={reactToPost}
      />
    );
  }

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="min-h-screen bg-am-surface-50">
        <div className="flex min-h-[50vh] sm:min-h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
        
      </div>
    );
  }

  /* ─── Feed View ─── */
  return (
    <div className="min-h-screen bg-am-surface-50 text-stone-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white shadow-am-xs">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <a href="/" className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-600">
              <ChevronLeft className="h-4 w-4" />
            </a>
            <h1 className="text-lg font-bold">Comunidad</h1>
          </div>
          <div className="flex items-center gap-3">
            <a href="/patients/settings" className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-600">
              <Bell className="h-5 w-5" />
            </a>
            <button
              type="button"
              onClick={() => openComposer()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-stone-800 active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" />
              Publicar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-5 pb-28 pt-5">
        {primaryError && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{primaryError}</div>
        )}

        {/* Groups — horizontal scroll chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveGroupId(null)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              activeGroupId === null ? 'bg-stone-900 text-white shadow-sm' : 'bg-white text-stone-500 ring-1 ring-stone-200'
            }`}
          >
            Todos
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setActiveGroupId(group.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                activeGroupId === group.id
                  ? 'bg-stone-900 text-white shadow-sm'
                  : membershipSet.has(group.id)
                    ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                    : 'bg-white text-stone-500 ring-1 ring-stone-200'
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>

        {/* Recommended groups */}
        {recommendedGroups.length > 0 && !activeGroupId && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Sugeridos para vos</p>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
              {recommendedGroups.slice(0, 3).map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroupId(group.id)}
                  className="shrink-0 w-56 overflow-hidden rounded-2xl bg-white p-4 text-left shadow-am-sm ring-1 ring-stone-950/[0.03] transition-all hover:shadow-md active:scale-[0.98]"
                >
                  <p className="text-sm font-bold text-stone-900 line-clamp-2 h-10">{group.name}</p>
                  <div className="mt-2.5 flex items-center gap-2.5 text-xs text-stone-400">
                    <Users className="h-3 w-3" /> {group.member_count}
                    <MessageCircle className="h-3 w-3 ml-1" /> {group.post_count}
                  </div>
                  {group.reason && (
                    <p className="mt-2 text-xs font-medium text-sky-600 truncate">{group.reason}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sort */}
        <div className="flex gap-2">
          {(['recent', 'popular'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSortBy(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                sortBy === s ? 'bg-stone-900 text-white' : 'bg-white text-stone-400 ring-1 ring-stone-200'
              }`}
            >
              {s === 'recent' ? 'Recientes' : 'Populares'}
            </button>
          ))}
        </div>

        {/* Quick prompts */}
        {promptSuggestions.length > 0 && posts.length === 0 && (
          <div className="space-y-2">
            {promptSuggestions.slice(0, 2).map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                onClick={() => openComposer({ groupId: prompt.groupId, content: prompt.content })}
                className="w-full rounded-xl bg-white p-4 text-left shadow-am-sm ring-1 ring-stone-950/[0.03] transition-all hover:shadow-md"
              >
                <p className="text-sm font-semibold text-stone-900">{prompt.title}</p>
              </button>
            ))}
          </div>
        )}

        {/* Feed */}
        <div className="space-y-3">
          {posts.length > 0 ? (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onReact={reactToPost}
                onOpen={setSelectedPost}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-10 text-center">
              <Users className="mx-auto h-8 w-8 text-stone-300" />
              <p className="mt-3 text-sm font-medium text-stone-400">Sin publicaciones todavia</p>
              <button
                type="button"
                onClick={() => openComposer()}
                className="mt-3 text-sm font-bold text-sky-500 transition-colors hover:text-sky-600"
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
          <div className="relative w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-stone-900">Nueva publicacion</h2>
              <button type="button" onClick={() => setShowComposer(false)} className="rounded-full p-2 text-stone-400 hover:bg-stone-50 hover:text-stone-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <select
                value={composerGroupId}
                onChange={(e) => setComposerGroupId(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition-all focus:border-stone-400 focus:ring-2 focus:ring-stone-900/5"
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
                className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm shadow-sm outline-none transition-all placeholder:text-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-900/5"
              />

              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
                placeholder="Conta tu experiencia..."
                className="w-full resize-none rounded-xl border border-stone-200 px-4 py-3 text-sm leading-relaxed shadow-sm outline-none transition-all placeholder:text-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-900/5"
              />

              <label className="flex items-center gap-2 text-sm text-stone-500">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="rounded border-stone-300"
                />
                Publicar anonimamente
              </label>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleSubmitPost}
                disabled={!composerGroupId || !newContent.trim() || submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-stone-800 active:scale-[0.97] disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Publicar
              </button>
            </div>
          </div>
        </div>
      )}

      
    </div>
  );
}

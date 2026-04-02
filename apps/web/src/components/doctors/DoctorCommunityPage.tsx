'use client';

import { ClientWrapper } from '@/components/doctors/ClientWrapper';
import { doctorCommunityBrowserService } from '@/lib/doctors/services/community.browser';
import type { CommunityComment, CommunityPost } from '@/lib/patients/types/community';
import { ArrowLeft, ChevronLeft, Eye, Loader2, MessageCircle, Send } from 'lucide-react';
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

function DoctorPostCard({
  post,
  onOpen,
}: {
  post: CommunityPost;
  onOpen: (post: CommunityPost) => void;
}) {
  return (
    <article
      onClick={() => onOpen(post)}
      className="cursor-pointer overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-stone-950/[0.03] transition-all hover:shadow-md active:scale-[0.99]"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-bold text-sky-700">
            {post.is_anonymous ? '?' : (post.author_display_name ?? 'P').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-stone-900">
                {post.is_anonymous ? 'Anonimo' : post.author_display_name ?? 'Paciente'}
              </span>
              <span className="text-xs text-stone-300">{timeAgo(post.created_at)}</span>
            </div>

            {post.title && (
              <h2 className="mt-2 text-[15px] font-bold text-stone-900">{post.title}</h2>
            )}

            <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
              {post.content.length > 280 ? `${post.content.slice(0, 280)}...` : post.content}
            </p>

            {post.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5 border-t border-stone-100/70 px-5 py-2.5 text-xs text-stone-400">
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

function DoctorPostDetailView({
  post,
  onBack,
  onCommentCreated,
}: {
  post: CommunityPost;
  onBack: () => void;
  onCommentCreated: (comment: CommunityComment) => void;
}) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const data = await doctorCommunityBrowserService.getComments(post.id);
      setComments(data);
      setCommentError(null);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'No se pudieron cargar los comentarios');
    } finally {
      setLoadingComments(false);
    }
  }, [post.id]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  async function handleSubmitComment() {
    if (!commentText.trim() || submitting) return;

    setSubmitting(true);
    setCommentError(null);
    try {
      const newComment = await doctorCommunityBrowserService.createComment({
        postId: post.id,
        content: commentText.trim(),
      });
      setComments((prev) => [...prev, newComment]);
      setCommentText('');
      onCommentCreated(newComment);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'No se pudo enviar la respuesta');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-stone-900">
      <header className="sticky top-0 z-30 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <button type="button" onClick={onBack} className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-600">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-stone-900">Responder en comunidad</h1>
            <p className="text-xs text-stone-400">Tu respuesta suma actividad al ranking medico.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-48 pt-6">
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-stone-950/[0.03]">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-bold text-sky-700">
                {post.is_anonymous ? '?' : (post.author_display_name ?? 'P').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900">
                  {post.is_anonymous ? 'Anonimo' : post.author_display_name ?? 'Paciente'}
                </p>
                <p className="text-xs text-stone-400">{timeAgo(post.created_at)}</p>
              </div>
            </div>

            {post.title && (
              <h2 className="mt-4 text-lg font-bold text-stone-900">{post.title}</h2>
            )}

            <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-stone-600">{post.content}</p>

            {post.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-5 border-t border-stone-100/70 px-6 py-3 text-xs text-stone-400">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <MessageCircle className="h-4 w-4" /> {comments.length || post.comment_count}
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Eye className="h-4 w-4" /> {post.view_count}
            </span>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[13px] font-semibold uppercase tracking-widest text-stone-400">
            Comentarios ({comments.length || post.comment_count})
          </p>

          {loadingComments ? (
            <div className="mt-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-stone-300" />
            </div>
          ) : commentError && comments.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {commentError}
            </div>
          ) : comments.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-stone-200 bg-white p-8 text-center">
              <MessageCircle className="mx-auto h-6 w-6 text-stone-300" />
              <p className="mt-2 text-sm text-stone-400">Sin comentarios todavia. Responde primero.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-stone-950/[0.03]"
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
                          <span className="truncate text-sm font-semibold text-stone-900">
                            {comment.is_anonymous ? 'Anonimo' : comment.author_display_name ?? 'Paciente'}
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

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        <div className="mx-auto max-w-3xl px-5 py-3">
          {commentError && (
            <p className="mb-2 text-xs text-red-600">{commentError}</p>
          )}
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Escribi una respuesta clara y util para la comunidad..."
                rows={1}
                className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition-all placeholder:text-stone-300 focus:border-stone-400 focus:bg-white focus:ring-2 focus:ring-stone-900/5"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
              />
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

function DoctorCommunityScreen({ initialPostId }: { initialPostId?: string | null }) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(initialPostId ?? null);

  const syncUrl = useCallback((postId: string | null) => {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    if (postId) {
      url.searchParams.set('post', postId);
    } else {
      url.searchParams.delete('post');
    }

    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await doctorCommunityBrowserService.getPosts({ limit: 24, sortBy: 'recent' });
      setPosts(data);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'No se pudieron cargar las preguntas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialPostId && typeof window !== 'undefined') {
      const initialPostId = new URL(window.location.href).searchParams.get('post');
      if (initialPostId) {
        setSelectedPostId(initialPostId);
      }
    }

    fetchPosts();
  }, [fetchPosts, initialPostId]);

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) ?? null,
    [posts, selectedPostId],
  );

  const openPost = useCallback((post: CommunityPost) => {
    setSelectedPostId(post.id);
    syncUrl(post.id);
  }, [syncUrl]);

  const closePost = useCallback(() => {
    setSelectedPostId(null);
    syncUrl(null);
  }, [syncUrl]);

  const handleCommentCreated = useCallback((comment: CommunityComment) => {
    setPosts((prev) => prev.map((post) => (
      post.id === comment.post_id
        ? { ...post, comment_count: post.comment_count + 1 }
        : post
    )));
  }, []);

  const handlePortalBack = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = '/doctors/dashboard';
  }, []);

  if (selectedPost) {
    return (
      <DoctorPostDetailView
        post={selectedPost}
        onBack={closePost}
        onCommentCreated={handleCommentCreated}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f8fa]">
        <div className="flex min-h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-stone-900">
      <header className="sticky top-0 z-30 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={handlePortalBack} className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-600">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold">Preguntas de la comunidad</h1>
              <p className="text-sm text-stone-500">Responde desde el portal medico sin salir del flujo correcto.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-5 pb-16 pt-5">
        <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-stone-950/[0.03]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Ranking y comunidad</p>
          <h2 className="mt-2 text-xl font-bold text-stone-900">Casos abiertos para responder</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            Las respuestas medicas se cargan por la ruta de doctores y quedan disponibles para el ranking comunitario.
          </p>
        </section>

        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="space-y-3">
          {posts.length > 0 ? (
            posts.map((post) => (
              <DoctorPostCard key={post.id} post={post} onOpen={openPost} />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-10 text-center">
              <MessageCircle className="mx-auto h-8 w-8 text-stone-300" />
              <p className="mt-3 text-sm font-medium text-stone-400">No hay preguntas disponibles ahora.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function DoctorCommunityPage({ initialPostId }: { initialPostId?: string | null }) {
  return (
    <ClientWrapper>
      <DoctorCommunityScreen initialPostId={initialPostId} />
    </ClientWrapper>
  );
}

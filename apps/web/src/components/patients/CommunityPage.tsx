'use client';

import BottomNav from '@/components/patients/layout/BottomNav';
import { usePatientCommunityPage } from '@/hooks/patients/usePatientCommunityPage';
import type { CommunityGroup, CommunityPost } from '@/lib/patients/types/community';
import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  Eye,
  Heart,
  Layers3,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
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

function LayerHeader({
  layer,
  title,
  description,
}: {
  layer: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-600">{layer}</p>
        <h2 className="mt-2 font-heading text-3xl text-gray-950">{title}</h2>
      </div>
      <p className="max-w-2xl text-sm leading-6 text-gray-600">{description}</p>
    </div>
  );
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
    try {
      await onReact(post.id);
    } finally {
      setReacting(false);
    }
  }

  return (
    <article className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-[0_18px_60px_rgba(14,165,233,0.08)]">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sm font-semibold text-sky-700">
          {post.is_anonymous ? '?' : (post.author_display_name ?? 'P').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-950">
              {post.is_anonymous ? 'Anónimo' : post.author_display_name ?? 'Paciente'}
            </p>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700">
              {post.group?.name ?? 'Comunidad'}
            </span>
            <span className="text-xs text-gray-400">{timeAgo(post.created_at)}</span>
          </div>

          {post.title ? (
            <h3 className="mt-3 text-lg font-semibold leading-tight text-gray-950">{post.title}</h3>
          ) : null}

          <p className="mt-2 text-sm leading-7 text-gray-600">
            {post.content.length > 320 ? `${post.content.slice(0, 320)}…` : post.content}
          </p>

          {post.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-sky-100 bg-sky-50/70 px-2.5 py-1 text-[11px] font-medium text-sky-700"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <button
              type="button"
              onClick={handleReact}
              disabled={reacting}
              className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-sky-700 disabled:opacity-60"
            >
              {reacting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
              {post.reaction_count}
            </button>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4" />
              {post.comment_count}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Eye className="h-4 w-4" />
              {post.view_count}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function CommunityPage() {
  const {
    displayName,
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
    focusAreas,
    signalCards,
    promptSuggestions,
    summaryStats,
    screeningsStats,
    reportsCount,
    appointmentsCount,
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
    () => new Set(memberships.map((membership) => membership.group_id)),
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
    if (!composerGroupId || !newContent.trim()) {
      return;
    }

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
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900">Cargando comunidad</p>
            <p className="mt-1 text-sm text-gray-500">
              Estamos cruzando agenda, prevención, reportes y conversaciones.
            </p>
          </div>
        </div>
        <BottomNav activeTab="comunidad" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-950">
      <header className="sticky top-0 z-30 border-b border-sky-100 bg-white/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-100 bg-white text-gray-700 transition-colors hover:border-sky-200 hover:text-sky-700"
            >
              <ChevronLeft className="h-5 w-5" />
            </a>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-600">Comunidad</p>
              <h1 className="font-heading text-3xl text-gray-950">Red de pacientes</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openComposer()}
            className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(14,165,233,0.28)] transition hover:bg-sky-600"
          >
            <Plus className="h-4 w-4" />
            Compartir experiencia
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-14 px-5 pb-32 pt-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[36px] border border-sky-100 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_42%),linear-gradient(180deg,#ffffff_0%,#f6fbff_100%)] p-6 shadow-[0_28px_80px_rgba(14,165,233,0.10)] sm:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700">
                <Layers3 className="h-3.5 w-3.5" />
                Comunidad en 7 capas
              </p>
              <h2 className="mt-5 font-heading text-5xl leading-[0.98] text-gray-950 sm:text-6xl">
                {displayName}, tu contexto clínico ya está cargado. Acá venís a sumar apoyo, no a repetir datos.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-gray-600">
                Esta superficie cruza agenda, prevención, informes e historia para mostrarte grupos y conversaciones
                más relevantes. La comunidad acompaña; tu registro médico sigue viviendo en el portal.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {summaryStats.map((stat) => (
                <div key={stat.label} className="rounded-3xl border border-white bg-white/90 px-4 py-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-950">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {focusAreas.map((area) => (
              <article key={area.id} className="rounded-[28px] border border-sky-100 bg-white/92 p-5">
                <p className="text-sm font-semibold text-gray-950">{area.label}</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">{area.description}</p>
              </article>
            ))}
          </div>
        </section>

        {primaryError ? (
          <section className="rounded-[28px] border border-red-200 bg-red-50 p-5 text-sm text-red-900">
            {primaryError}
          </section>
        ) : null}

        <section className="space-y-6">
          <LayerHeader
            layer="Capa 1"
            title="Señales cruzadas"
            description="Agenda, reportes, prevención e historia clínica ya existen. La comunidad los toma como contexto para sugerirte conversaciones más útiles."
          />

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {signalCards.map((card) => (
              <article
                key={card.id}
                className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-[0_14px_40px_rgba(14,165,233,0.07)]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-600">{card.eyebrow}</p>
                <h3 className="mt-3 text-xl font-semibold text-gray-950">{card.title}</h3>
                <p className="mt-3 text-sm leading-7 text-gray-600">{card.description}</p>
                {card.href ? (
                  <a href={card.href} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
                    Abrir módulo
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <LayerHeader
            layer="Capa 2"
            title="Círculos recomendados"
            description="Ordenamos grupos por afinidad con tu contexto actual y por tracción real dentro de la comunidad."
          />

          <div className="grid gap-4 lg:grid-cols-2">
            {recommendedGroups.map((group) => {
              const isActive = activeGroupId === group.id;

              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroupId(isActive ? null : group.id)}
                  className={`rounded-[30px] border p-6 text-left transition ${
                    isActive
                      ? 'border-sky-400 bg-sky-50 shadow-[0_18px_50px_rgba(14,165,233,0.15)]'
                      : 'border-sky-100 bg-white shadow-[0_14px_40px_rgba(14,165,233,0.07)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-600">
                        {group.category ?? 'Comunidad'}
                      </p>
                      <h3 className="mt-3 text-2xl font-semibold text-gray-950">{group.name}</h3>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        group.isMember ? 'bg-gray-950 text-white' : 'bg-sky-100 text-sky-700'
                      }`}
                    >
                      {group.isMember ? 'Activo' : 'Sugerido'}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-gray-600">
                    {group.description ?? 'Grupo moderado para compartir experiencias y recibir apoyo entre pacientes.'}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3 text-sm text-gray-500">
                    <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5">
                      <Users className="h-4 w-4 text-sky-600" />
                      {group.member_count} miembros
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5">
                      <MessageCircle className="h-4 w-4 text-sky-600" />
                      {group.post_count} publicaciones
                    </span>
                  </div>

                  <p className="mt-4 text-sm font-medium text-gray-700">{group.reason}</p>
                </button>
              );
            })}

            {recommendedGroups.length === 0 ? (
              <article className="rounded-[30px] border border-dashed border-sky-200 bg-sky-50/60 p-6 text-sm leading-7 text-gray-600">
                Todavía no hay suficientes grupos activos para personalizar esta capa. La estructura queda lista para
                que, cuando los datos estén, el portal no repita información sino que la use con criterio.
              </article>
            ) : null}
          </div>
        </section>

        <section className="space-y-6">
          <LayerHeader
            layer="Capa 3"
            title="Mapa completo de grupos"
            description="Podés navegar toda la comunidad sin perder el hilo. El filtro actual ordena el feed visible más abajo."
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveGroupId(null)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeGroupId === null ? 'bg-sky-500 text-white' : 'border border-sky-100 bg-white text-gray-700'
              }`}
            >
              Todos los grupos
            </button>
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveGroupId(group.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeGroupId === group.id
                    ? 'bg-sky-500 text-white'
                    : membershipSet.has(group.id)
                      ? 'border border-gray-900 bg-gray-950 text-white'
                      : 'border border-sky-100 bg-white text-gray-700'
                }`}
              >
                {group.name}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <LayerHeader
            layer="Capa 4"
            title="Ritmo del ecosistema"
            description="Un resumen operativo para entender qué tan viva está la red y qué tensión preventiva acompaña hoy."
          />

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-[30px] border border-sky-100 bg-white p-6 shadow-[0_14px_40px_rgba(14,165,233,0.07)]">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl bg-sky-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Prevención</p>
                  <p className="mt-3 text-3xl font-semibold text-gray-950">{screeningsStats.overdue}</p>
                  <p className="mt-2 text-sm text-gray-600">screenings atrasados hoy</p>
                </div>
                <div className="rounded-3xl bg-sky-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Agenda</p>
                  <p className="mt-3 text-3xl font-semibold text-gray-950">{appointmentsCount}</p>
                  <p className="mt-2 text-sm text-gray-600">consultas visibles en tu portal</p>
                </div>
                <div className="rounded-3xl bg-sky-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Reportes</p>
                  <p className="mt-3 text-3xl font-semibold text-gray-950">{reportsCount}</p>
                  <p className="mt-2 text-sm text-gray-600">informes listos para referencia clínica</p>
                </div>
              </div>
            </article>

            <article className="rounded-[30px] border border-sky-100 bg-white p-6 shadow-[0_14px_40px_rgba(14,165,233,0.07)]">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-950">Moderación y privacidad</h3>
                  <p className="mt-3 text-sm leading-7 text-gray-600">
                    Compartí vivencias, hábitos, dudas y aprendizajes. Reservá diagnósticos, documentos sensibles y
                    decisiones terapéuticas para consulta o historia clínica.
                  </p>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="space-y-6">
          <LayerHeader
            layer="Capa 5"
            title="Conversaciones activas"
            description="El feed se reorganiza según el filtro y el criterio de relevancia. No duplica tus datos; suma contexto humano."
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSortBy('recent')}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                sortBy === 'recent' ? 'bg-gray-950 text-white' : 'border border-sky-100 bg-white text-gray-700'
              }`}
            >
              Más recientes
            </button>
            <button
              type="button"
              onClick={() => setSortBy('popular')}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                sortBy === 'popular' ? 'bg-gray-950 text-white' : 'border border-sky-100 bg-white text-gray-700'
              }`}
            >
              Más útiles
            </button>
            {activeGroupId ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-4 py-2 text-sm text-sky-700">
                <Sparkles className="h-4 w-4" />
                Feed filtrado por grupo
              </span>
            ) : null}
          </div>

          <div className="space-y-4">
            {posts.length > 0 ? (
              posts.map((post) => <PostCard key={post.id} post={post} onReact={reactToPost} />)
            ) : (
              <article className="rounded-[30px] border border-dashed border-sky-200 bg-sky-50/70 p-8 text-center">
                <Users className="mx-auto h-10 w-10 text-sky-500" />
                <h3 className="mt-4 text-xl font-semibold text-gray-950">Todavía no hay conversaciones visibles</h3>
                <p className="mt-3 text-sm leading-7 text-gray-600">
                  La página ya está preparada para mezclar apoyo entre pares con tu contexto clínico. Cuando entren
                  publicaciones reales, esta capa las ordenará con criterio.
                </p>
              </article>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <LayerHeader
            layer="Capa 6"
            title="Publicar con criterio"
            description="Sugerimos disparadores que aprovechan tu contexto actual sin arrastrar información sensible que ya está en el portal."
          />

          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <article className="rounded-[30px] border border-sky-100 bg-white p-6 shadow-[0_14px_40px_rgba(14,165,233,0.07)]">
              <h3 className="text-xl font-semibold text-gray-950">Preguntas que sí ayudan</h3>
              <div className="mt-5 space-y-3">
                {promptSuggestions.map((prompt) => (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => openComposer({ groupId: prompt.groupId, content: prompt.content })}
                    className="w-full rounded-3xl border border-sky-100 bg-sky-50/70 p-4 text-left transition hover:border-sky-300 hover:bg-sky-50"
                  >
                    <p className="text-sm font-semibold text-gray-950">{prompt.title}</p>
                    <p className="mt-2 text-sm leading-7 text-gray-600">{prompt.content}</p>
                  </button>
                ))}
              </div>
            </article>

            <article className="rounded-[30px] border border-sky-100 bg-white p-6 shadow-[0_14px_40px_rgba(14,165,233,0.07)]">
              <h3 className="text-xl font-semibold text-gray-950">Guía rápida de publicación</h3>
              <div className="mt-5 space-y-4 text-sm leading-7 text-gray-600">
                <div className="rounded-3xl bg-gray-50 p-4">
                  <p className="font-semibold text-gray-900">Compartí</p>
                  <p>Experiencias, hábitos, barreras, preparación de consulta y estrategias que te ayudaron.</p>
                </div>
                <div className="rounded-3xl bg-gray-50 p-4">
                  <p className="font-semibold text-gray-900">Reservá para consulta</p>
                  <p>Resultados completos, diagnósticos sensibles, decisiones de medicación y archivos identificables.</p>
                </div>
                <button
                  type="button"
                  onClick={() => openComposer()}
                  className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-3 font-semibold text-white shadow-[0_16px_40px_rgba(14,165,233,0.28)] transition hover:bg-sky-600"
                >
                  <Send className="h-4 w-4" />
                  Abrir redactor
                </button>
              </div>
            </article>
          </div>
        </section>

        <section className="space-y-6">
          <LayerHeader
            layer="Capa 7"
            title="Reglas y accesos del portal"
            description="Cerramos la experiencia conectando la conversación social con el resto del ecosistema clínico y operativo."
          />

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
            <a
              href="/patients/appointments"
              className="rounded-[30px] border border-sky-100 bg-white p-6 shadow-[0_14px_40px_rgba(14,165,233,0.07)] transition hover:border-sky-300"
            >
              <CalendarClock className="h-6 w-6 text-sky-600" />
              <h3 className="mt-4 text-xl font-semibold text-gray-950">Volver a agenda</h3>
              <p className="mt-3 text-sm leading-7 text-gray-600">
                Convertí lo que aprendiste acá en preguntas concretas para la próxima consulta.
              </p>
            </a>

            <a
              href="/patients/profile"
              className="rounded-[30px] border border-sky-100 bg-white p-6 shadow-[0_14px_40px_rgba(14,165,233,0.07)] transition hover:border-sky-300"
            >
              <Activity className="h-6 w-6 text-sky-600" />
              <h3 className="mt-4 text-xl font-semibold text-gray-950">Revisar perfil clínico</h3>
              <p className="mt-3 text-sm leading-7 text-gray-600">
                Tu información estructurada vive en perfil e historia. La comunidad no la reemplaza.
              </p>
            </a>

            <article className="rounded-[30px] border border-sky-100 bg-white p-6 shadow-[0_14px_40px_rgba(14,165,233,0.07)]">
              <ShieldCheck className="h-6 w-6 text-sky-600" />
              <h3 className="mt-4 text-xl font-semibold text-gray-950">Regla base</h3>
              <p className="mt-3 text-sm leading-7 text-gray-600">
                La comunidad acompaña decisiones; no reemplaza indicación médica ni documentación clínica oficial.
              </p>
            </article>
          </div>
        </section>
      </main>

      {showComposer ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 backdrop-blur-sm sm:items-center">
          <div className="absolute inset-0" onClick={() => setShowComposer(false)} />
          <div className="relative w-full max-w-2xl rounded-[34px] border border-sky-100 bg-white p-6 shadow-[0_36px_90px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-600">Nueva publicación</p>
                <h2 className="mt-2 font-heading text-3xl text-gray-950">Abrir conversación útil</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-100 text-gray-500 transition hover:text-gray-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-900">Grupo</span>
                <select
                  value={composerGroupId}
                  onChange={(event) => setComposerGroupId(event.target.value)}
                  className="w-full rounded-2xl border border-sky-100 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-sky-300"
                >
                  <option value="">Seleccioná un grupo</option>
                  {groups.map((group: CommunityGroup) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-900">Título</span>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="Ej: Cómo prepararse para una consulta de seguimiento"
                  className="w-full rounded-2xl border border-sky-100 bg-white px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-sky-300"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-900">Contenido</span>
                <textarea
                  value={newContent}
                  onChange={(event) => setNewContent(event.target.value)}
                  rows={6}
                  placeholder="Compartí experiencia, contexto y la pregunta concreta que querés llevar mejor preparada."
                  className="w-full resize-none rounded-2xl border border-sky-100 bg-white px-4 py-3 text-sm leading-7 text-gray-900 outline-none placeholder:text-gray-400 focus:border-sky-300"
                />
              </label>

              <label className="inline-flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(event) => setIsAnonymous(event.target.checked)}
                  className="h-4 w-4 rounded border-sky-200"
                />
                Publicar de forma anónima
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                Elegí experiencias y preguntas. Los resultados clínicos detallados siguen en tu portal médico.
              </p>
              <button
                type="button"
                onClick={handleSubmitPost}
                disabled={!composerGroupId || !newContent.trim() || submitting}
                className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(14,165,233,0.28)] transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? 'Publicando...' : 'Publicar ahora'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav activeTab="comunidad" />
    </div>
  );
}

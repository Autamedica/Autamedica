'use client'

import { useEffect, useState, useCallback } from 'react'
import { Award, Star, TrendingUp, Users, Clock, ThumbsUp, FileText, Medal, Crown, Trophy, ShieldAlert, MessageCircle, Heart, Activity, type LucideIcon } from 'lucide-react'
import { fetchApi, ApiError } from '@/lib/api-client'
import { CommunityQuestionsWidget } from './CommunityQuestionsWidget'

interface RankingMetrics {
  doctor_id: string
  avg_rating: number
  total_reviews: number
  total_consultations: number
  completed_consultations: number
  completion_rate: number
  avg_punctuality: number
  avg_communication: number
  avg_professionalism: number
  avg_clinical_quality: number
  overall_score: number
  rank_position: number | null
  community_replies: number
  community_threads_helped: number
  community_helpful_reactions: number
  community_score: number
}

interface Badge {
  id: string
  doctor_id: string
  badge: string
  level: 'bronze' | 'silver' | 'gold' | 'platinum'
  description: string
  earned_at: string
}

interface RankedDoctor {
  doctor_id: string
  avg_rating: number
  total_reviews: number
  total_consultations: number
  completed_consultations: number
  completion_rate: number
  overall_score: number
  rank_position: number | null
  specialty: string | null
  years_experience: number | null
  first_name: string | null
  last_name: string | null
  is_current_user: boolean
  badges: Badge[]
  community_replies: number
  community_threads_helped: number
  community_helpful_reactions: number
  community_score: number
}

interface RankingData {
  current_doctor: {
    doctor_id: string
    specialty: string
    years_experience: number
    metrics: RankingMetrics | null
    badges: Badge[]
    review_count: number
  } | null
  ranked_doctors: RankedDoctor[]
}

/* ─── Achievement Badges ─── */

const BADGE_CONFIG: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  clinical_excellence: { label: 'Excelencia Clínica', icon: Award, color: 'text-blue-600' },
  patient_favorite: { label: 'Favorito de Pacientes', icon: Heart, color: 'text-rose-500' },
  punctuality_star: { label: 'Puntualidad', icon: Clock, color: 'text-emerald-600' },
  high_volume: { label: 'Alto Volumen', icon: TrendingUp, color: 'text-amber-600' },
  mentor: { label: 'Mentor', icon: Star, color: 'text-violet-600' },
  early_adopter: { label: 'Pionero Digital', icon: Crown, color: 'text-indigo-600' },
  zero_no_show: { label: 'Cero Ausencias', icon: ShieldAlert, color: 'text-teal-600' },
  telemedicine_pioneer: { label: 'Pionero Telemedicina', icon: Activity, color: 'text-sky-600' },
}

function AchievementBadge({ badge }: { badge: Badge }) {
  const config = BADGE_CONFIG[badge.badge] || { label: badge.badge, icon: Medal, color: 'text-am-surface-600' }
  const Icon = config.icon

  const tierStyles = {
    bronze: 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200/60 shadow-amber-500/5',
    silver: 'bg-gradient-to-br from-slate-50 to-blue-50 border-slate-200/60 shadow-slate-500/5',
    gold: 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-300/60 shadow-yellow-500/10',
    platinum: 'bg-gradient-to-br from-indigo-50/50 to-slate-50 border-indigo-200/60 shadow-indigo-500/10 ring-1 ring-indigo-500/5',
  }

  const iconTierStyles = {
    bronze: 'bg-gradient-to-br from-amber-500 to-amber-700 shadow-amber-500/20',
    silver: 'bg-gradient-to-br from-slate-400 to-slate-600 shadow-slate-400/20',
    gold: 'bg-gradient-to-br from-yellow-400 to-amber-600 shadow-yellow-400/30',
    platinum: 'bg-gradient-to-br from-slate-200 to-indigo-400 shadow-indigo-400/30',
  }

  return (
    <div className={`group relative flex flex-col items-center p-4 rounded-2xl border transition-all hover:-translate-y-1 hover:shadow-md ${tierStyles[badge.level]}`}>
      <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-110 ${iconTierStyles[badge.level]}`}>
        <Icon className={`h-6 w-6 ${badge.level === 'platinum' ? 'text-indigo-950' : 'text-white'}`} />
      </div>
      
      <div className="text-center">
        <p className="text-sm font-bold text-am-surface-900 leading-tight">{config.label}</p>
        <p className="mt-1 text-[10px] font-medium text-am-surface-500 line-clamp-2 min-h-[2.5rem] leading-relaxed">
          {badge.description}
        </p>
      </div>

      <div className="mt-2 flex w-full items-center justify-between gap-2 border-t border-am-surface-900/5 pt-2">
        <span className={`text-[9px] font-bold uppercase tracking-wider ${
          badge.level === 'platinum' ? 'text-indigo-600' : 
          badge.level === 'gold' ? 'text-amber-600' : 
          badge.level === 'silver' ? 'text-slate-500' : 'text-amber-800'
        }`}>
          {badge.level}
        </span>
        <span className="text-[9px] text-am-surface-400 font-medium">
          {new Date(badge.earned_at).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}
        </span>
      </div>

      {badge.level === 'platinum' && (
        <div className="absolute -right-1 -top-1">
          <div className="flex h-5 w-5 animate-pulse items-center justify-center rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/50">
            <Crown className="h-3 w-3 text-white" />
          </div>
        </div>
      )}
    </div>
  )
}

export function MedicalRankingPanel() {
  const [data, setData] = useState<RankingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRanking = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true)
    try {
      const result = await fetchApi<RankingData>('/api/doctors/ranking')
      setData(result)
      setError(null)
    } catch (err) {
      if (isInitial) {
        setError(err instanceof ApiError && err.status === 401
          ? 'unauthorized'
          : (err instanceof Error ? err.message : 'Error de conexion'))
      }
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRanking(true)
  }, [fetchRanking])

  useEffect(() => {
    const interval = setInterval(() => fetchRanking(false), 60_000)
    return () => clearInterval(interval)
  }, [fetchRanking])

  if (loading) {
    return (
      <div className="h-full bg-am-surface-50 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 am-skeleton rounded-lg" />
          <div className="space-y-2 flex-1">
            <div className="h-5 w-48 am-skeleton rounded" />
            <div className="h-4 w-64 am-skeleton rounded" />
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-1/2 space-y-3">
            <div className="h-6 w-36 am-skeleton rounded" />
            <div className="h-24 am-skeleton rounded-2xl" />
            <div className="h-24 am-skeleton rounded-2xl" />
          </div>
          <div className="w-full lg:w-1/2 space-y-3">
            <div className="h-6 w-36 am-skeleton rounded" />
            <div className="h-20 am-skeleton rounded-2xl" />
            <div className="h-20 am-skeleton rounded-2xl" />
            <div className="h-20 am-skeleton rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-am-surface-200 bg-white p-12 text-center shadow-am-sm">
        <div className="relative mb-6">
          <div className="absolute -inset-6 rounded-full bg-amber-50/60" />
          <div className="absolute -inset-3 rounded-full bg-amber-50" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
            <ShieldAlert className="h-7 w-7 text-white" />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-am-surface-900">
          {error === 'unauthorized' ? 'Sesion requerida' : 'Error al cargar ranking'}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-am-surface-500">
          {error === 'unauthorized'
            ? 'Inicia sesion para ver el ranking de medicos.'
            : (error ?? 'No se pudieron cargar los datos del ranking. Intenta recargar la pagina.')}
        </p>
      </div>
    )
  }

  const { current_doctor, ranked_doctors } = data
  const metrics = current_doctor?.metrics ?? null
  const hasMetrics = metrics && metrics.total_reviews > 0

  const categoryMetrics = hasMetrics ? [
    {
      id: 'satisfaction',
      name: 'Satisfacción',
      value: metrics.avg_rating,
      maxValue: 5,
      icon: <ThumbsUp className="w-4 h-4" />,
    },
    {
      id: 'clinical',
      name: 'Calidad Clínica',
      value: metrics.avg_clinical_quality,
      maxValue: 5,
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'communication',
      name: 'Comunicación',
      value: metrics.avg_communication,
      maxValue: 5,
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'punctuality',
      name: 'Puntualidad',
      value: metrics.avg_punctuality,
      maxValue: 5,
      icon: <Clock className="w-4 h-4" />,
    },
  ] : []

  const getRankIcon = (rank: number | null) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />
    if (rank === 2) return <Trophy className="w-5 h-5 text-am-surface-400" />
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />
    return <span className="text-lg font-bold text-am-surface-500">#{rank ?? '-'}</span>
  }

  const getDoctorName = (doc: RankedDoctor) => {
    if (doc.first_name || doc.last_name) {
      return `${doc.first_name ?? ''} ${doc.last_name ?? ''}`.trim()
    }
    return 'Médico'
  }

  return (
    <div className="h-full bg-am-surface-50 text-am-surface-900">
      <div className="p-6 border-b border-am-surface-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-am-doctor-50 rounded-lg">
              <Award className="w-6 h-6 text-am-doctor-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-am-surface-900">Sistema de Ranking</h1>
              <p className="text-sm text-am-surface-500">Evaluacion y reconocimiento del desempeno medico</p>
            </div>
          </div>
          {metrics && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-2xl font-bold text-am-doctor-600">
                  {metrics.rank_position ? `#${metrics.rank_position}` : '-'}
                </p>
                <p className="text-sm text-am-surface-500">Tu posicion</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-am-surface-900">{metrics.overall_score}</p>
                <p className="text-sm text-am-surface-500">Puntuacion</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row h-[calc(100%-100px)]">
        {/* Panel de metricas personales — solo si el usuario es doctor */}
        {current_doctor && (
          <div className="w-full lg:w-1/2 border-r border-am-surface-200 p-6 overflow-y-auto">
            <h2 className="text-lg font-medium text-am-surface-900 mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-am-doctor-500" />
              Tu Desempeno
            </h2>

            {!hasMetrics ? (
              <div className="bg-white border border-am-surface-200 rounded-2xl shadow-am-sm p-6 text-center">
                <TrendingUp className="w-8 h-8 text-am-surface-400 mx-auto mb-3" />
                <p className="text-am-surface-700 mb-1">Sin evaluaciones aun</p>
                <p className="text-sm text-am-surface-400">
                  Las metricas se calcularan automaticamente cuando tus pacientes dejen evaluaciones despues de sus consultas.
                </p>
                {metrics && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="bg-am-surface-50 rounded-2xl p-3">
                      <p className="text-2xl font-bold text-am-surface-800">{metrics.total_consultations}</p>
                      <p className="text-xs text-am-surface-500">Consultas totales</p>
                    </div>
                    <div className="bg-am-surface-50 rounded-2xl p-3">
                      <p className="text-2xl font-bold text-am-surface-800">{metrics.completed_consultations}</p>
                      <p className="text-xs text-am-surface-500">Completadas</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-white border border-am-surface-200 rounded-2xl shadow-am-sm p-3">
                    <p className="text-2xl font-bold text-am-surface-800">{metrics.total_consultations}</p>
                    <p className="text-xs text-am-surface-500">Consultas</p>
                  </div>
                  <div className="bg-white border border-am-surface-200 rounded-2xl shadow-am-sm p-3">
                    <p className="text-2xl font-bold text-am-surface-800">{metrics.completion_rate}%</p>
                    <p className="text-xs text-am-surface-500">Tasa de completitud</p>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  {categoryMetrics.map((metric) => (
                    <div key={metric.id} className="bg-white border border-am-surface-200 rounded-2xl shadow-am-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {metric.icon}
                          <span className="font-medium text-am-surface-900">{metric.name}</span>
                        </div>
                        <span className="text-lg font-bold text-am-surface-900">
                          {metric.value.toFixed(1)}
                          <span className="text-sm text-am-surface-500 font-normal">/{metric.maxValue}</span>
                        </span>
                      </div>
                      <div className="w-full bg-am-surface-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-am-doctor-500 to-am-doctor-600"
                          style={{ width: `${(metric.value / metric.maxValue) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Badges */}
            {current_doctor.badges.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-am-surface-900 uppercase tracking-wider flex items-center gap-2">
                    <Medal className="w-4 h-4 text-am-doctor-500" />
                    Insignias y Logros
                  </h3>
                  <span className="text-xs font-medium text-am-surface-400">
                    {current_doctor.badges.length} obtenidos
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {current_doctor.badges.map((badge) => (
                    <AchievementBadge key={badge.id} badge={badge} />
                  ))}
                </div>
              </div>
            )}

            {/* Preguntas de la comunidad */}
            <div className="mt-8">
              <CommunityQuestionsWidget />
            </div>
          </div>
        )}

        {/* Panel de rankings — full width si no hay doctor, mitad si hay */}
        <div className={`${current_doctor ? 'w-full lg:w-1/2' : 'w-full'} p-6 overflow-y-auto bg-white/50`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-am-surface-900 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-am-doctor-500" />
              Líderes de la Comunidad
            </h2>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-am-doctor-50 rounded-full border border-am-doctor-100">
              <div className="w-1.5 h-1.5 rounded-full bg-am-doctor-500 animate-pulse" />
              <span className="text-[10px] font-bold text-am-doctor-700 uppercase tracking-tight">En vivo</span>
            </div>
          </div>

          {ranked_doctors.length === 0 ? (
            <div className="bg-white border border-am-surface-200 rounded-3xl shadow-am-sm p-12 text-center">
              <Trophy className="w-12 h-12 text-am-surface-200 mx-auto mb-4" />
              <p className="text-am-surface-900 font-bold">Aún no hay líderes registrados</p>
              <p className="text-sm text-am-surface-500 mt-2 max-w-[240px] mx-auto leading-relaxed">
                El ranking se actualiza automáticamente con el desempeño clínico y comunitario.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {ranked_doctors.map((doctor) => (
                <div
                  key={doctor.doctor_id}
                  className={`relative p-5 rounded-3xl border transition-all hover:shadow-lg ${
                    doctor.is_current_user
                      ? 'bg-gradient-to-br from-am-doctor-50/80 to-white border-am-doctor-200 ring-1 ring-am-doctor-300 shadow-am-md'
                      : 'bg-white border-am-surface-100 hover:border-am-surface-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-center">
                        <div className="flex h-10 w-10 items-center justify-center">
                          {getRankIcon(doctor.rank_position)}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-bold text-am-surface-900 flex items-center gap-2">
                          {getDoctorName(doctor)}
                          {doctor.is_current_user && (
                            <span className="text-[9px] bg-am-doctor-600 text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm shadow-am-doctor-500/20">TU</span>
                          )}
                        </h3>
                        <p className="text-xs font-medium text-am-surface-500 uppercase tracking-wide">{doctor.specialty ?? 'Generalista'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-baseline justify-end gap-1">
                        <span className="text-xl font-black text-am-surface-900">{doctor.overall_score}</span>
                        <span className="text-[10px] font-bold text-am-surface-400 uppercase tracking-tighter">pts</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 overflow-x-hidden">
                      <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 rounded-lg border border-amber-100">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span className="text-xs font-bold text-amber-700">{doctor.avg_rating.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-am-surface-400 font-medium whitespace-nowrap">
                        <Users className="w-3.5 h-3.5" />
                        <span className="text-xs">{doctor.total_reviews}</span>
                      </div>
                      {doctor.community_replies > 0 && (
                        <div className="flex items-center gap-1.5 text-am-doctor-600 font-bold whitespace-nowrap">
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span className="text-xs">{doctor.community_replies}</span>
                        </div>
                      )}
                    </div>

                    {doctor.badges.length > 0 && (
                      <div className="flex items-center -space-x-2 shrink-0">
                        {doctor.badges.slice(0, 4).map((badge) => {
                          const badgeConfig = BADGE_CONFIG[badge.badge]
                          const BadgeIcon = badgeConfig?.icon || Medal
                          const tierColors = {
                            bronze: 'from-amber-500 to-amber-700',
                            silver: 'from-slate-400 to-slate-600',
                            gold: 'from-yellow-400 to-amber-600',
                            platinum: 'from-indigo-400 to-indigo-600',
                          }
                          return (
                            <div
                              key={badge.id}
                              className={`relative w-7 h-7 rounded-full bg-gradient-to-br ${tierColors[badge.level]} border-2 border-white flex items-center justify-center shadow-sm hover:z-10 hover:scale-110 transition-transform cursor-help`}
                              title={`${badgeConfig?.label || badge.badge} (${badge.level})`}
                            >
                              <BadgeIcon className="w-3.5 h-3.5 text-white" />
                            </div>
                          )
                        })}
                        {doctor.badges.length > 4 && (
                          <div className="w-7 h-7 rounded-full bg-am-surface-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-am-surface-500 shadow-sm">
                            +{doctor.badges.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
